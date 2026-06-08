import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  createProductPurchase,
  listProductPurchases,
  type ProductPurchaseOut,
} from "../../api/purchases";
import {
  listFinanceAccounts,
  listFinanceCategories,
  listFinanceCreditCards,
  type FinanceCreditCardOut,
} from "../../api/finance";
import {
  EXPENSE_PAYMENT_METHODS,
  expensePaymentMethodLabel,
  expenseShowsBankAccount,
  expenseShowsCreditCard,
  normalizeExpensePaymentMethod,
  type ExpensePaymentMethod,
} from "../../lib/financePaymentMethods";
import { listProducts, type ProductOut } from "../../api/products";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input, Select } from "../../components/ui/input";
import type { DashboardOutletContext } from "../dashboardContext";
import { isInventoryEnabled } from "../../lib/inventoryEnabled";
import tableStyles from "../listTableCommon.module.css";
import styles from "./PurchasesPage.module.css";

type DraftLine = {
  key: string;
  product_id: number;
  product_name: string;
  sku: string;
  quantity: string;
  unit_cost: string;
};

type TabId = "new" | "history";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function parseNum(s: string): number {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function statusBadgeVariant(status: string): "success" | "warning" | "secondary" {
  if (status === "paid") return "success";
  if (status === "pending" || status === "overdue") return "warning";
  return "secondary";
}

function statusLabel(status: string): string {
  if (status === "paid") return "Pago";
  if (status === "pending") return "Pendente";
  if (status === "overdue") return "Vencido";
  if (status === "cancelled") return "Cancelado";
  return status;
}

function isSameMonth(isoDate: string): boolean {
  const d = new Date(isoDate + "T12:00:00");
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function IconShoppingBag() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function IconWallet() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <circle cx="16" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconPackage() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
    </svg>
  );
}

function IconList() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="2" width="16" height="20" rx="1" />
      <path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" />
    </svg>
  );
}

function IconCreditCard() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <polyline points="9 18 15 12 9 6" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function PurchasesPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const inventoryOn = isInventoryEnabled(ctx?.tenant);

  const [tab, setTab] = useState<TabId>("new");
  const [products, setProducts] = useState<ProductOut[]>([]);
  const [accounts, setAccounts] = useState<{ id: number; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [history, setHistory] = useState<ProductPurchaseOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [supplier, setSupplier] = useState("");
  const [description, setDescription] = useState("Compra de produtos");
  const [purchasedAt, setPurchasedAt] = useState(todayIso);
  const [dueDate, setDueDate] = useState(todayIso);
  const [status, setStatus] = useState<"paid" | "pending">("paid");
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>("pix");
  const [accountId, setAccountId] = useState("");
  const [creditCardId, setCreditCardId] = useState("");
  const [creditCards, setCreditCards] = useState<FinanceCreditCardOut[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [totalPaid, setTotalPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [updateCost, setUpdateCost] = useState(true);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [showProductList, setShowProductList] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [historyFilter, setHistoryFilter] = useState("");

  const loadMeta = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [prods, accs, cats, cards, purchases] = await Promise.all([
        listProducts({ limit: 500, skip: 0 }),
        listFinanceAccounts(),
        listFinanceCategories(),
        listFinanceCreditCards(),
        listProductPurchases({ limit: 50 }),
      ]);
      setProducts(prods);
      setAccounts(accs.map((a) => ({ id: a.id, name: a.name })));
      setCategories(cats.map((c) => ({ id: c.id, name: c.name })));
      setCreditCards(cards.filter((c) => c.is_active));
      setHistory(purchases);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const linesSubtotal = useMemo(
    () => lines.reduce((sum, ln) => sum + parseNum(ln.quantity) * parseNum(ln.unit_cost), 0),
    [lines],
  );

  const financeAmount = useMemo(() => {
    if (totalPaid.trim()) return parseNum(totalPaid);
    return linesSubtotal;
  }, [totalPaid, linesSubtotal]);

  const amountDiff = useMemo(() => financeAmount - linesSubtotal, [financeAmount, linesSubtotal]);

  const showBankAccount = expenseShowsBankAccount(paymentMethod);
  const showCreditCard = expenseShowsCreditCard(paymentMethod);
  const selectedCard = useMemo(
    () => creditCards.find((c) => String(c.id) === creditCardId),
    [creditCards, creditCardId],
  );

  const monthStats = useMemo(() => {
    const monthRows = history.filter((p) => isSameMonth(p.purchased_at));
    const total = monthRows.reduce((s, p) => s + p.total_paid, 0);
    return { count: monthRows.length, total };
  }, [history]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const inCart = new Set(lines.map((l) => l.product_id));
    return products
      .filter((p) => {
        if (inCart.has(p.id)) return false;
        if (!q) return true;
        return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      })
      .slice(0, 12);
  }, [products, productSearch, lines]);

  const filteredHistory = useMemo(() => {
    const q = historyFilter.trim().toLowerCase();
    if (!q) return history;
    return history.filter((p) => {
      const hay = [
        String(p.id),
        p.supplier_name ?? "",
        p.finance_entry?.description ?? "",
        ...p.lines.map((l) => `${l.product_name} ${l.sku}`),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [history, historyFilter]);

  function addLineFromProduct(p: ProductOut) {
    if (lines.some((l) => l.product_id === p.id)) {
      setErr(`«${p.name}» já está na compra.`);
      return;
    }
    setErr("");
    setLines((prev) => [
      ...prev,
      {
        key: `p-${p.id}-${Date.now()}`,
        product_id: p.id,
        product_name: p.name,
        sku: p.sku,
        quantity: "1",
        unit_cost: String(p.purchase_price ?? 0),
      },
    ]);
    setProductSearch("");
    setShowProductList(false);
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function fillTotalFromLines() {
    setTotalPaid(linesSubtotal > 0 ? linesSubtotal.toFixed(2) : "");
  }

  function onPaymentMethodChange(next: string) {
    const pm = normalizeExpensePaymentMethod(next);
    setPaymentMethod(pm);
    if (pm === "credit_card") {
      setAccountId("");
    } else {
      setCreditCardId("");
    }
  }

  function resetForm() {
    setSupplier("");
    setDescription("Compra de produtos");
    setPurchasedAt(todayIso());
    setDueDate(todayIso());
    setStatus("paid");
    setPaymentMethod("pix");
    setAccountId("");
    setCreditCardId("");
    setCategoryId("");
    setTotalPaid("");
    setNotes("");
    setLines([]);
    setProductSearch("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setOk("");
    if (!lines.length) {
      setErr("Adicione ao menos um produto à compra.");
      setTab("new");
      return;
    }
    const amount = financeAmount;
    if (amount <= 0) {
      setErr("Informe o valor pago maior que zero.");
      return;
    }
    if (showCreditCard && !creditCardId) {
      setErr("Selecione o cartão de crédito usado nesta compra.");
      return;
    }
    setSaving(true);
    try {
      const created = await createProductPurchase({
        description: description.trim() || "Compra de produtos",
        total_amount: amount,
        purchased_at: purchasedAt,
        due_date: dueDate,
        status,
        finance_account_id: showBankAccount && accountId ? Number(accountId) : null,
        credit_card_id: showCreditCard && creditCardId ? Number(creditCardId) : null,
        category_id: categoryId ? Number(categoryId) : null,
        payment_method: paymentMethod,
        supplier_name: supplier.trim() || null,
        notes: notes.trim() || null,
        update_product_cost: updateCost,
        lines: lines.map((ln) => ({
          product_id: ln.product_id,
          quantity: parseNum(ln.quantity),
          unit_cost: parseNum(ln.unit_cost),
        })),
      });
      setOk(
        inventoryOn
          ? `Compra #${created.id} registrada com sucesso. Estoque atualizado e despesa lançada no financeiro.`
          : `Compra #${created.id} registrada. Despesa lançada no financeiro.`,
      );
      resetForm();
      const purchases = await listProductPurchases({ limit: 50 });
      setHistory(purchases);
      setTab("history");
      setExpandedId(created.id);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (ctx?.user?.role === "technician") {
    return (
      <div className={styles.wrap}>
        <p className={styles.accessDenied}>Acesso restrito a administradores e recepção.</p>
      </div>
    );
  }

  const summaryPanel = (
    <aside className={styles.summaryCard}>
      <div className={styles.summaryHeader}>
        <h3>Resumo da compra</h3>
        <p>{lines.length} {lines.length === 1 ? "item" : "itens"} no carrinho</p>
      </div>
      <div className={styles.summaryBody}>
        <div className={styles.summaryRow}>
          <span>Forma de pagamento</span>
          <strong>{expensePaymentMethodLabel(paymentMethod)}</strong>
        </div>
        {showCreditCard && selectedCard ? (
          <div className={styles.summaryRow}>
            <span>Cartão</span>
            <strong>{selectedCard.name}</strong>
          </div>
        ) : null}
        <div className={styles.summaryRow}>
          <span>Soma dos itens</span>
          <strong>{formatCurrency(linesSubtotal)}</strong>
        </div>
        <div className={styles.field}>
          <label htmlFor="totalPaidSide">Valor pago (nota)</label>
          <Input
            id="totalPaidSide"
            type="number"
            min={0}
            step="0.01"
            placeholder={linesSubtotal > 0 ? linesSubtotal.toFixed(2) : "0,00"}
            value={totalPaid}
            onChange={(e) => setTotalPaid(e.target.value)}
          />
          <Button type="button" variant="outline" size="sm" className={styles.fillBtn} onClick={fillTotalFromLines}>
            Usar soma dos itens
          </Button>
        </div>
        {Math.abs(amountDiff) > 0.009 && lines.length > 0 ? (
          <div className={styles.diffWarning}>
            Diferença de {formatCurrency(Math.abs(amountDiff))}{" "}
            {amountDiff > 0 ? "a mais" : "a menos"} em relação aos itens — útil para frete, impostos ou desconto.
          </div>
        ) : null}
        <div className={styles.summaryTotal}>
          <span>Lançamento financeiro</span>
          <span className={styles.summaryTotalAmount}>{formatCurrency(financeAmount)}</span>
        </div>
        {inventoryOn ? (
          <label className={styles.checkboxCard}>
            <input type="checkbox" checked={updateCost} onChange={(e) => setUpdateCost(e.target.checked)} />
            <span>Atualizar preço de compra dos produtos com o custo informado</span>
          </label>
        ) : null}
      </div>
      <div className={styles.summaryActions}>
        <Button type="submit" form="purchase-form" size="lg" disabled={saving || loading || lines.length === 0}>
          {saving ? "Registrando…" : "Registrar compra"}
        </Button>
        <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
          Limpar formulário
        </Button>
      </div>
    </aside>
  );

  return (
    <div className={styles.wrap}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Compras</h1>
          <p className={styles.pageSubtitle}>
            Registre entradas de mercadoria, controle custos e integre automaticamente com o financeiro
            {inventoryOn ? " e o estoque." : "."}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link to="/app/products">
            <Button type="button" variant="outline">
              Produtos
            </Button>
          </Link>
          <Link to="/app/finance/dashboard">
            <Button type="button" variant="outline">
              Financeiro
            </Button>
          </Link>
        </div>
      </header>

      <div className={styles.heroStats}>
        <div className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Compras no mês</p>
              <p className={styles.statValue}>{loading ? "—" : monthStats.count}</p>
            </div>
            <div className={styles.statIconWrap}>
              <IconShoppingBag />
            </div>
          </div>
          <p className={styles.statHint}>Registros em {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Valor no mês</p>
              <p className={styles.statValue}>{loading ? "—" : formatCurrency(monthStats.total)}</p>
            </div>
            <div className={styles.statIconWrap}>
              <IconWallet />
            </div>
          </div>
          <p className={styles.statHint}>Total pago nas compras</p>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Rascunho atual</p>
              <p className={styles.statValue}>{lines.length}</p>
            </div>
            <div className={styles.statIconWrap}>
              <IconList />
            </div>
          </div>
          <p className={styles.statHint}>Itens aguardando registro</p>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Estoque</p>
              <p className={styles.statValue} style={{ fontSize: "1.125rem" }}>
                {inventoryOn ? "Ativo" : "Desligado"}
              </p>
            </div>
            <div className={styles.statIconWrap}>
              <IconPackage />
            </div>
          </div>
          <p className={styles.statHint}>
            {inventoryOn ? "Entrada automática ao registrar" : "Somente lançamento financeiro"}
          </p>
        </div>
      </div>

      {err ? (
        <div className={styles.msgErr} role="alert">
          {err}
        </div>
      ) : null}
      {ok ? (
        <div className={styles.msgOk} role="status">
          {ok}
        </div>
      ) : null}

      <div>
        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "new"}
            className={`${styles.tab} ${tab === "new" ? styles.tabActive : ""}`}
            onClick={() => setTab("new")}
          >
            Nova compra
            {lines.length > 0 ? <span className={styles.tabBadge}>{lines.length}</span> : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "history"}
            className={`${styles.tab} ${tab === "history" ? styles.tabActive : ""}`}
            onClick={() => setTab("history")}
          >
            Histórico
            <span className={styles.tabBadge}>{history.length}</span>
          </button>
        </div>

        {tab === "new" ? (
          <div className={styles.panelShell}>
            <form id="purchase-form" className={styles.mainGrid} onSubmit={(ev) => void onSubmit(ev)}>
              <div className={styles.formSections}>
                <section className={styles.section}>
                  <div className={styles.sectionHead}>
                    <span className={styles.sectionIcon}>
                      <IconBuilding />
                    </span>
                    <div>
                      <h2 className={styles.sectionTitle}>Identificação</h2>
                      <p className={styles.sectionDesc}>Fornecedor e descrição que aparecerão no financeiro</p>
                    </div>
                  </div>
                  <div className={`${styles.fieldGrid2}`}>
                    <div className={styles.field}>
                      <label htmlFor="supplier">Fornecedor</label>
                      <Input
                        id="supplier"
                        value={supplier}
                        onChange={(e) => setSupplier(e.target.value)}
                        placeholder="Ex.: Distribuidora Ar Frio"
                      />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="description">Descrição no financeiro</label>
                      <Input
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className={styles.field} style={{ marginTop: "var(--space-4)" }}>
                    <label htmlFor="notes">Observações internas</label>
                    <Input
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Número da NF, condição de pagamento…"
                    />
                  </div>
                </section>

                <section className={styles.section}>
                  <div className={styles.sectionHead}>
                    <span className={styles.sectionIcon}>
                      <IconCreditCard />
                    </span>
                    <div>
                      <h2 className={styles.sectionTitle}>Pagamento</h2>
                      <p className={styles.sectionDesc}>Datas, conta e status do lançamento</p>
                    </div>
                  </div>
                  <div className={styles.fieldGrid3}>
                    <div className={styles.field}>
                      <label htmlFor="purchasedAt">Data da compra</label>
                      <Input
                        id="purchasedAt"
                        type="date"
                        value={purchasedAt}
                        onChange={(e) => setPurchasedAt(e.target.value)}
                        required
                      />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="dueDate">Vencimento</label>
                      <Input
                        id="dueDate"
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="status">Status</label>
                      <Select id="status" value={status} onChange={(e) => setStatus(e.target.value as "paid" | "pending")}>
                        <option value="paid">Pago</option>
                        <option value="pending">Pendente (a pagar)</option>
                      </Select>
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="paymentMethod">Forma de pagamento</label>
                      <Select
                        id="paymentMethod"
                        value={paymentMethod}
                        onChange={(e) => onPaymentMethodChange(e.target.value)}
                      >
                        {EXPENSE_PAYMENT_METHODS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    {showBankAccount ? (
                      <div className={styles.field}>
                        <label htmlFor="account">Conta de saída</label>
                        <Select id="account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                          <option value="">Selecionar conta…</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </Select>
                        <span className={styles.fieldHint}>
                          {paymentMethod === "pix"
                            ? "Conta debitada no PIX."
                            : paymentMethod === "cash"
                              ? "Ex.: caixa ou conta onde saiu o dinheiro."
                              : "Conta usada no pagamento."}
                        </span>
                      </div>
                    ) : null}
                    {showCreditCard ? (
                      <div className={styles.field}>
                        <label htmlFor="creditCard">Cartão de crédito</label>
                        <Select id="creditCard" value={creditCardId} onChange={(e) => setCreditCardId(e.target.value)}>
                          <option value="">Selecionar cartão…</option>
                          {creditCards.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                              {c.available_limit != null
                                ? ` · disp. ${formatCurrency(c.available_limit)}`
                                : ""}
                            </option>
                          ))}
                        </Select>
                        {creditCards.length === 0 ? (
                          <span className={styles.fieldHint}>
                            Nenhum cartão cadastrado.{" "}
                            <Link to="/app/finance/settings/cards">Cadastrar em Financeiro → Cartões</Link>
                          </span>
                        ) : (
                          <span className={styles.fieldHint}>
                            A compra entra na fatura do cartão; o débito na conta ocorre ao pagar a fatura.
                          </span>
                        )}
                      </div>
                    ) : null}
                    <div className={styles.field}>
                      <label htmlFor="category">Categoria</label>
                      <Select id="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                        <option value="">Opcional</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                </section>

                <section className={styles.section}>
                  <div className={styles.sectionHead}>
                    <span className={styles.sectionIcon}>
                      <IconPackage />
                    </span>
                    <div>
                      <h2 className={styles.sectionTitle}>Itens da compra</h2>
                      <p className={styles.sectionDesc}>Busque produtos cadastrados e informe quantidade e custo</p>
                    </div>
                    {inventoryOn ? <Badge variant="default">+ estoque</Badge> : null}
                  </div>

                  <div className={styles.productPicker}>
                    <div className={styles.searchWrap}>
                      <span className={styles.searchIcon}>
                        <IconSearch />
                      </span>
                      <Input
                        className={styles.searchInput}
                        value={productSearch}
                        onChange={(e) => {
                          setProductSearch(e.target.value);
                          setShowProductList(true);
                        }}
                        onFocus={() => setShowProductList(true)}
                        placeholder="Buscar por nome ou SKU…"
                        autoComplete="off"
                        disabled={loading}
                      />
                    </div>
                    {showProductList && filteredProducts.length > 0 ? (
                      <div className={styles.productDropdown}>
                        {filteredProducts.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className={styles.productOption}
                            onClick={() => addLineFromProduct(p)}
                          >
                            <div>
                              <div className={styles.productOptionName}>{p.name}</div>
                              <div className={styles.productOptionMeta}>
                                SKU {p.sku}
                                {inventoryOn ? ` · Estoque ${p.stock_quantity ?? p.quantity_physical ?? 0}` : ""}
                              </div>
                            </div>
                            <span className={styles.productOptionPrice}>{formatCurrency(p.purchase_price ?? 0)}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {showProductList && productSearch.trim() && filteredProducts.length === 0 ? (
                      <p className={styles.fieldHint}>Nenhum produto encontrado ou já adicionado.</p>
                    ) : null}
                  </div>

                  {lines.length === 0 ? (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyStateIcon}>
                        <IconPackage />
                      </div>
                      <p className={styles.emptyStateTitle}>Nenhum item adicionado</p>
                      <p>Use a busca acima para incluir produtos nesta compra.</p>
                    </div>
                  ) : (
                    <div className={styles.linesTableWrap}>
                      <table className={styles.linesTable}>
                        <thead>
                          <tr>
                            <th>Produto</th>
                            <th>Qtd</th>
                            <th>Custo un.</th>
                            <th>Subtotal</th>
                            <th aria-label="Ações" />
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((ln) => {
                            const sub = parseNum(ln.quantity) * parseNum(ln.unit_cost);
                            return (
                              <tr key={ln.key}>
                                <td className={styles.lineProductCell}>
                                  <strong>{ln.product_name}</strong>
                                  <span>SKU {ln.sku}</span>
                                </td>
                                <td>
                                  <Input
                                    className={styles.lineInput}
                                    type="number"
                                    min={0.001}
                                    step="any"
                                    value={ln.quantity}
                                    onChange={(e) => updateLine(ln.key, { quantity: e.target.value })}
                                    aria-label="Quantidade"
                                  />
                                </td>
                                <td>
                                  <Input
                                    className={styles.lineInput}
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={ln.unit_cost}
                                    onChange={(e) => updateLine(ln.key, { unit_cost: e.target.value })}
                                    aria-label="Custo unitário"
                                  />
                                </td>
                                <td className={styles.lineSubtotal}>{formatCurrency(sub)}</td>
                                <td>
                                  <button
                                    type="button"
                                    className={styles.removeBtn}
                                    onClick={() => removeLine(ln.key)}
                                    aria-label={`Remover ${ln.product_name}`}
                                  >
                                    ×
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>

              {summaryPanel}
            </form>
          </div>
        ) : (
          <div className={styles.panelShell}>
            <div className={styles.historyPanel}>
              <div className={styles.historyToolbar}>
                <div className={`${tableStyles.listToolbarSearchCol}`} style={{ flex: "1 1 240px" }}>
                  <label className={tableStyles.listToolbarLabel} htmlFor="history-search">
                    Buscar no histórico
                  </label>
                  <div className={tableStyles.listToolbarSearchWrap}>
                    <span className={tableStyles.listToolbarSearchIcon}>
                      <IconSearch />
                    </span>
                    <input
                      id="history-search"
                      className={tableStyles.listToolbarSearchInput}
                      value={historyFilter}
                      onChange={(e) => setHistoryFilter(e.target.value)}
                      placeholder="Fornecedor, produto, nº da compra…"
                    />
                  </div>
                </div>
                <Button variant="outline" onClick={() => void loadMeta()} disabled={loading}>
                  Atualizar
                </Button>
                <Button onClick={() => setTab("new")}>Nova compra</Button>
              </div>

              {loading ? (
                <div className={styles.emptyState}>
                  <p>Carregando histórico…</p>
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyStateIcon}>
                    <IconShoppingBag />
                  </div>
                  <p className={styles.emptyStateTitle}>
                    {history.length === 0 ? "Nenhuma compra registrada" : "Nenhum resultado"}
                  </p>
                  <p>
                    {history.length === 0
                      ? "Registre sua primeira compra na aba Nova compra."
                      : "Tente outro termo de busca."}
                  </p>
                  {history.length === 0 ? (
                    <Button style={{ marginTop: "var(--space-4)" }} onClick={() => setTab("new")}>
                      Registrar compra
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className={tableStyles.tableWrap}>
                  <table className={tableStyles.table}>
                    <thead>
                      <tr>
                        <th className={styles.expandCell} aria-hidden />
                        <th>Data</th>
                        <th>Compra</th>
                        <th className={tableStyles.cellRight}>Valor</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistory.map((p) => {
                        const expanded = expandedId === p.id;
                        const st = p.finance_entry?.status ?? "";
                        return (
                          <Fragment key={p.id}>
                            <tr
                              className={`${styles.purchaseRow} ${expanded ? styles.purchaseRowExpanded : ""}`}
                              onClick={() => setExpandedId(expanded ? null : p.id)}
                            >
                              <td className={styles.expandCell}>
                                <IconChevronRight />
                              </td>
                              <td>
                                {new Date(p.purchased_at + "T12:00:00").toLocaleDateString("pt-BR")}
                              </td>
                              <td>
                                <strong>#{p.id}</strong>
                                {p.supplier_name ? (
                                  <div style={{ fontSize: "0.875rem", color: "var(--color-text)" }}>{p.supplier_name}</div>
                                ) : null}
                                <div style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
                                  {p.finance_entry?.description ?? "—"}
                                </div>
                                <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                                  {p.lines.length} {p.lines.length === 1 ? "item" : "itens"}
                                  {p.finance_entry?.payment_method
                                    ? ` · ${expensePaymentMethodLabel(p.finance_entry.payment_method)}`
                                    : ""}
                                  {p.lines_subtotal !== p.total_paid
                                    ? ` · Itens ${formatCurrency(p.lines_subtotal)}`
                                    : ""}
                                </div>
                              </td>
                              <td className={tableStyles.cellRight}>
                                <strong>{formatCurrency(p.total_paid)}</strong>
                              </td>
                              <td onClick={(e) => e.stopPropagation()}>
                                <Badge variant={statusBadgeVariant(st)}>{statusLabel(st)}</Badge>
                              </td>
                            </tr>
                            {expanded ? (
                              <tr className={styles.detailRow}>
                                <td colSpan={5}>
                                  <div className={styles.detailInner}>
                                    <div className={styles.detailLines}>
                                      {p.lines.map((ln) => (
                                        <div key={ln.id} className={styles.detailLine}>
                                          <div>
                                            <strong>{ln.product_name}</strong>
                                            <div className={styles.detailLineMeta}>
                                              SKU {ln.sku} · {ln.quantity} un. × {formatCurrency(ln.unit_cost)}
                                            </div>
                                          </div>
                                          <strong>{formatCurrency(ln.line_total)}</strong>
                                        </div>
                                      ))}
                                    </div>
                                    <Link
                                      to="/app/finance/dashboard"
                                      className={styles.financeLink}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      Ver no financeiro →
                                    </Link>
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
