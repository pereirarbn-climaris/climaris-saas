import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  createStockAdjustment,
  listInventory,
  listStockMovements,
  type InventoryProductRow,
  type StockMovementOut,
} from "../../api/inventory";
import type { DashboardOutletContext } from "../dashboardContext";
import loginStyles from "../LoginPage.module.css";
import tableStyles from "../listTableCommon.module.css";
import styles from "./StockPage.module.css";

function formatQty(n: number): string {
  const s = Number(n).toFixed(3).replace(/\.?0+$/, "");
  return s || "0";
}

function movementReasonLabel(r: string): string {
  const map: Record<string, string> = {
    os_consumption: "Baixa OS",
    manual_adjust: "Ajuste manual",
  };
  return map[r] ?? r;
}

export function StockPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const [rows, setRows] = useState<InventoryProductRow[]>([]);
  const [movements, setMovements] = useState<StockMovementOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [movLoading, setMovLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [adjProductId, setAdjProductId] = useState("");
  const [adjDelta, setAdjDelta] = useState("");
  const [adjNotes, setAdjNotes] = useState("");
  const [adjSaving, setAdjSaving] = useState(false);

  const canAdjust = useMemo(() => ctx?.user.role === "admin" || ctx?.user.role === "receptionist", [ctx?.user.role]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const list = await listInventory({ limit: 200 });
      setRows(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMovements = useCallback(async () => {
    setMovLoading(true);
    try {
      const m = await listStockMovements({ limit: 40 });
      setMovements(m);
    } catch {
      setMovements([]);
    } finally {
      setMovLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadMovements();
  }, [loadMovements]);

  async function onAdjust(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!canAdjust) return;
    const pid = Number(adjProductId);
    const delta = Number(adjDelta.replace(",", "."));
    if (!Number.isFinite(pid) || pid < 1) {
      setMsg({ kind: "err", text: "Selecione um produto." });
      return;
    }
    if (!Number.isFinite(delta) || delta === 0) {
      setMsg({ kind: "err", text: "Informe uma quantidade diferente de zero." });
      return;
    }
    setAdjSaving(true);
    try {
      await createStockAdjustment({
        product_id: pid,
        quantity_delta: delta,
        notes: adjNotes.trim() || null,
      });
      setMsg({ kind: "ok", text: "Ajuste registrado." });
      setAdjDelta("");
      setAdjNotes("");
      await load();
      await loadMovements();
    } catch (ex) {
      setMsg({ kind: "err", text: ex instanceof Error ? ex.message : "Erro ao ajustar." });
    } finally {
      setAdjSaving(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Estoque</h1>
      <p className={styles.sub}>
        Saldo físico, reserva em OS aprovadas ou em andamento (insumos dos serviços + itens de produto), e saldo disponível.
      </p>

      {loading ? <p className={styles.loading}>Carregando...</p> : null}
      {err ? <p className={styles.msgErr}>{err}</p> : null}

      {canAdjust ? (
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Ajuste manual</h2>
          <form onSubmit={(e) => void onAdjust(e)}>
            <div className={styles.formRow}>
              <div className={`${styles.field} ${styles.fieldGrow}`}>
                <label className={loginStyles.label} htmlFor="inv-product">
                  Produto
                </label>
                <select
                  id="inv-product"
                  className={loginStyles.input}
                  value={adjProductId}
                  onChange={(e) => setAdjProductId(e.target.value)}
                  required
                >
                  <option value="">Selecionar</option>
                  {rows.map((r) => (
                    <option key={r.product_id} value={String(r.product_id)}>
                      {r.name} ({r.sku})
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={loginStyles.label} htmlFor="inv-delta">
                  Quantidade (+ entrada / − saída)
                </label>
                <input
                  id="inv-delta"
                  className={loginStyles.input}
                  type="text"
                  inputMode="decimal"
                  value={adjDelta}
                  onChange={(e) => setAdjDelta(e.target.value)}
                  placeholder="ex: 10 ou -2.5"
                  required
                />
              </div>
              <div className={`${styles.field} ${styles.fieldGrow}`}>
                <label className={loginStyles.label} htmlFor="inv-notes">
                  Observação (opcional)
                </label>
                <input
                  id="inv-notes"
                  className={loginStyles.input}
                  type="text"
                  value={adjNotes}
                  onChange={(e) => setAdjNotes(e.target.value)}
                />
              </div>
              <div className={styles.actions}>
                <button type="submit" className={styles.btnPrimary} disabled={adjSaving}>
                  {adjSaving ? "Salvando..." : "Registrar"}
                </button>
              </div>
            </div>
          </form>
          {msg?.kind === "ok" ? <p className={styles.msgOk}>{msg.text}</p> : null}
          {msg?.kind === "err" ? <p className={styles.msgErr}>{msg.text}</p> : null}
        </div>
      ) : null}

      <div className={tableStyles.tableWrap}>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th>Produto</th>
              <th>SKU</th>
              <th className={tableStyles.cellRight}>Saldo</th>
              <th className={tableStyles.cellRight}>Reservado</th>
              <th className={tableStyles.cellRight}>Disponível</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.product_id}>
                <td>{r.name}</td>
                <td className={tableStyles.cellMuted}>{r.sku}</td>
                <td className={tableStyles.cellRight}>{formatQty(r.stock_quantity)}</td>
                <td className={tableStyles.cellRight}>{formatQty(r.reserved_quantity)}</td>
                <td
                  className={`${tableStyles.cellRight} ${r.available_quantity < 0 ? styles.neg : r.available_quantity === 0 ? styles.warn : ""}`}
                >
                  {formatQty(r.available_quantity)}
                </td>
                <td>{r.is_active ? "Ativo" : "Inativo"}</td>
                <td className={tableStyles.cellRight}>
                  <Link className={tableStyles.rowLink} to={`/app/products/${r.product_id}`}>
                    Editar cadastro
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className={styles.sectionTitle}>Últimas movimentações</h2>
      {movLoading ? <p className={styles.loading}>Carregando movimentações...</p> : null}
      <div className={tableStyles.tableWrap}>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th>Data</th>
              <th>Produto</th>
              <th className={tableStyles.cellRight}>Δ</th>
              <th>Motivo</th>
              <th>OS</th>
              <th>Obs.</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => {
              const prod = rows.find((r) => r.product_id === m.product_id);
              return (
                <tr key={m.id}>
                  <td className={tableStyles.cellMuted}>
                    {new Intl.DateTimeFormat("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(m.created_at))}
                  </td>
                  <td>{prod ? `${prod.name} (${prod.sku})` : `#${m.product_id}`}</td>
                  <td className={`${tableStyles.cellRight} ${m.quantity_delta < 0 ? styles.neg : ""}`}>
                    {formatQty(m.quantity_delta)}
                  </td>
                  <td>{movementReasonLabel(m.reason)}</td>
                  <td>
                    {m.service_order_id ? (
                      <Link className={tableStyles.rowLink} to={`/app/service-orders/${m.service_order_id}`}>
                        #{m.service_order_id}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={tableStyles.cellMuted}>{m.notes ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
