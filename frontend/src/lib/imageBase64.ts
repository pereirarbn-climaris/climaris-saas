import { getAccessToken } from "./authStorage";

/** Carrega imagens remotas e normaliza para base64 PNG/JPEG (jsPDF-safe). */

export type ImageBase64Asset = {
  /** Base64 puro, sem prefixo `data:image/...`. */
  base64: string;
  format: "PNG" | "JPEG";
  width: number;
  height: number;
};

let cachedPlaceholder: ImageBase64Asset | null = null;

/** Placeholder PNG gerado em runtime (evita base64 inválido no PDF). */
export function createPlaceholderAsset(): ImageBase64Asset {
  if (cachedPlaceholder) return cachedPlaceholder;
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    cachedPlaceholder = { base64: "", format: "PNG", width: size, height: size };
    return cachedPlaceholder;
  }
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#64748b";
  ctx.font = "bold 9px Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("LOGO", size / 2, size / 2);
  const parsed = dataUrlToJsPdfImage(canvas.toDataURL("image/png"));
  cachedPlaceholder = {
    base64: parsed?.base64 ?? "",
    format: "PNG",
    width: size,
    height: size,
  };
  return cachedPlaceholder;
}

export function dataUrlToJsPdfImage(dataUrl: string): { base64: string; format: "PNG" | "JPEG" } | null {
  const trimmed = dataUrl.trim();
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i.exec(trimmed);
  if (match) {
    const mime = match[1].toLowerCase();
    const format: "PNG" | "JPEG" = mime === "png" ? "PNG" : "JPEG";
    const base64 = match[2].replace(/\s/g, "");
    if (base64.length < 32) return null;
    return { base64, format };
  }
  if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 32) {
    return { base64: trimmed, format: "PNG" };
  }
  return null;
}

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function rasterizeToPngAsset(img: HTMLImageElement): ImageBase64Asset | null {
  const w = Math.max(1, img.naturalWidth || img.width);
  const h = Math.max(1, img.naturalHeight || img.height);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const parsed = dataUrlToJsPdfImage(canvas.toDataURL("image/png"));
  if (!parsed) return null;
  return { base64: parsed.base64, format: "PNG", width: w, height: h };
}

function isApiLogoUrl(url: string): boolean {
  return url.includes("/api/v1/auth/me/tenant/logo/file");
}

export async function fetchImageAsBase64(url: string | null | undefined): Promise<ImageBase64Asset | null> {
  const src = (url ?? "").trim();
  if (!src) return null;

  if (src.startsWith("data:")) {
    const img = await loadImageElement(src);
    return img ? rasterizeToPngAsset(img) : null;
  }

  try {
    const headers: HeadersInit = {};
    if (isApiLogoUrl(src)) {
      const token = getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(src, {
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers,
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return null;
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await loadImageElement(objectUrl);
      return img ? rasterizeToPngAsset(img) : null;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

/** Carrega logo real; retorna null se não houver URL ou falhar (use placeholder só nesse caso). */
export async function resolveLogoAsset(url: string | null | undefined): Promise<ImageBase64Asset | null> {
  if (!url?.trim()) return null;
  const loaded = await fetchImageAsBase64(url);
  if (loaded?.base64 && loaded.base64.length > 32) return loaded;
  return null;
}

export function assetToDataUrl(asset: ImageBase64Asset): string {
  const mime = asset.format === "JPEG" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${asset.base64}`;
}

export async function loadAssetImage(asset: ImageBase64Asset): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar asset."));
    img.src = assetToDataUrl(asset);
  });
}

export function drawImageFitted(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
): void {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const ratio = Math.min(maxW / iw, maxH / ih, 1);
  const w = iw * ratio;
  const h = ih * ratio;
  ctx.drawImage(img, x + (maxW - w) / 2, y + (maxH - h) / 2, w, h);
}

export function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#64748b";
  ctx.font = "bold 9px Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("LOGO", x + w / 2, y + h / 2);
}
