import QRCode from "qrcode";
import {
  drawImageFitted,
  drawPlaceholder,
  loadAssetImage,
  resolveLogoAsset,
  type ImageBase64Asset,
} from "./imageBase64";
import { buildPublicEquipmentUrl } from "./publicEquipmentUrl";

export type QrLabelLayoutModel = "standard" | "logo_beside" | "logo_above" | "logo_embedded";

export type QrLabelLayoutInput = {
  modelType: QrLabelLayoutModel;
  logoUrl: string | null;
  codeId: string;
  qrCodeData?: string;
  widthPx?: number;
  /** Logo já carregado (evita N requests no PDF em lote). */
  logoAsset?: ImageBase64Asset | null;
  /** Cache de QR por URL pública (reuso no lote). */
  qrImageCache?: Map<string, HTMLImageElement>;
  /** Contorno da etiqueta (impressão). */
  drawBorder?: boolean;
};

export type QrLabelLayoutResult = {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  publicUrl: string;
};

const DEFAULT_WIDTH = 240;

async function qrPngDataUrl(data: string, sizePx: number, highEc: boolean): Promise<string> {
  return QRCode.toDataURL(data, {
    width: sizePx,
    margin: 1,
    errorCorrectionLevel: highEc ? "H" : "M",
    type: "image/png",
  });
}

async function loadQrImage(
  data: string,
  sizePx: number,
  highEc: boolean,
  cache?: Map<string, HTMLImageElement>,
): Promise<HTMLImageElement> {
  const key = `${data}|${sizePx}|${highEc ? "H" : "M"}`;
  const hit = cache?.get(key);
  if (hit) return hit;

  const url = await qrPngDataUrl(data, sizePx, highEc);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Falha ao gerar QR."));
    el.src = url;
  });
  cache?.set(key, img);
  return img;
}

function drawLabelBorder(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
}

/** Altura reservada para o código abaixo do QR (proporcional ao tamanho do QR). */
function codeAreaHeight(qrSize: number): number {
  return Math.max(14, Math.round(qrSize * 0.26));
}

/** Código centralizado sob o QR, com a mesma largura do QR e fonte maior. */
function drawCodeIdUnderQr(
  ctx: CanvasRenderingContext2D,
  codeId: string,
  qrX: number,
  qrY: number,
  qrSize: number,
): void {
  const safeId = codeId.replace(/[^\x20-\x7E]/g, "") || codeId;
  const textW = qrSize;
  const textX = qrX;
  const textY = qrY + qrSize + 2;
  const areaH = codeAreaHeight(qrSize);
  const centerX = textX + textW / 2;

  let fontSize = Math.max(10, Math.min(14, Math.round(qrSize * 0.17)));
  ctx.fillStyle = "#0f172a";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `bold ${fontSize}px Helvetica, Arial, sans-serif`;

  if (ctx.measureText(safeId).width <= textW - 2) {
    const lineY = textY + (areaH - fontSize) / 2;
    ctx.fillText(safeId, centerX, lineY);
    return;
  }

  const lines: string[] = [];
  let chunk = "";
  for (const ch of safeId) {
    const trial = chunk + ch;
    ctx.font = `bold ${fontSize}px Helvetica, Arial, sans-serif`;
    if (ctx.measureText(trial).width > textW - 2 && chunk) {
      lines.push(chunk);
      chunk = ch;
    } else {
      chunk = trial;
    }
  }
  if (chunk) lines.push(chunk);

  while (lines.length > 2 && fontSize > 7) {
    fontSize -= 1;
    lines.length = 0;
    chunk = "";
    for (const ch of safeId) {
      const trial = chunk + ch;
      ctx.font = `bold ${fontSize}px Helvetica, Arial, sans-serif`;
      if (ctx.measureText(trial).width > textW - 2 && chunk) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk = trial;
      }
    }
    if (chunk) lines.push(chunk);
  }

  const lineHeight = fontSize + 1;
  const blockH = lines.length * lineHeight;
  let startY = textY + (areaH - blockH) / 2;
  ctx.font = `bold ${fontSize}px Helvetica, Arial, sans-serif`;
  for (const line of lines.slice(0, 2)) {
    ctx.fillText(line, centerX, startY);
    startY += lineHeight;
  }
}

type LayoutQrCache = Map<string, HTMLImageElement> | undefined;

/** Margens do Modelo 2 — mais espaço à esquerda para o logo não encostar na borda. */
const BESIDE_PAD_LEFT = 8;
const BESIDE_PAD_RIGHT = 5;
const BESIDE_PAD_Y = 5;
const BESIDE_GAP = 5;
/** Logo um pouco menor que o slot do QR (evita corte na borda esquerda). */
const BESIDE_LOGO_SCALE = 0.88;

/** Tamanho do quadrado (logo/QR) no Modelo 2, limitado pela largura e pela altura útil. */
function besideBoxSize(w: number, h: number): number {
  const maxByW = (w - BESIDE_PAD_LEFT - BESIDE_PAD_RIGHT - BESIDE_GAP) / 2;
  let box = Math.floor(maxByW);
  while (box > 24 && BESIDE_PAD_Y + box + codeAreaHeight(box) + BESIDE_PAD_Y > h) box -= 1;
  return Math.max(24, box);
}

/** Modelo 2: logo à esquerda e QR à direita; ID abaixo do QR. */
async function layoutBeside(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  codeId: string,
  publicUrl: string,
  logoAsset: ImageBase64Asset | null,
  qrCache?: LayoutQrCache,
): Promise<void> {
  const boxSize = besideBoxSize(w, h);
  const totalW = boxSize * 2 + BESIDE_GAP;
  const startX = BESIDE_PAD_LEFT + (w - BESIDE_PAD_LEFT - BESIDE_PAD_RIGHT - totalW) / 2;
  const startY = BESIDE_PAD_Y;
  const qrX = startX + boxSize + BESIDE_GAP;

  const logoDraw = Math.round(boxSize * BESIDE_LOGO_SCALE);
  const logoX = startX + Math.round((boxSize - logoDraw) / 2);
  const logoY = startY + Math.round((boxSize - logoDraw) / 2);

  if (logoAsset) {
    try {
      const logoImg = await loadAssetImage(logoAsset);
      drawImageFitted(ctx, logoImg, logoX, logoY, logoDraw, logoDraw);
    } catch {
      drawPlaceholder(ctx, logoX, logoY, logoDraw, logoDraw);
    }
  } else {
    drawPlaceholder(ctx, logoX, logoY, logoDraw, logoDraw);
  }

  const qrImg = await loadQrImage(publicUrl, Math.round(boxSize * 3), false, qrCache);
  ctx.drawImage(qrImg, qrX, startY, boxSize, boxSize);
  drawCodeIdUnderQr(ctx, codeId, qrX, startY, boxSize);
}

/** Modelo 3: logo grande em cima, QR abaixo, ID no rodapé (otimizado para A4 3×8 / 24 etiquetas). */
async function layoutAbove(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  codeId: string,
  publicUrl: string,
  logoAsset: ImageBase64Asset | null,
  qrCache?: LayoutQrCache,
): Promise<void> {
  const pad = 5;
  const gap = 3;
  const innerW = w - pad * 2;
  const logoZoneH = Math.round((h - pad * 2) * (logoAsset ? 0.42 : 0.3));
  const qrSize = Math.min(innerW, Math.round((h - pad * 2 - logoZoneH - gap) * 0.72));
  const codeH = codeAreaHeight(qrSize);
  const logoBox = Math.min(innerW, logoZoneH);
  const logoX = pad + (innerW - logoBox) / 2;

  if (logoAsset) {
    try {
      const logoImg = await loadAssetImage(logoAsset);
      drawImageFitted(ctx, logoImg, logoX, pad, logoBox, logoZoneH);
    } catch {
      drawPlaceholder(ctx, logoX, pad, logoBox, logoZoneH);
    }
  } else {
    drawPlaceholder(ctx, logoX, pad, logoBox, logoZoneH);
  }

  const qrImg = await loadQrImage(publicUrl, Math.round(qrSize * 3), false, qrCache);
  const qrY = pad + logoZoneH + gap;
  const qrX = pad + (innerW - qrSize) / 2;
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
  drawCodeIdUnderQr(ctx, codeId, qrX, qrY, qrSize);
  void codeH;
}

/** Modelo 4: QR com logo centralizado sobreposto. */
async function layoutEmbedded(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  codeId: string,
  publicUrl: string,
  logoAsset: ImageBase64Asset | null,
  qrCache?: LayoutQrCache,
): Promise<void> {
  const pad = 5;
  const innerW = w - pad * 2;
  const qrSize = Math.min(innerW, Math.round((h - pad * 2) * 0.62));
  const qrX = pad + (innerW - qrSize) / 2;
  const qrY = pad;

  const qrImg = await loadQrImage(publicUrl, Math.round(qrSize * 3), Boolean(logoAsset), qrCache);
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  if (logoAsset) {
    const box = qrSize * 0.26;
    const bx = qrX + (qrSize - box) / 2;
    const by = qrY + (qrSize - box) / 2;
    ctx.fillStyle = "#ffffff";
    const r = box * 0.15;
    ctx.beginPath();
    ctx.roundRect(bx, by, box, box, r);
    ctx.fill();
    try {
      const logoImg = await loadAssetImage(logoAsset);
      drawImageFitted(ctx, logoImg, bx, by, box, box);
    } catch {
      drawPlaceholder(ctx, bx, by, box, box);
    }
  }

  drawCodeIdUnderQr(ctx, codeId, qrX, qrY, qrSize);
}

/** Padrão: QR centralizado + ID abaixo. */
async function layoutStandard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  codeId: string,
  publicUrl: string,
  qrCache?: LayoutQrCache,
): Promise<void> {
  const pad = 5;
  const innerW = w - pad * 2;
  const qrSize = Math.min(innerW, Math.round((h - pad * 2) * 0.65));
  const qrX = pad + (innerW - qrSize) / 2;
  const qrY = pad;
  const qrImg = await loadQrImage(publicUrl, Math.round(qrSize * 3), false, qrCache);
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
  drawCodeIdUnderQr(ctx, codeId, qrX, qrY, qrSize);
}

function canvasHeightForModel(model: QrLabelLayoutModel, width: number): number {
  if (model === "logo_beside") {
    const box = besideBoxSize(width, 9999);
    return BESIDE_PAD_Y + box + codeAreaHeight(box) + BESIDE_PAD_Y;
  }
  const qrEst = Math.round(width * 0.55);
  const codeH = codeAreaHeight(qrEst);
  if (model === "logo_above") return Math.round(width * 1.22);
  return qrEst + codeH + 12;
}

/**
 * Gera o desenho da etiqueta (canvas → PNG base64) conforme o modelo escolhido.
 */
export async function generateQrLabelLayout(input: QrLabelLayoutInput): Promise<QrLabelLayoutResult> {
  const {
    modelType,
    logoUrl,
    codeId,
    qrCodeData,
    widthPx = DEFAULT_WIDTH,
    logoAsset: logoAssetIn,
    qrImageCache,
    drawBorder = false,
  } = input;
  const publicUrl = qrCodeData?.trim() || buildPublicEquipmentUrl(codeId);

  const wantsLogo = modelType !== "standard";
  const effectiveModel: QrLabelLayoutModel = wantsLogo ? modelType : "standard";
  let logoAsset = logoAssetIn ?? null;
  if (wantsLogo && logoAsset === null && logoUrl?.trim()) {
    logoAsset = await resolveLogoAsset(logoUrl);
  }

  const canvasW = widthPx;
  const canvasH = canvasHeightForModel(effectiveModel, canvasW);

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não disponível.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasW, canvasH);

  if (effectiveModel === "logo_beside") {
    await layoutBeside(ctx, canvasW, canvasH, codeId, publicUrl, logoAsset, qrImageCache);
  } else if (effectiveModel === "logo_above") {
    await layoutAbove(ctx, canvasW, canvasH, codeId, publicUrl, logoAsset, qrImageCache);
  } else if (effectiveModel === "logo_embedded") {
    await layoutEmbedded(ctx, canvasW, canvasH, codeId, publicUrl, logoAsset, qrImageCache);
  } else {
    await layoutStandard(ctx, canvasW, canvasH, codeId, publicUrl, qrImageCache);
  }

  if (drawBorder) drawLabelBorder(ctx, canvasW, canvasH);

  return {
    dataUrl: canvas.toDataURL("image/png"),
    widthPx: canvasW,
    heightPx: canvasH,
    publicUrl,
  };
}

export const QR_LABEL_LAYOUT_LABELS: Record<QrLabelLayoutModel, string> = {
  standard: "Padrão (QR + código)",
  logo_beside: "Modelo 2 — logo ao lado do QR",
  logo_above: "Modelo 3 — logo acima do QR",
  logo_embedded: "Modelo 4 — logo no centro do QR",
};
