import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  createStripeCoupon,
  createStripePromotionCode,
  deleteStripeCoupon,
  listStripeCoupons,
  listStripeProducts,
  listStripePromotionCodes,
  updateStripePromotionCode,
  type StripeCoupon,
  type StripePromotionCode,
  type StripeProductOption,
} from "../../api/platformStripeCoupons";
import type { StripePlatformStatus } from "../../api/platformSaasPlans";
import { toast } from "../../lib/toast";
import tableStyles from "../listTableCommon.module.css";
import pageStyles from "../saas/PlatformSaasPlansPage.module.css";
import local from "./PlatformStripeCouponsPage.module.css";

export type PlatformStripeCouponsPanelProps = {
  stripeStatus: StripePlatformStatus | null;
  active: boolean;
  openCreateForm?: boolean;
};

const DURATION_LABELS: Record<StripeCoupon["duration"], string> = {
  once: "Uma vez",
  forever: "Para sempre",
  repeating: "Repetido",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function emptyCouponForm() {
  return {
    name: "",
    coupon_id: "",
    discount_type: "percent" as "percent" | "amount",
    percent_off: "10",
    amount_off_brl: "",
    duration: "once" as StripeCoupon["duration"],
    duration_in_months: "3",
    max_redemptions: "",
    redeem_by: "",
    applies_to_product_ids: [] as string[],
  };
}

function emptyPromoForm(couponId: string) {
  return {
    coupon_id: couponId,
    code: "",
    active: true,
    max_redemptions: "",
    expires_at: "",
    first_time_transaction: false,
    minimum_amount_brl: "",
  };
}

export function PlatformStripeCouponsPanel({
  stripeStatus,
  active,
  openCreateForm = false,
}: PlatformStripeCouponsPanelProps) {
  const [products, setProducts] = useState<StripeProductOption[]>([]);
  const [coupons, setCoupons] = useState<StripeCoupon[]>([]);
  const [promos, setPromos] = useState<StripePromotionCode[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [couponForm, setCouponForm] = useState(emptyCouponForm);
  const [promoForm, setPromoForm] = useState(emptyPromoForm(""));
  const [showCouponForm, setShowCouponForm] = useState(openCreateForm);
  const [showPromoForm, setShowPromoForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const selectedCoupon = useMemo(
    () => coupons.find((c) => c.id === selectedCouponId) ?? null,
    [coupons, selectedCouponId],
  );

  const couponPromos = useMemo(
    () => promos.filter((p) => p.coupon_id === selectedCouponId),
    [promos, selectedCouponId],
  );

  const load = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    try {
      const [couponRows, promoRows, productRows] = await Promise.all([
        listStripeCoupons(),
        listStripePromotionCodes(),
        listStripeProducts(),
      ]);
      setCoupons(couponRows);
      setPromos(promoRows);
      setProducts(productRows);
      setSelectedCouponId((prev) => {
        if (prev && couponRows.some((c) => c.id === prev)) return prev;
        return couponRows[0]?.id ?? null;
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar cupons.");
      setCoupons([]);
      setPromos([]);
    } finally {
      setLoading(false);
    }
  }, [active]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (openCreateForm) setShowCouponForm(true);
  }, [openCreateForm]);

  useEffect(() => {
    if (selectedCouponId) setPromoForm(emptyPromoForm(selectedCouponId));
  }, [selectedCouponId]);

  async function onCreateCoupon(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await createStripeCoupon({
        name: couponForm.name.trim(),
        coupon_id: couponForm.coupon_id.trim() || null,
        discount_type: couponForm.discount_type,
        percent_off: couponForm.discount_type === "percent" ? Number(couponForm.percent_off) : null,
        amount_off_brl: couponForm.discount_type === "amount" ? Number(couponForm.amount_off_brl) : null,
        duration: couponForm.duration,
        duration_in_months:
          couponForm.duration === "repeating" ? Number(couponForm.duration_in_months) || null : null,
        max_redemptions: couponForm.max_redemptions ? Number(couponForm.max_redemptions) : null,
        redeem_by: couponForm.redeem_by ? new Date(`${couponForm.redeem_by}T23:59:59`).toISOString() : null,
        applies_to_product_ids: couponForm.applies_to_product_ids,
      });
      toast.success(`Cupom "${created.name ?? created.id}" criado.`);
      setCouponForm(emptyCouponForm());
      setShowCouponForm(false);
      setSelectedCouponId(created.id);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar cupom.");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteCoupon(coupon: StripeCoupon) {
    if (!window.confirm(`Excluir o cupom "${coupon.name ?? coupon.id}"? Esta ação não pode ser desfeita.`)) return;
    setBusy(true);
    try {
      await deleteStripeCoupon(coupon.id);
      toast.success("Cupom excluído.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir cupom.");
    } finally {
      setBusy(false);
    }
  }

  async function onCreatePromo(e: FormEvent) {
    e.preventDefault();
    if (!promoForm.coupon_id) return;
    setBusy(true);
    try {
      const created = await createStripePromotionCode({
        coupon_id: promoForm.coupon_id,
        code: promoForm.code.trim(),
        active: promoForm.active,
        max_redemptions: promoForm.max_redemptions ? Number(promoForm.max_redemptions) : null,
        expires_at: promoForm.expires_at
          ? new Date(`${promoForm.expires_at}T23:59:59`).toISOString()
          : null,
        first_time_transaction: promoForm.first_time_transaction,
        minimum_amount_brl: promoForm.minimum_amount_brl ? Number(promoForm.minimum_amount_brl) : null,
      });
      toast.success(`Código "${created.code}" criado.`);
      setPromoForm(emptyPromoForm(promoForm.coupon_id));
      setShowPromoForm(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar código promocional.");
    } finally {
      setBusy(false);
    }
  }

  async function onTogglePromo(promo: StripePromotionCode) {
    setBusy(true);
    try {
      await updateStripePromotionCode(promo.id, { active: !promo.active });
      toast.success(promo.active ? "Código desativado." : "Código ativado.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar código.");
    } finally {
      setBusy(false);
    }
  }

  function toggleProduct(productId: string) {
    setCouponForm((prev) => {
      const has = prev.applies_to_product_ids.includes(productId);
      return {
        ...prev,
        applies_to_product_ids: has
          ? prev.applies_to_product_ids.filter((id) => id !== productId)
          : [...prev.applies_to_product_ids, productId],
      };
    });
  }

  const stripeReady = Boolean(stripeStatus?.configured);

  if (!active) return null;

  return (
    <section className={local.embeddedPanel}>
      {!stripeReady ? (
        <p className={local.hint}>
          Configure a chave secreta em <Link to="/operacao/chaves-api">Chaves APIs → Stripe</Link> antes de criar cupons.
          Os clientes aplicam o código promocional no checkout em <strong>Plano e assinatura</strong>.
        </p>
      ) : null}

      <div className={pageStyles.toolbar}>
        <p className={local.summary}>{loading ? "Carregando…" : `${coupons.length} cupom(ns) no Stripe`}</p>
        <div className={pageStyles.toolbarActions}>
          <button
            type="button"
            className={pageStyles.btnPrimary}
            disabled={!stripeReady || busy}
            onClick={() => setShowCouponForm((v) => !v)}
          >
            {showCouponForm ? "Fechar formulário" : "+ Novo cupom"}
          </button>
        </div>
      </div>

      {showCouponForm ? (
        <form className={local.formCard} onSubmit={(e) => void onCreateCoupon(e)}>
          <h2 className={local.formTitle}>Novo cupom</h2>
          <div className={local.fieldGrid}>
            <label className={local.field}>
              <span>Nome (exibido em recibos)</span>
              <input required value={couponForm.name} onChange={(e) => setCouponForm({ ...couponForm, name: e.target.value })} />
            </label>
            <label className={local.field}>
              <span>ID do cupom (opcional)</span>
              <input
                value={couponForm.coupon_id}
                placeholder="ex.: verao2026"
                onChange={(e) => setCouponForm({ ...couponForm, coupon_id: e.target.value })}
              />
            </label>
            <label className={local.field}>
              <span>Tipo de desconto</span>
              <select
                value={couponForm.discount_type}
                onChange={(e) =>
                  setCouponForm({ ...couponForm, discount_type: e.target.value as "percent" | "amount" })
                }
              >
                <option value="percent">Percentual (%)</option>
                <option value="amount">Valor fixo (BRL)</option>
              </select>
            </label>
            {couponForm.discount_type === "percent" ? (
              <label className={local.field}>
                <span>Percentual de desconto</span>
                <input
                  type="number"
                  min={0.01}
                  max={100}
                  step={0.01}
                  required
                  value={couponForm.percent_off}
                  onChange={(e) => setCouponForm({ ...couponForm, percent_off: e.target.value })}
                />
              </label>
            ) : (
              <label className={local.field}>
                <span>Valor do desconto (R$)</span>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  required
                  value={couponForm.amount_off_brl}
                  onChange={(e) => setCouponForm({ ...couponForm, amount_off_brl: e.target.value })}
                />
              </label>
            )}
            <label className={local.field}>
              <span>Duração do desconto</span>
              <select
                value={couponForm.duration}
                onChange={(e) =>
                  setCouponForm({ ...couponForm, duration: e.target.value as StripeCoupon["duration"] })
                }
              >
                <option value="once">Uma vez (primeira fatura)</option>
                <option value="forever">Para sempre (todas as faturas)</option>
                <option value="repeating">Repetido (N meses)</option>
              </select>
            </label>
            {couponForm.duration === "repeating" ? (
              <label className={local.field}>
                <span>Meses de desconto</span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  required
                  value={couponForm.duration_in_months}
                  onChange={(e) => setCouponForm({ ...couponForm, duration_in_months: e.target.value })}
                />
              </label>
            ) : null}
            <label className={local.field}>
              <span>Limite de resgates (opcional)</span>
              <input
                type="number"
                min={1}
                value={couponForm.max_redemptions}
                onChange={(e) => setCouponForm({ ...couponForm, max_redemptions: e.target.value })}
              />
            </label>
            <label className={local.field}>
              <span>Válido até (opcional)</span>
              <input
                type="date"
                value={couponForm.redeem_by}
                onChange={(e) => setCouponForm({ ...couponForm, redeem_by: e.target.value })}
              />
            </label>
          </div>
          {products.length > 0 ? (
            <fieldset className={local.productFieldset}>
              <legend>Limitar a produtos (opcional)</legend>
              <div className={local.productList}>
                {products.map((p) => (
                  <label key={p.id} className={local.productCheck}>
                    <input
                      type="checkbox"
                      checked={couponForm.applies_to_product_ids.includes(p.id)}
                      onChange={() => toggleProduct(p.id)}
                    />
                    <span>{p.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <div className={local.formActions}>
            <button type="submit" className={pageStyles.btnStripe} disabled={!stripeReady || busy}>
              Criar cupom no Stripe
            </button>
          </div>
        </form>
      ) : null}

      <div className={tableStyles.tableWrap}>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th>Nome / ID</th>
              <th>Desconto</th>
              <th>Duração</th>
              <th>Resgates</th>
              <th>Validade</th>
              <th>Status</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {coupons.length === 0 ? (
              <tr>
                <td colSpan={7} className={local.emptyCell}>
                  {loading ? "Carregando cupons…" : "Nenhum cupom cadastrado no Stripe."}
                </td>
              </tr>
            ) : (
              coupons.map((coupon) => {
                const selected = coupon.id === selectedCouponId;
                const duration =
                  coupon.duration === "repeating" && coupon.duration_in_months
                    ? `${DURATION_LABELS.repeating} · ${coupon.duration_in_months} mês(es)`
                    : DURATION_LABELS[coupon.duration];
                return (
                  <tr
                    key={coupon.id}
                    className={selected ? local.rowSelected : undefined}
                    onClick={() => setSelectedCouponId(coupon.id)}
                  >
                    <td>
                      <strong>{coupon.name ?? coupon.id}</strong>
                      <div className={local.subId}>{coupon.id}</div>
                    </td>
                    <td>{coupon.discount_label}</td>
                    <td>{duration}</td>
                    <td>
                      {coupon.times_redeemed}
                      {coupon.max_redemptions != null ? ` / ${coupon.max_redemptions}` : ""}
                    </td>
                    <td>{fmtDate(coupon.redeem_by)}</td>
                    <td>
                      <span className={coupon.valid ? pageStyles.badgeSynced : pageStyles.badgePending}>
                        {coupon.valid ? "Válido" : "Inválido"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={pageStyles.btnDanger}
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          void onDeleteCoupon(coupon);
                        }}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedCoupon ? (
        <section className={local.promoSection}>
          <div className={pageStyles.toolbar}>
            <div>
              <h2 className={local.formTitle}>Códigos promocionais</h2>
              <p className={local.hint}>
                Cupom <strong>{selectedCoupon.name ?? selectedCoupon.id}</strong> — códigos que o cliente digita no
                checkout (ex.: <code>VERAO20</code>).
              </p>
            </div>
            <button
              type="button"
              className={pageStyles.btnSecondary}
              disabled={!stripeReady || busy}
              onClick={() => setShowPromoForm((v) => !v)}
            >
              {showPromoForm ? "Fechar" : "+ Novo código"}
            </button>
          </div>

          {showPromoForm ? (
            <form className={local.formCard} onSubmit={(e) => void onCreatePromo(e)}>
              <div className={local.fieldGrid}>
                <label className={local.field}>
                  <span>Código (cliente digita no checkout)</span>
                  <input
                    required
                    value={promoForm.code}
                    placeholder="ex.: VERAO20"
                    onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })}
                  />
                </label>
                <label className={local.field}>
                  <span>Limite de usos (opcional)</span>
                  <input
                    type="number"
                    min={1}
                    value={promoForm.max_redemptions}
                    onChange={(e) => setPromoForm({ ...promoForm, max_redemptions: e.target.value })}
                  />
                </label>
                <label className={local.field}>
                  <span>Expira em (opcional)</span>
                  <input
                    type="date"
                    value={promoForm.expires_at}
                    onChange={(e) => setPromoForm({ ...promoForm, expires_at: e.target.value })}
                  />
                </label>
                <label className={local.field}>
                  <span>Valor mínimo do pedido (R$, opcional)</span>
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={promoForm.minimum_amount_brl}
                    onChange={(e) => setPromoForm({ ...promoForm, minimum_amount_brl: e.target.value })}
                  />
                </label>
                <label className={local.checkField}>
                  <input
                    type="checkbox"
                    checked={promoForm.first_time_transaction}
                    onChange={(e) => setPromoForm({ ...promoForm, first_time_transaction: e.target.checked })}
                  />
                  <span>Somente primeira compra do cliente</span>
                </label>
                <label className={local.checkField}>
                  <input
                    type="checkbox"
                    checked={promoForm.active}
                    onChange={(e) => setPromoForm({ ...promoForm, active: e.target.checked })}
                  />
                  <span>Ativo ao criar</span>
                </label>
              </div>
              <div className={local.formActions}>
                <button type="submit" className={pageStyles.btnStripe} disabled={!stripeReady || busy}>
                  Criar código promocional
                </button>
              </div>
            </form>
          ) : null}

          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Usos</th>
                  <th>Expira</th>
                  <th>Restrições</th>
                  <th>Status</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {couponPromos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={local.emptyCell}>
                      Nenhum código promocional para este cupom.
                    </td>
                  </tr>
                ) : (
                  couponPromos.map((promo) => (
                    <tr key={promo.id}>
                      <td>
                        <code>{promo.code}</code>
                      </td>
                      <td>
                        {promo.times_redeemed}
                        {promo.max_redemptions != null ? ` / ${promo.max_redemptions}` : ""}
                      </td>
                      <td>{fmtDate(promo.expires_at)}</td>
                      <td className={local.restrictions}>
                        {promo.first_time_transaction ? "1ª compra" : "—"}
                        {promo.minimum_amount != null
                          ? ` · mín. ${(promo.minimum_amount / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                          : ""}
                      </td>
                      <td>
                        <span className={promo.active ? pageStyles.badgeSynced : pageStyles.badgePending}>
                          {promo.active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={pageStyles.btnSecondary}
                          disabled={busy}
                          onClick={() => void onTogglePromo(promo)}
                        >
                          {promo.active ? "Desativar" : "Ativar"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </section>
  );
}
