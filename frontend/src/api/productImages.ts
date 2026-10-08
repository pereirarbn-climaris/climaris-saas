import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";
import type { ProductImageOut } from "./products";

function bearer(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}` };
}

function extractError(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body && typeof (body as { detail: unknown }).detail === "string") {
    return (body as { detail: string }).detail;
  }
  return fallback;
}

export async function uploadProductImage(productId: number, file: File): Promise<ProductImageOut> {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  const fd = new FormData();
  fd.append("file", file);
  const response = await fetch(apiUrl(`/api/v1/products/${productId}/images`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível enviar a imagem."));
  return body as ProductImageOut;
}

export async function deleteProductImage(productId: number, imageId: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/products/${productId}/images/${imageId}`), {
    method: "DELETE",
    headers: bearer(),
  });
  if (response.status === 204) return;
  const body: unknown = await response.json().catch(() => ({}));
  throw new Error(extractError(body, "Não foi possível remover a imagem."));
}

export async function reorderProductImages(productId: number, imageIds: number[]): Promise<ProductImageOut[]> {
  const response = await fetch(apiUrl(`/api/v1/products/${productId}/images/reorder`), {
    method: "PATCH",
    headers: { ...bearer(), "Content-Type": "application/json" },
    body: JSON.stringify({ image_ids: imageIds }),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractError(body, "Não foi possível reordenar."));
  return body as ProductImageOut[];
}
