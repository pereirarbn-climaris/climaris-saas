import {
  createClientCatalogEquipment,
  listClientCatalogEquipments,
  updateClientCatalogEquipment,
  type ClientEquipmentOut,
} from "../api/equipmentCatalog";
import { validateQrCode } from "../api/qrcodes";
import { parseScannedQrCode } from "./qrcodeScan";
import { resolveGarantiaSerial, type ServiceOrderGarantiaFields } from "./serviceOrderGarantia";

export type GarantiaEquipmentSyncResult = {
  clientEquipmentId: string;
  qrcodeCodeId: string;
};

function resolveEquipmentTag(g: ServiceOrderGarantiaFields): string {
  return (g.equipmentTag || g.localInstalacao || g.marcaModelo || "Equipamento instalado").trim();
}

async function validateQrcodeForSync(codeRaw: string): Promise<string | null> {
  const code = parseScannedQrCode(codeRaw);
  if (!code) return null;
  const result = await validateQrCode(code);
  if (!result.found || !result.available) return null;
  return result.code_id ?? code;
}

/**
 * Cria ou atualiza a instalação no cliente a partir dos dados da garantia.
 * Exige catalogId (IA) + número de série + tag/local.
 */
export async function syncGarantiaEquipmentToClient(
  clientId: number,
  garantia: ServiceOrderGarantiaFields,
): Promise<GarantiaEquipmentSyncResult | null> {
  const catalogId = garantia.catalogId?.trim();
  const serial = resolveGarantiaSerial(garantia);
  const tag = resolveEquipmentTag(garantia);
  if (!catalogId || !serial || !tag) return null;

  let qrcodeCodeId = garantia.qrcodeCodeId.trim();
  if (qrcodeCodeId) {
    const validated = await validateQrcodeForSync(qrcodeCodeId);
    if (!validated) {
      throw new Error("Código QR inválido ou indisponível para vincular ao equipamento.");
    }
    qrcodeCodeId = validated;
  }

  const installationDate = garantia.dataInstalacao?.trim() || null;
  const installationReference = garantia.localInstalacao?.trim() || null;

  let installation: ClientEquipmentOut;

  if (garantia.clientEquipmentId) {
    const rows = await listClientCatalogEquipments(clientId, { only_active: true });
    const existing = rows.find((r) => r.id === garantia.clientEquipmentId);
    if (!existing) {
      throw new Error("Equipamento vinculado à garantia não foi encontrado no cliente.");
    }
    const existingQr = existing.qrcode_code_id?.trim() ?? "";
    let qrcodePatch: { qrcode_code_id?: string } = {};
    if (qrcodeCodeId && qrcodeCodeId !== existingQr) {
      const validated = await validateQrcodeForSync(qrcodeCodeId);
      if (!validated) {
        throw new Error("Código QR inválido ou já vinculado a outro equipamento.");
      }
      qrcodePatch = { qrcode_code_id: validated };
    } else if (qrcodeCodeId) {
      qrcodePatch = { qrcode_code_id: qrcodeCodeId };
    }
    installation = await updateClientCatalogEquipment(garantia.clientEquipmentId, {
      tag,
      installation_reference: installationReference,
      installation_date: installationDate,
      components: existing.components.map((c) => ({
        id: c.id,
        serial_number: serial,
      })),
      ...qrcodePatch,
    });
  } else {
    installation = await createClientCatalogEquipment(clientId, {
      tag,
      installation_reference: installationReference,
      installation_date: installationDate,
      qrcode_code_id: qrcodeCodeId || null,
      components: [{ catalog_id: catalogId, serial_number: serial }],
    });
  }

  return {
    clientEquipmentId: installation.id,
    qrcodeCodeId: installation.qrcode_code_id?.trim() ?? qrcodeCodeId,
  };
}
