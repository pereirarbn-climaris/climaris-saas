/** Redimensiona/comprime imagem antes do upload para visão computacional. */

const MAX_DIMENSION = 1600;
const MAX_BYTES = 900 * 1024;
const JPEG_QUALITY_STEPS = [0.88, 0.82, 0.76, 0.7, 0.64];

export type PreparedVisionImage = {
  file: File;
  previewUrl: string;
};

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem."));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

export async function prepareImageForVision(file: File): Promise<PreparedVisionImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selecione uma imagem (JPG, PNG ou WEBP).");
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("Imagem muito grande (máx. 12 MB).");
  }

  const img = await loadImageFromFile(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste navegador.");
  ctx.drawImage(img, 0, 0, width, height);

  let blob: Blob | null = null;
  for (const q of JPEG_QUALITY_STEPS) {
    blob = await canvasToBlob(canvas, q);
    if (blob && blob.size <= MAX_BYTES) break;
  }
  if (!blob) {
    blob = await canvasToBlob(canvas, 0.6);
  }
  if (!blob) throw new Error("Falha ao processar a imagem.");

  const baseName = file.name.replace(/\.[^.]+$/, "") || "etiqueta";
  const outFile = new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  return { file: outFile, previewUrl: URL.createObjectURL(outFile) };
}

export function revokePreparedPreview(previewUrl: string | null | undefined): void {
  if (previewUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(previewUrl);
  }
}
