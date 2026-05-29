import { z } from "zod";

/** Tipos de conta no modelo unificado (evolução de `FinanceBankAccount` + gateways + maquininhas). */
export const FinancialAccountKindSchema = z.enum([
  "bank", // conta bancária / carteira
  "cash", // caixa físico
  "card_machine", // maquininha (provedor = nome Stone, etc.)
  "payment_gateway", // Asaas, Mercado Pago, Stone API
]);
export type FinancialAccountKind = z.infer<typeof FinancialAccountKindSchema>;

export const FinancialAccountStatusSchema = z.enum(["active", "inactive"]);
export type FinancialAccountStatus = z.infer<typeof FinancialAccountStatusSchema>;

/** Conta financeira — saldo e movimentos referenciam `account_id`. */
export const FinancialAccountSchema = z.object({
  id: z.number().int().positive(),
  tenant_id: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  kind: FinancialAccountKindSchema,
  status: FinancialAccountStatusSchema.default("active"),
  /** Ex.: checking, savings — só para kind=bank (legado `account_type`). */
  bank_subtype: z.enum(["checking", "savings", "investment", "digital_wallet", "other"]).optional(),
  bank_name: z.string().max(80).nullable().optional(),
  initial_balance: z.number().default(0),
  /** Provedor da maquininha ou slug do gateway (asaas, mercadopago, stone). */
  provider_slug: z.string().max(80).nullable().optional(),
  gateway_id: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().default(true),
  created_at: z.string().datetime({ offset: true }).or(z.string()),
  updated_at: z.string().datetime({ offset: true }).or(z.string()),
});
export type FinancialAccount = z.infer<typeof FinancialAccountSchema>;

export const TransactionDirectionSchema = z.enum(["inflow", "outflow"]);
export type TransactionDirection = z.infer<typeof TransactionDirectionSchema>;

/** Status operacional do movimento (alinhado ao domínio; mapeia `FinanceEntryStatus` legado). */
export const TransactionStatusSchema = z.enum([
  "pending", // pendente — não liquidado
  "settled", // liquidado (pago/recebido)
  "reconciled", // conciliado com extrato OFX/banco
  "overdue", // vencido sem liquidação
  "cancelled",
]);
export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;

export const TransactionCategoryKindSchema = z.enum([
  "sale",
  "service_revenue",
  "cost",
  "tax",
  "fee",
  "payroll",
  "transfer",
  "other",
]);
export type TransactionCategoryKind = z.infer<typeof TransactionCategoryKindSchema>;

export const FinancialTransactionSchema = z.object({
  id: z.number().int().positive(),
  tenant_id: z.number().int().positive(),
  account_id: z.number().int().positive().nullable(),
  description: z.string().trim().min(1).max(180),
  direction: TransactionDirectionSchema,
  status: TransactionStatusSchema,
  /** Valor bruto positivo; direção indica entrada/saída. */
  amount: z.number().positive(),
  fee_amount: z.number().min(0).default(0),
  net_amount: z.number(),
  category_id: z.number().int().positive().nullable().optional(),
  category_kind: TransactionCategoryKindSchema.nullable().optional(),
  category_name: z.string().nullable().optional(),
  /** Data prevista (vencimento / previsão de caixa). */
  scheduled_at: z.string(), // ISO date YYYY-MM-DD
  /** Data efetiva de liquidação (null se pendente). */
  settled_at: z.string().nullable().optional(),
  /** Data em que foi conciliado com extrato. */
  reconciled_at: z.string().nullable().optional(),
  competence_at: z.string().optional(),
  payment_method: z.string().max(40).nullable().optional(),
  payment_provider: z.string().max(80).nullable().optional(),
  installment_number: z.number().int().min(1).default(1),
  installment_total: z.number().int().min(1).default(1),
  service_order_id: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type FinancialTransaction = z.infer<typeof FinancialTransactionSchema>;

export const FinancialTransactionCreateSchema = FinancialTransactionSchema.pick({
  account_id: true,
  description: true,
  direction: true,
  amount: true,
  category_id: true,
  scheduled_at: true,
  payment_method: true,
  payment_provider: true,
  notes: true,
}).extend({
  status: TransactionStatusSchema.default("pending"),
  fee_amount: z.number().min(0).default(0),
  competence_at: z.string().optional(),
});
export type FinancialTransactionCreate = z.infer<typeof FinancialTransactionCreateSchema>;

/** Feature flags do módulo financeiro (plano SaaS + marketplace). */
export const FinanceFeatureKeySchema = z.enum([
  "finance_module", // módulo habilitado no tenant
  "finance_intermediate", // categorias, cartões, maquininhas
  "finance_management", // conciliação avançada, previsão
  "payment_pix_boleto", // emitir cobrança Pix/Boleto em lançamento
  "auto_reconciliation", // OFX + match automático
  "payment_gateways", // configurar Asaas/MP/Stone
]);
export type FinanceFeatureKey = z.infer<typeof FinanceFeatureKeySchema>;

export const FinanceEntitlementsSchema = z.object({
  plan_key: z.string(),
  plan_label: z.string(),
  effective_finance_mode: z.enum(["basic", "intermediate", "management"]),
  max_finance_mode: z.enum(["basic", "intermediate", "management"]),
  features: z.record(FinanceFeatureKeySchema, z.boolean()),
  blocked_reasons: z.record(z.string()),
});
export type FinanceEntitlements = z.infer<typeof FinanceEntitlementsSchema>;
