import { useCallback, useMemo } from 'react';
import { calculateLiquido, calculateLiquidoFromSimulacao } from '../financeService';
import { planoAtendeMinimo } from '../financePlanUtils';
import type {
  CalculateLiquidoParams,
  CalculateLiquidoResult,
  Planos,
  SimulacaoVenda,
} from '../finance.types';

export type CalculateLiquidoWithPlanResult = CalculateLiquidoResult & {
  /** Taxa efetivamente aplicada após regras do plano. */
  taxaPercentualEfetiva: number;
  taxaFixaEfetiva: number;
  /** True quando o plano bloqueou taxas avançadas (ex.: SIMPLES). */
  planoLimitouTaxas: boolean;
  planoUsuario: Planos;
};

export type UseFinanceCalculationsOptions = {
  planoUsuario?: Planos;
};

/**
 * Expõe cálculo de líquido para UI em tempo real.
 * Plano SIMPLES: não aplica taxas de maquininha/gateway (líquido = bruto − 0).
 * PRO/ENTERPRISE: cálculo completo conforme parâmetros.
 */
export function useFinanceCalculations(options: UseFinanceCalculationsOptions = {}) {
  const planoUsuario = options.planoUsuario ?? 'SIMPLES';

  const capabilities = useMemo(
    () => ({
      planoUsuario,
      podeAplicarTaxasMaquininha: planoAtendeMinimo(planoUsuario, 'PRO'),
      podeUsarGateway: planoAtendeMinimo(planoUsuario, 'PRO'),
    }),
    [planoUsuario],
  );

  const normalizeParamsForPlan = useCallback(
    (params: CalculateLiquidoParams): CalculateLiquidoParams & { planoLimitouTaxas: boolean } => {
      if (capabilities.podeAplicarTaxasMaquininha) {
        return { ...params, planoLimitouTaxas: false };
      }
      const hadTax = params.taxaPercentual > 0 || (params.taxaFixa ?? 0) > 0;
      return {
        valorBruto: params.valorBruto,
        taxaPercentual: 0,
        taxaFixa: 0,
        planoLimitouTaxas: hadTax,
      };
    },
    [capabilities.podeAplicarTaxasMaquininha],
  );

  const calculateLiquidoWithPlan = useCallback(
    (params: CalculateLiquidoParams): CalculateLiquidoWithPlanResult => {
      const normalized = normalizeParamsForPlan(params);
      const result = calculateLiquido(normalized);
      return {
        ...result,
        taxaPercentualEfetiva: normalized.taxaPercentual,
        taxaFixaEfetiva: normalized.taxaFixa ?? 0,
        planoLimitouTaxas: normalized.planoLimitouTaxas,
        planoUsuario,
      };
    },
    [normalizeParamsForPlan, planoUsuario],
  );

  const calculateFromSimulacao = useCallback(
    (simulacao: Pick<SimulacaoVenda, 'valorBruto' | 'taxaPercentual'>): CalculateLiquidoWithPlanResult => {
      return calculateLiquidoWithPlan({
        valorBruto: simulacao.valorBruto,
        taxaPercentual: simulacao.taxaPercentual,
      });
    },
    [calculateLiquidoWithPlan],
  );

  const calculateLiquidoStrict = useCallback(
    (params: CalculateLiquidoParams): CalculateLiquidoResult => calculateLiquido(params),
    [],
  );

  const calculateFromSimulacaoStrict = useCallback(
    (simulacao: Pick<SimulacaoVenda, 'valorBruto' | 'taxaPercentual'>) =>
      calculateLiquidoFromSimulacao(simulacao),
    [],
  );

  return {
    ...capabilities,
    calculateLiquido: calculateLiquidoWithPlan,
    calculateLiquidoStrict,
    calculateFromSimulacao,
    calculateFromSimulacaoStrict,
  };
}
