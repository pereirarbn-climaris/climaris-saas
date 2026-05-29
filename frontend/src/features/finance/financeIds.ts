/** IDs de domínio no formato UUID (compatível com finance.types) mapeados a entidades numéricas da API. */

const ENTRY_NS = '00000000-0000-4000-a000-';
const ACCOUNT_NS = '00000000-0000-4000-b000-';
const GATEWAY_PIX_NS = '00000000-0000-4000-c001-';
const GATEWAY_BOLETO_NS = '00000000-0000-4000-c002-';
const MACHINE_NS = '00000000-0000-4000-d000-';

function pad12(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(12, '0').slice(-12);
}

function hash12(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  }
  return pad12(Math.abs(h) % 1_000_000_000_000);
}

export function entryDomainId(apiId: number): string {
  return `${ENTRY_NS}${pad12(apiId)}`;
}

export function parseEntryDomainId(domainId: string): number | null {
  if (!domainId.startsWith(ENTRY_NS)) return null;
  const n = Number.parseInt(domainId.slice(-12), 10);
  return Number.isFinite(n) ? n : null;
}

export function bankAccountDomainId(apiId: number): string {
  return `${ACCOUNT_NS}${pad12(apiId)}`;
}

export function parseBankAccountDomainId(domainId: string): number | null {
  if (!domainId.startsWith(ACCOUNT_NS)) return null;
  const n = Number.parseInt(domainId.slice(-12), 10);
  return Number.isFinite(n) ? n : null;
}

export function gatewayPixDomainId(provider: 'mercadopago' | 'asaas' | 'stone'): string {
  const code = { mercadopago: 1, asaas: 2, stone: 3 }[provider];
  return `${GATEWAY_PIX_NS}${pad12(code)}`;
}

export function gatewayBoletoDomainId(provider: 'mercadopago' | 'asaas' | 'stone'): string {
  const code = { mercadopago: 1, asaas: 2, stone: 3 }[provider];
  return `${GATEWAY_BOLETO_NS}${pad12(code)}`;
}

export function machineDomainId(providerName: string): string {
  return `${MACHINE_NS}${hash12(providerName.trim().toLowerCase())}`;
}

export function parseMachineDomainId(domainId: string): string | null {
  if (!domainId.startsWith(MACHINE_NS)) return null;
  return domainId;
}

export function isMachineDomainId(domainId: string): boolean {
  return domainId.startsWith(MACHINE_NS);
}

export function isGatewayPixDomainId(id: string): boolean {
  return id.startsWith(GATEWAY_PIX_NS);
}

export function isGatewayBoletoDomainId(id: string): boolean {
  return id.startsWith(GATEWAY_BOLETO_NS);
}

export function gatewayProviderFromDomainId(id: string): 'mercadopago' | 'asaas' | 'stone' | null {
  if (!id.startsWith(GATEWAY_PIX_NS) && !id.startsWith(GATEWAY_BOLETO_NS)) return null;
  const n = Number.parseInt(id.slice(-12), 10);
  if (n === 1) return 'mercadopago';
  if (n === 2) return 'asaas';
  if (n === 3) return 'stone';
  return null;
}
