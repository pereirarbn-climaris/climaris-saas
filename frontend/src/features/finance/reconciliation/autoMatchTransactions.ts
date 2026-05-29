import type {
  FinanceReconciliationEntry,
  FinanceReconciliationFeedLine,
  FinanceReconciliationSuggestion,
} from '../../../api/finance';

const AMOUNT_TOLERANCE = 0.01;

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function businessDaysBetween(a: Date, b: Date): number {
  const start = a < b ? a : b;
  const end = a < b ? b : a;
  const cur = new Date(start);
  cur.setHours(12, 0, 0, 0);
  const endD = new Date(end);
  endD.setHours(12, 0, 0, 0);
  let count = 0;
  while (cur < endD) {
    cur.setDate(cur.getDate() + 1);
    if (!isWeekend(cur)) count += 1;
  }
  return count;
}

export function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= AMOUNT_TOLERANCE;
}

export function settlementDatesMatch(a: string, b: string): boolean {
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  if (da.toDateString() === db.toDateString()) return true;
  return businessDaysBetween(da, db) <= 2;
}

/**
 * Compara extrato gateway × lançamentos Climaris (valor ±1 centavo, liquidação ±2 dias úteis).
 */
export function autoMatchTransactions(
  feedLines: FinanceReconciliationFeedLine[],
  entries: FinanceReconciliationEntry[],
): FinanceReconciliationSuggestion[] {
  const usedFeed = new Set<string>();
  const usedEntry = new Set<number>();
  const out: FinanceReconciliationSuggestion[] = [];

  for (const feed of feedLines) {
    if (feed.status === 'processed') continue;
    let best: { entryId: number; confidence: 'high' | 'medium' } | null = null;

    for (const entry of entries) {
      if (entry.status === 'reconciled') continue;
      if (usedEntry.has(entry.id)) continue;
      if (!amountsMatch(feed.amount, entry.amount)) continue;
      if (!settlementDatesMatch(feed.settlement_date, entry.settlement_date)) continue;

      const confidence: 'high' | 'medium' =
        feed.amount === entry.amount && feed.settlement_date === entry.settlement_date ? 'high' : 'medium';

      if (!best || confidence === 'high') {
        best = { entryId: entry.id, confidence };
        if (confidence === 'high' && feed.settlement_date === entry.settlement_date) break;
      }
    }

    if (best) {
      usedFeed.add(feed.id);
      usedEntry.add(best.entryId);
      out.push({ feed_id: feed.id, entry_id: best.entryId, confidence: best.confidence });
    }
  }

  return out;
}

export function suggestionForFeed(
  feedId: string,
  suggestions: FinanceReconciliationSuggestion[],
): FinanceReconciliationSuggestion | undefined {
  return suggestions.find((s) => s.feed_id === feedId);
}
