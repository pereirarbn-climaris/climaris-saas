import { jsPDF } from "jspdf";
import { dataUrlToJsPdfImage, resolveLogoAsset, type ImageBase64Asset } from "./imageBase64";
import {
  generateQrLabelLayout,
  type QrLabelLayoutModel,
} from "./generateQrLabelLayout";

export type QrLabelPrintFormat = "a4_grid" | "a4_sample_2x2" | "thermal_58";

export type QrLabelPrintItem = {
  codeId: string;
  logoUrl?: string | null;
};

/** Folha A4: 4 colunas × 7 linhas = 28 etiquetas. */
export const A4_LABELS_PER_PAGE = 28;
export const A4_GRID_COLS = 4;
export const A4_GRID_ROWS = 7;

type LabelRaster = { dataUrl: string; widthMm: number; heightMm: number };

function addCanvasToPdf(
  doc: jsPDF,
  dataUrl: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const parsed = dataUrlToJsPdfImage(dataUrl);
  if (!parsed) return;
  doc.addImage(parsed.base64, parsed.format, x, y, w, h, undefined, "FAST");
}

function drawLabelInCell(
  doc: jsPDF,
  raster: LabelRaster,
  cellLeft: number,
  cellTop: number,
  cellW: number,
  cellH: number,
  pad: number,
): void {
  const labelW = cellW - pad * 2;
  const labelH = cellH - pad * 2;
  const scale = Math.min(labelW / raster.widthMm, labelH / raster.heightMm, 1);
  const drawW = raster.widthMm * scale;
  const drawH = raster.heightMm * scale;
  const imgX = cellLeft + (cellW - drawW) / 2;
  const imgY = cellTop + pad;
  addCanvasToPdf(doc, raster.dataUrl, imgX, imgY, drawW, drawH);
}

async function mapPool<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

function rasterWidthPx(layoutModel: QrLabelLayoutModel, targetWidthMm: number): number {
  const pxPerMm = layoutModel === "logo_above" ? 7 : 6;
  return Math.max(96, Math.round(targetWidthMm * pxPerMm));
}

async function rasterizeLabel(
  item: QrLabelPrintItem,
  layoutModel: QrLabelLayoutModel,
  targetWidthMm: number,
  logoAsset: ImageBase64Asset | null,
  qrCache: Map<string, HTMLImageElement>,
  drawBorder: boolean,
): Promise<LabelRaster> {
  const widthPx = rasterWidthPx(layoutModel, targetWidthMm);
  const layout = await generateQrLabelLayout({
    modelType: layoutModel,
    logoUrl: item.logoUrl ?? null,
    codeId: item.codeId,
    widthPx,
    logoAsset,
    qrImageCache: qrCache,
    drawBorder,
  });
  const aspect = layout.heightPx / layout.widthPx;
  return { dataUrl: layout.dataUrl, widthMm: targetWidthMm, heightMm: targetWidthMm * aspect };
}

async function preloadBatchAssets(
  items: QrLabelPrintItem[],
  layoutModel: QrLabelLayoutModel,
): Promise<{ logoAsset: ImageBase64Asset | null; qrCache: Map<string, HTMLImageElement> }> {
  const logoUrl = items.find((i) => i.logoUrl)?.logoUrl ?? null;
  const wantsLogo = layoutModel !== "standard";
  const logoAsset =
    wantsLogo && logoUrl ? await resolveLogoAsset(logoUrl) : null;
  return { logoAsset, qrCache: new Map() };
}

async function batchRasterLabels(
  items: QrLabelPrintItem[],
  layoutModel: QrLabelLayoutModel,
  labelWmm: number,
  drawBorder: boolean,
): Promise<LabelRaster[]> {
  const { logoAsset, qrCache } = await preloadBatchAssets(items, layoutModel);
  return mapPool(
    items,
    (item) => rasterizeLabel(item, layoutModel, labelWmm, logoAsset, qrCache, drawBorder),
    12,
  );
}

async function buildA4GridPdf(
  items: QrLabelPrintItem[],
  layoutModel: QrLabelLayoutModel,
  opts: { cols: number; rows: number; title: string },
): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true, putOnlyUsedFonts: true });
  const pageW = 210;
  const pageH = 297;
  const marginX = 7;
  const marginTop = 8;
  const marginBottom = 6;
  const headerH = 7;
  const { cols, rows, title } = opts;
  const perPage = cols * rows;
  const gridTop = marginTop + headerH;
  const gridH = pageH - gridTop - marginBottom;
  const cellW = (pageW - marginX * 2) / cols;
  const cellH = gridH / rows;
  const pad = 1;
  const labelW = cellW - pad * 2;

  const rasters = await batchRasterLabels(items, layoutModel, labelW, true);

  let pageIndex = 0;
  for (let i = 0; i < items.length; i += 1) {
    if (i > 0 && i % perPage === 0) {
      doc.addPage("a4");
      pageIndex += 1;
    }
    const pos = i % perPage;
    const col = pos % cols;
    const row = Math.floor(pos / cols);
    if (pos === 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(title, marginX, marginTop);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.text(`Pagina ${pageIndex + 1} - ${items.length} etiqueta(s)`, marginX, marginTop + 4);
    }

    const cellLeft = marginX + col * cellW;
    const cellTop = gridTop + row * cellH;
    drawLabelInCell(doc, rasters[i], cellLeft, cellTop, cellW, cellH, pad);
  }

  return doc.output("blob");
}

export async function buildA4Sample2x2Pdf(
  items: QrLabelPrintItem[],
  layoutModel: QrLabelLayoutModel,
): Promise<Blob> {
  const sample = items.slice(0, 4);
  if (!sample.length) throw new Error("Selecione ao menos uma etiqueta para a amostra.");
  return buildA4GridPdf(sample, layoutModel, {
    cols: 2,
    rows: 2,
    title: "Amostra etiquetas QR (2x2)",
  });
}

async function buildA4FullPdf(items: QrLabelPrintItem[], layoutModel: QrLabelLayoutModel): Promise<Blob> {
  return buildA4GridPdf(items, layoutModel, {
    cols: A4_GRID_COLS,
    rows: A4_GRID_ROWS,
    title: "Etiquetas QR - Climaris",
  });
}

async function buildThermal58Pdf(items: QrLabelPrintItem[], layoutModel: QrLabelLayoutModel): Promise<Blob> {
  const widthMm = 58;
  const marginMm = 2;
  const labelW = widthMm - marginMm * 2;

  const rasters = await batchRasterLabels(items, layoutModel, labelW, true);
  const labelHeightMm = Math.max(40, rasters[0].heightMm + marginMm * 2);
  const doc = new jsPDF({ unit: "mm", format: [widthMm, labelHeightMm], compress: true, putOnlyUsedFonts: true });

  for (let i = 0; i < items.length; i += 1) {
    if (i > 0) doc.addPage([widthMm, labelHeightMm]);
    const raster = rasters[i];
    const drawH = Math.min(raster.heightMm, labelHeightMm - marginMm * 2);
    const drawW = raster.widthMm * (drawH / raster.heightMm);
    const imgX = (widthMm - drawW) / 2;
    const imgY = marginMm;
    addCanvasToPdf(doc, raster.dataUrl, imgX, imgY, drawW, drawH);
  }
  return doc.output("blob");
}

export async function buildQrLabelsPdfBlob(
  items: QrLabelPrintItem[],
  format: QrLabelPrintFormat,
  layoutModel: QrLabelLayoutModel = "standard",
): Promise<Blob> {
  if (!items.length) throw new Error("Nenhuma etiqueta para imprimir.");
  if (format === "a4_sample_2x2") return buildA4Sample2x2Pdf(items, layoutModel);
  if (format === "thermal_58") return buildThermal58Pdf(items, layoutModel);
  return buildA4FullPdf(items, layoutModel);
}

export type QrLabelPreviewItem = {
  codeId: string;
  dataUrl: string;
  publicUrl: string;
  logoUrl?: string | null;
};

export async function buildQrLabelPreviewItems(
  items: QrLabelPrintItem[],
  layoutModel: QrLabelLayoutModel = "standard",
): Promise<QrLabelPreviewItem[]> {
  const { logoAsset, qrCache } = await preloadBatchAssets(items, layoutModel);
  return mapPool(items.slice(0, 8), async (item) => {
    const layout = await generateQrLabelLayout({
      modelType: layoutModel,
      logoUrl: item.logoUrl ?? null,
      codeId: item.codeId,
      widthPx: 200,
      logoAsset,
      qrImageCache: qrCache,
      drawBorder: true,
    });
    return {
      codeId: item.codeId,
      dataUrl: layout.dataUrl,
      publicUrl: layout.publicUrl,
      logoUrl: item.logoUrl ?? null,
    };
  }, 6);
}
