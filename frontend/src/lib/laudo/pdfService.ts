/** Utilitários de visualização de PDF no navegador. */

export function openPdfBlobInNewTab(blob: Blob, _filename?: string): void {
  const url = URL.createObjectURL(blob);
  const tab = window.open(url, "_blank", "noopener,noreferrer");
  if (!tab) {
    URL.revokeObjectURL(url);
    throw new Error("O navegador bloqueou a abertura do PDF. Permita pop-ups para este site.");
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

export async function downloadPdfBlob(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
