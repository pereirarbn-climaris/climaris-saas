import { useEffect, useState } from "react";
import { Link, Navigate, useOutletContext, useParams } from "react-router-dom";
import {
  deleteEquipmentDocumentAttachment,
  getEquipmentDocument,
  listEquipmentDocumentAttachments,
  listEquipmentDocumentEvents,
  uploadEquipmentDocumentAttachment,
  type EquipmentDocumentAttachmentOut,
  type EquipmentDocumentEventOut,
  type EquipmentDocumentOut,
} from "../../api/clients";
import type { DashboardOutletContext } from "../dashboardContext";
import styles from "./ClientFormPage.module.css";

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function EquipmentDocumentDetailPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const { equipmentId, documentId } = useParams<{ equipmentId: string; documentId: string }>();
  const equipmentNum = Number(equipmentId);
  const documentNum = Number(documentId);
  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist" || ctx?.user.role === "technician";
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [document, setDocument] = useState<EquipmentDocumentOut | null>(null);
  const [attachments, setAttachments] = useState<EquipmentDocumentAttachmentOut[]>([]);
  const [events, setEvents] = useState<EquipmentDocumentEventOut[]>([]);

  useEffect(() => {
    if (!Number.isFinite(equipmentNum) || !Number.isFinite(documentNum)) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [doc, atts, evs] = await Promise.all([
          getEquipmentDocument(equipmentNum, documentNum),
          listEquipmentDocumentAttachments(equipmentNum, documentNum),
          listEquipmentDocumentEvents(equipmentNum, documentNum, 300),
        ]);
        if (!cancelled) {
          setDocument(doc);
          setAttachments(atts);
          setEvents(evs);
        }
      } catch (err) {
        if (!cancelled) setMsg({ kind: "err", text: err instanceof Error ? err.message : "Erro ao carregar documento." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentNum, equipmentNum]);

  async function refreshAll() {
    const [doc, atts, evs] = await Promise.all([
      getEquipmentDocument(equipmentNum, documentNum),
      listEquipmentDocumentAttachments(equipmentNum, documentNum),
      listEquipmentDocumentEvents(equipmentNum, documentNum, 300),
    ]);
    setDocument(doc);
    setAttachments(atts);
    setEvents(evs);
  }

  async function onUpload(files: FileList | null) {
    if (!files?.length || !canEdit) return;
    setBusy(true);
    setMsg(null);
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i]!;
        await uploadEquipmentDocumentAttachment(equipmentNum, documentNum, f);
      }
      await refreshAll();
      setMsg({ kind: "ok", text: "Anexo enviado com sucesso." });
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Erro ao enviar anexo." });
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteAttachment(attachmentId: number) {
    if (!canEdit || !window.confirm("Remover este anexo?")) return;
    setBusy(true);
    setMsg(null);
    try {
      await deleteEquipmentDocumentAttachment(equipmentNum, documentNum, attachmentId);
      await refreshAll();
      setMsg({ kind: "ok", text: "Anexo removido." });
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Erro ao remover anexo." });
    } finally {
      setBusy(false);
    }
  }

  if (!ctx) return <Navigate to="/login" replace />;
  if (!Number.isFinite(equipmentNum) || !Number.isFinite(documentNum)) return <Navigate to="/app/clients" replace />;

  return (
    <div className={styles.wrap}>
      <div className={styles.actions}>
        <Link className={styles.btnBackLink} to="/app/clients">
          ← Voltar
        </Link>
      </div>
      {loading ? <p className={styles.loading}>Carregando documento…</p> : null}
      {document ? (
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Documento</h2>
            <div className={styles.grid2}>
              <p><strong>Número:</strong> #{document.document_number}</p>
              <p><strong>Tipo:</strong> {document.document_type}</p>
              <p><strong>Status:</strong> {document.status}</p>
              <p><strong>Título:</strong> {document.title}</p>
              <p><strong>Emitido em:</strong> {formatDateTime(document.issued_at)}</p>
              <p><strong>Válido até:</strong> {document.valid_until ?? "-"}</p>
              <p><strong>Próxima manutenção:</strong> {document.next_due_at ?? "-"}</p>
              <p><strong>Versão schema:</strong> {document.schema_version}</p>
            </div>
            {document.notes ? <p className={styles.lead}>{document.notes}</p> : null}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Anexos</h2>
            {canEdit ? (
              <label className={styles.btnSecondary}>
                <input
                  type="file"
                  multiple
                  disabled={busy}
                  style={{ display: "none" }}
                  onChange={(e) => void onUpload(e.target.files)}
                />
                {busy ? "Enviando..." : "Enviar anexo"}
              </label>
            ) : null}
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Arquivo</th>
                    <th>Tipo</th>
                    <th>Enviado em</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {attachments.map((a) => (
                    <tr key={a.id}>
                      <td>{a.file_url ? <a href={a.file_url} target="_blank" rel="noreferrer">{a.file_name ?? "Arquivo"}</a> : (a.file_name ?? "-")}</td>
                      <td>{a.file_type}</td>
                      <td>{formatDateTime(a.created_at)}</td>
                      <td>
                        {canEdit ? (
                          <button
                            type="button"
                            className={styles.btnDanger}
                            disabled={busy}
                            onClick={() => void onDeleteAttachment(a.id)}
                          >
                            Remover
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {attachments.length === 0 ? (
                    <tr>
                      <td colSpan={4}>Sem anexos.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Timeline</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Evento</th>
                    <th>Usuário</th>
                    <th>Dados</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id}>
                      <td>{formatDateTime(e.created_at)}</td>
                      <td>{e.event_type}</td>
                      <td>{e.actor_user_id ?? "-"}</td>
                      <td>{e.metadata_json ?? "-"}</td>
                    </tr>
                  ))}
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={4}>Sem eventos.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
      {msg?.kind === "ok" ? <p className={styles.msgOk}>{msg.text}</p> : null}
      {msg?.kind === "err" ? <p className={styles.msgErr}>{msg.text}</p> : null}
    </div>
  );
}
