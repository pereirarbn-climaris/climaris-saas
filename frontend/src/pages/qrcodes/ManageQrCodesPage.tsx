import { useCallback, useEffect, useMemo, useState } from "react";
import { QrLabelsPrintPanel } from "../../components/qrcodes/QrLabelsPrintPanel";
import {
  generateQrCodes,
  listQrCodes,
  resetQrCodesInventory,
  type QrCodeLabelStatus,
  type QrCodeOut,
} from "../../api/qrcodes";
import { A4_LABELS_PER_PAGE, type QrLabelPrintFormat, type QrLabelPrintItem } from "../../lib/qrcodeLabelsPdf";
import type { QrLabelLayoutModel } from "../../lib/generateQrLabelLayout";
import { resolveQrLabelLogoUrl } from "../../lib/qrLabelLogoUrl";
import tableStyles from "../listTableCommon.module.css";
import styles from "./ManageQrCodesPage.module.css";

export function ManageQrCodesPage() {
  const [rows, setRows] = useState<QrCodeOut[]>([]);
  const [counts, setCounts] = useState({ available: 0, linked: 0 });
  const [statusFilter, setStatusFilter] = useState<"all" | QrCodeLabelStatus>("available");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printFormat, setPrintFormat] = useState<QrLabelPrintFormat>("a4_grid");
  const [layoutModel, setLayoutModel] = useState<QrLabelLayoutModel>("standard");

  const printItems: QrLabelPrintItem[] = useMemo(() => {
    const source = selected.size > 0 ? rows.filter((r) => selected.has(r.code_id)) : rows;
    return source.map((r) => ({
      codeId: r.code_id,
      logoUrl: resolveQrLabelLogoUrl(r),
    }));
  }, [selected, rows]);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const data = await listQrCodes({
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: 500,
      });
      setRows(data.items);
      setCounts(data.counts);
      setSelected(new Set());
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao carregar etiquetas." });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onResetInventory() {
    const ok = window.confirm(
      "Isso apaga TODAS as etiquetas QR desta empresa (inclusive vinculadas). Equipamentos ficam sem cartela. Próximo lote começa em QR0000001. Continuar?",
    );
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    try {
      const result = await resetQrCodesInventory();
      await load();
      setMsg({
        kind: "ok",
        text: `${result.message} (${result.deleted} removida(s); próximo: ${result.next_code_id})`,
      });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao zerar inventário." });
    } finally {
      setBusy(false);
    }
  }

  async function onGenerate() {
    setBusy(true);
    setMsg(null);
    try {
      const result = await generateQrCodes(A4_LABELS_PER_PAGE);
      await load();
      setMsg({
        kind: "ok",
        text: `Lote gerado: ${result.created} etiquetas (${result.first_code_id ?? ""} … ${result.last_code_id ?? ""}).`,
      });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao gerar lote." });
    } finally {
      setBusy(false);
    }
  }

  function toggleSelect(codeId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(codeId)) next.delete(codeId);
      else next.add(codeId);
      return next;
    });
  }

  function selectAllVisible() {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.code_id)));
    }
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderMain}>
          <h1 className={styles.title}>Gestão de Etiquetas QR</h1>
          <p className={styles.subtitle}>
            Gere lotes de 28 cartelas por folha A4, visualize o layout, exporte em PDF e vincule aos equipamentos pelo código
            impresso.
          </p>
        </div>
        <div className={styles.statRow} aria-label="Resumo do inventário">
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Disponíveis</span>
            <strong className={styles.statValue}>{counts.available}</strong>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Vinculadas</span>
            <strong className={styles.statValue}>{counts.linked}</strong>
          </div>
        </div>
      </header>

      <div className={styles.generateBar}>
        <div className={styles.generateBarText}>
          <span className={styles.generateBarTitle}>Novo lote</span>
          <span className={styles.generateBarHint}>
            Cada clique adiciona {A4_LABELS_PER_PAGE} etiquetas sequenciais (uma folha A4).
          </span>
        </div>
        <div className={styles.generateBarActions}>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={busy}
            onClick={() => void onGenerate()}
          >
            {busy ? "Gerando…" : `Gerar lote (${A4_LABELS_PER_PAGE})`}
          </button>
          <button type="button" className={styles.btnGhost} disabled={loading} onClick={() => void load()}>
            Atualizar lista
          </button>
          <button
            type="button"
            className={styles.btnDanger}
            disabled={busy || loading}
            onClick={() => void onResetInventory()}
            title="Remove todas as cartelas; próxima geração começa em QR0000001"
          >
            Zerar inventário
          </button>
        </div>
      </div>

      {msg ? (
        <p className={msg.kind === "err" ? styles.err : styles.ok} role="alert">
          {msg.text}
        </p>
      ) : null}

      <QrLabelsPrintPanel
        items={printItems}
        format={printFormat}
        onFormatChange={setPrintFormat}
        layoutModel={layoutModel}
        onLayoutModelChange={setLayoutModel}
        onError={(text) => setMsg({ kind: "err", text })}
      />

      <section className={styles.inventorySection} aria-label="Etiquetas geradas">
        <div className={styles.inventoryHead}>
          <div>
            <h2 className={styles.sectionTitle}>Etiquetas geradas</h2>
            <p className={styles.sectionHint}>
              {selected.size > 0
                ? `${selected.size} selecionada(s) — a impressão acima usa só a seleção.`
                : "Sem seleção — a impressão acima usa todas as etiquetas do filtro."}
            </p>
          </div>
          <div className={styles.inventoryFilters}>
            <label className={styles.filterLabel} htmlFor="qr-filter">
              Filtrar
            </label>
            <select
              id="qr-filter"
              className={styles.filterSelect}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | QrCodeLabelStatus)}
            >
              <option value="available">Disponível</option>
              <option value="linked">Vinculado</option>
              <option value="all">Todos</option>
            </select>
          </div>
        </div>

        <div className={tableStyles.tableWrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th className={styles.checkCol}>
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={selectAllVisible}
                    disabled={!rows.length}
                    aria-label="Selecionar todas as etiquetas visíveis"
                  />
                </th>
                <th>Código</th>
                <th>Status</th>
                <th>Equipamento</th>
                <th>Link público</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className={styles.tableEmpty}>
                    Carregando…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.tableEmpty}>
                    Nenhuma etiqueta neste filtro. Use <strong>Gerar lote</strong> para começar.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className={selected.has(row.code_id) ? styles.rowSelected : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(row.code_id)}
                        onChange={() => toggleSelect(row.code_id)}
                        aria-label={`Selecionar ${row.code_id}`}
                      />
                    </td>
                    <td>
                      <code className={styles.code}>{row.code_id}</code>
                    </td>
                    <td>
                      <span className={row.status === "available" ? styles.badgeAvail : styles.badgeLinked}>
                        {row.status === "available" ? "Disponível" : "Vinculado"}
                      </span>
                    </td>
                    <td>{row.linked_to_equipment_id ? `#${row.linked_to_equipment_id}` : "—"}</td>
                    <td>
                      {row.tracking_url ? (
                        <a href={row.tracking_url} target="_blank" rel="noreferrer" className={styles.link}>
                          Abrir
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
