/** Parser para arquivos .tjf (Testo JSON Format) exportados por vacuômetros Testo. */

export type TestoTjfParseResult = {
  vacuoFinalMicrons: string | null;
  deviceName: string | null;
  deviceSerial: string | null;
  measurementType: string | null;
  unit: string | null;
};

type TjfChannel = {
  additionalData?: Array<{ name?: string; value?: string | boolean }>;
  type?: { name?: string; description?: string };
  unit?: { name?: string };
  values?: Array<{ value?: number }>;
};

type TjfRoot = {
  channels?: TjfChannel[];
  device?: Array<{ name?: string; serial?: string }>;
  type?: { name?: string; id?: string };
};

function channelMeasType(channel: TjfChannel): string {
  const row = channel.additionalData?.find((d) => d.name === "measType");
  return typeof row?.value === "string" ? row.value : "";
}

function channelUnit(channel: TjfChannel): string {
  return (channel.unit?.name ?? "").toLowerCase();
}

function pickMicronChannel(channels: TjfChannel[], preferredMeasTypes: string[]): TjfChannel | null {
  for (const measType of preferredMeasTypes) {
    const found = channels.find((ch) => {
      const mt = channelMeasType(ch) || ch.type?.name || "";
      const unit = channelUnit(ch);
      return mt === measType && (unit.includes("micron") || unit === "µ");
    });
    if (found?.values?.length) return found;
  }
  return null;
}

function micronValueFromChannel(channel: TjfChannel): number | null {
  const values = channel.values ?? [];
  if (!values.length) return null;
  const nums = values.map((v) => v.value).filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (!nums.length) return null;
  // MinimumPressure no Testo já registra o mínimo acumulado — último ponto = vácuo final.
  const last = nums[nums.length - 1]!;
  const min = Math.min(...nums);
  return Math.min(last, min);
}

export function parseTestoTjfText(text: string): TestoTjfParseResult {
  const empty: TestoTjfParseResult = {
    vacuoFinalMicrons: null,
    deviceName: null,
    deviceSerial: null,
    measurementType: null,
    unit: null,
  };
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return empty;

  let data: TjfRoot;
  try {
    data = JSON.parse(trimmed) as TjfRoot;
  } catch {
    return empty;
  }

  const channels = data.channels ?? [];
  const channel =
    pickMicronChannel(channels, ["MinimumPressure", "VacuumPressure"]) ??
    channels.find((ch) => channelUnit(ch).includes("micron") && ch.values?.length) ??
    null;

  const microns = channel ? micronValueFromChannel(channel) : null;
  const device = data.device?.[0];

  return {
    vacuoFinalMicrons:
      microns != null && microns > 0
        ? String(microns === Math.floor(microns) ? Math.floor(microns) : microns)
        : null,
    deviceName: device?.name?.trim() || null,
    deviceSerial: device?.serial?.trim() || null,
    measurementType: data.type?.name?.trim() || data.type?.id?.trim() || null,
    unit: channel ? channelUnit(channel) || "micron" : null,
  };
}

export async function parseTestoTjfFile(file: File): Promise<TestoTjfParseResult> {
  const text = await file.text();
  return parseTestoTjfText(text);
}

export function isTestoTjfFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".tjf") || file.type === "application/json";
}
