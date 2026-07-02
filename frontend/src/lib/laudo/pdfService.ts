/** Utilitários de visualização de PDF no navegador. */

export function openPdfBlobInNewTab(blob: Blob, filename?: string): void {
  const url = URL.createObjectURL(blob);
  const tab = window.open(url, "_blank", "noopener,noreferrer");
  if (!tab) {
    URL.revokeObjectURL(url);
    throw new Error("O navegador bloqueou a abertura do PDF. Permita pop-ups para este site.");
  }
  if (filename) {
    const label = filename.replace(/\.pdf$/i, "");
    try {
      tab.document.title = label;
    } catch {
      // Visualizador PDF embutido — título vem dos metadados do arquivo.
    }
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
