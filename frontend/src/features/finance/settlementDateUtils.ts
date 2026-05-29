/** @deprecated Importe de `financeCalculator.ts`. Reexportações de compatibilidade. */
export {
  calculateSettlementDate,
  calculateSettlementDateFromFlow,
  calculateParcelDueDate,
  calculateNetValue,
  resolveMaquininhaFee as calculateMaquininhaFee,
  resolveMaquininhaPaymentMethod,
  settlementPlanForMaquininhaPlan,
  startOfDay,
  formatDateOnly,
  parseDateInput,
  isSameCalendarDay,
  nextBusinessDayAfter,
  flowToPaymentMethod,
  type PaymentMethodFlow,
  type SettlementPlan,
} from './financeCalculator';
