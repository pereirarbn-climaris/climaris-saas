import { isDeveloperPlan, normalizePlanKey } from '../../lib/planRules';
import type { Planos } from './finance.types';

/** Mapeia `active_plan` / entitlements da API para o enum do domínio. */
export function mapApiPlanToFinancePlan(activePlan: string | null | undefined): Planos {
  if (isDeveloperPlan(activePlan)) return 'ENTERPRISE';

  const key = normalizePlanKey(activePlan);
  if (key === 'enterprise') return 'ENTERPRISE';
  if (key === 'professional') return 'PRO';

  const raw = (activePlan ?? '').trim().toLowerCase();
  if (raw.includes('enterprise') || raw.includes('premium')) return 'ENTERPRISE';
  if (raw.includes('professional')) return 'PRO';
  return 'SIMPLES';
}

const PLANO_RANK: Record<Planos, number> = {
  SIMPLES: 0,
  PRO: 1,
  ENTERPRISE: 2,
};

/** True se o plano do usuário atende ou supera o mínimo exigido pela conta/recurso. */
export function planoAtendeMinimo(planoUsuario: Planos, planoMinimo: Planos): boolean {
  return PLANO_RANK[planoUsuario] >= PLANO_RANK[planoMinimo];
}

export function isContaGateway(tipo: string): boolean {
  return tipo === 'GATEWAY_PIX' || tipo === 'GATEWAY_BOLETO';
}
