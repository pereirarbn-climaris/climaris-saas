import type { Conta, Transacao } from './finance.types';

/**
 * Cache opcional em memória — preferir TanStack Query (`financeQueries.ts`) como fonte de verdade na UI.
 */
let lastTransacoes: Transacao[] | null = null;
let lastContas: Conta[] | null = null;

export const financeCache = {
  getTransacoes(): Transacao[] | null {
    return lastTransacoes;
  },

  setTransacoes(items: Transacao[]): void {
    lastTransacoes = [...items];
  },

  getContas(): Conta[] | null {
    return lastContas;
  },

  setContas(items: Conta[]): void {
    lastContas = [...items];
  },

  clear(): void {
    lastTransacoes = null;
    lastContas = null;
  },
};
