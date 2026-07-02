import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  PROJECT_PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  createPlatformProject,
  createPlatformProjectTask,
  deletePlatformProjectTask,
  getPlatformProject,
  listPlatformProjects,
  patchPlatformProject,
  patchPlatformProjectTask,
  type PlatformProjectOut,
  type PlatformProjectPriority,
  type PlatformProjectStatus,
  type PlatformProjectTaskStatus,
} from "../api/platformProjects";
import {
  PROJECT_TASK_TEMPLATE_CATEGORIES,
  PROJECT_TASK_TEMPLATES,
} from "../lib/platformProjectTemplates";
import styles from "./PlatformProjectsPage.module.css";

const BOARD_COLUMNS: PlatformProjectStatus[] = [
  "lead",
  "onboarding",
  "implementation",
  "delivered",
  "on_hold",
];

type DetailTab = "overview" | "plan" | "contact";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

function isOverdue(deadline: string | null): boolean {
  if (!deadline) return false;
  const d = new Date(`${deadline}T23:59:59`);
  return !Number.isNaN(d.getTime()) && d < new Date();
}

function priorityClass(priority: PlatformProjectPriority): string {
  switch (priority) {
    case "urgent":
      return styles.priorityUrgent;
    case "high":
      return styles.priorityHigh;
    case "low":
      return styles.priorityLow;
    default:
      return styles.priorityNormal;
  }
}

function taskStatusClass(status: PlatformProjectTaskStatus): string {
  switch (status) {
    case "done":
      return styles.statusDone;
    case "in_progress":
      return styles.statusProgress;
    case "blocked":
      return styles.statusBlocked;
    default:
      return styles.statusPending;
  }
}

const EMPTY_CREATE = {
  title: "",
  company_name: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  delivery_deadline: "",
  description: "",
  status: "lead" as PlatformProjectStatus,
  priority: "normal" as PlatformProjectPriority,
  use_default_checklist: false,
};

export function PlatformProjectsPage() {
  const [projects, setProjects] = useState<PlatformProjectOut[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<PlatformProjectOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | PlatformProjectStatus>("");
  const [search, setSearch] = useState("");
  const [detailTab, setDetailTab] = useState<DetailTab>("plan");
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState(EMPTY_CREATE);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const rows = await listPlatformProjects({
        status: statusFilter || undefined,
        limit: 200,
      });
      setProjects(rows);
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Erro ao carregar projetos." });
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    void (async () => {
      try {
        setSelected(await getPlatformProject(selectedId));
      } catch (e) {
        setMessage({ kind: "err", text: e instanceof Error ? e.message : "Erro ao abrir projeto." });
      }
    })();
  }, [selectedId]);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.company_name.toLowerCase().includes(q) ||
        (p.contact_name ?? "").toLowerCase().includes(q),
    );
  }, [projects, search]);

  const grouped = useMemo(() => {
    const map = new Map<PlatformProjectStatus, PlatformProjectOut[]>();
    for (const col of BOARD_COLUMNS) map.set(col, []);
    for (const p of filteredProjects) {
      const list = map.get(p.status) ?? [];
      list.push(p);
      map.set(p.status, list);
    }
    return map;
  }, [filteredProjects]);

  const stats = useMemo(() => {
    const active = projects.filter((p) => !["delivered", "cancelled"].includes(p.status));
    const overdue = active.filter((p) => isOverdue(p.delivery_deadline));
    const inProgress = projects.filter((p) => p.status === "implementation");
    return {
      total: projects.length,
      active: active.length,
      overdue: overdue.length,
      inProgress: inProgress.length,
    };
  }, [projects]);

  async function reloadSelected() {
    if (!selectedId) return;
    const updated = await getPlatformProject(selectedId);
    setSelected(updated);
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  async function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    if (!createDraft.title.trim() || !createDraft.company_name.trim()) {
      setMessage({ kind: "err", text: "Preencha título e empresa." });
      return;
    }
    setBusy(true);
    try {
      const created = await createPlatformProject({
        title: createDraft.title.trim(),
        company_name: createDraft.company_name.trim(),
        contact_name: createDraft.contact_name.trim() || null,
        contact_email: createDraft.contact_email.trim() || null,
        contact_phone: createDraft.contact_phone.trim() || null,
        delivery_deadline: createDraft.delivery_deadline || null,
        description: createDraft.description.trim() || null,
        status: createDraft.status,
        priority: createDraft.priority,
        use_default_checklist: createDraft.use_default_checklist,
      });
      setMessage({ kind: "ok", text: "Projeto criado. Monte o plano de ação com as tarefas necessárias." });
      setCreateOpen(false);
      setCreateDraft(EMPTY_CREATE);
      await refresh();
      setSelectedId(created.id);
      setDetailTab("plan");
    } catch (err) {
      setMessage({ kind: "err", text: err instanceof Error ? err.message : "Erro ao criar projeto." });
    } finally {
      setBusy(false);
    }
  }

  async function saveProjectField(field: keyof PlatformProjectOut, value: string | number | null) {
    if (!selected) return;
    setBusy(true);
    try {
      const updated = await patchPlatformProject(selected.id, { [field]: value } as never);
      setSelected(updated);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Erro ao salvar." });
    } finally {
      setBusy(false);
    }
  }

  async function addTask(title: string) {
    if (!selected || !title.trim()) return;
    setBusy(true);
    try {
      const sortOrder = (selected.tasks.length + 1) * 10;
      await createPlatformProjectTask(selected.id, { title: title.trim(), sort_order: sortOrder });
      await reloadSelected();
      setNewTaskTitle("");
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Erro ao adicionar tarefa." });
    } finally {
      setBusy(false);
    }
  }

  async function updateTask(
    taskId: number,
    payload: Partial<{ title: string; status: PlatformProjectTaskStatus; due_date: string | null }>,
  ) {
    if (!selected) return;
    setBusy(true);
    try {
      await patchPlatformProjectTask(selected.id, taskId, payload);
      await reloadSelected();
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Erro na tarefa." });
    } finally {
      setBusy(false);
    }
  }

  async function removeTask(taskId: number) {
    if (!selected) return;
    if (!window.confirm("Excluir esta tarefa do plano?")) return;
    setBusy(true);
    try {
      await deletePlatformProjectTask(selected.id, taskId);
      await reloadSelected();
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Erro ao excluir tarefa." });
    } finally {
      setBusy(false);
    }
  }

  const existingTaskTitles = useMemo(
    () => new Set((selected?.tasks ?? []).map((t) => t.title.toLowerCase())),
    [selected?.tasks],
  );

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Operação · Entregas</p>
        <h2 className={styles.title}>Central de projetos</h2>
        <p className={styles.lead}>
          Gerencie implantações com prazo de entrega e plano de ação livre — você define o que precisa
          configurar em cada módulo do Climaris (agenda, OS, financeiro, PMOC, integrações e mais).
        </p>
      </section>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.total}</div>
          <div className={styles.statLabel}>Projetos</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.active}</div>
          <div className={styles.statLabel}>Em andamento</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.inProgress}</div>
          <div className={styles.statLabel}>Em implantação</div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statValue} ${stats.overdue > 0 ? styles.overdue : ""}`}>
            {stats.overdue}
          </div>
          <div className={styles.statLabel}>Prazo vencido</div>
        </div>
      </div>

      {message ? (
        <p className={`${styles.message} ${message.kind === "ok" ? styles.messageOk : styles.messageErr}`}>
          {message.text}
        </p>
      ) : null}

      <div className={styles.toolbar}>
        <div className={styles.field}>
          <label htmlFor="project-search">Buscar</label>
          <input
            id="project-search"
            type="search"
            placeholder="Empresa, título ou contato…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="project-status-filter">Status</label>
          <select
            id="project-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | PlatformProjectStatus)}
          >
            <option value="">Todos (quadro)</option>
            {(Object.keys(PROJECT_STATUS_LABELS) as PlatformProjectStatus[]).map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className={styles.ghostBtn} disabled={busy} onClick={() => void refresh()}>
          Atualizar
        </button>
        <button type="button" className={styles.primaryBtn} disabled={busy} onClick={() => setCreateOpen(true)}>
          + Novo projeto
        </button>
      </div>

      <div className={styles.layout}>
        <div>
          {loading ? (
            <p className={styles.empty}>Carregando projetos…</p>
          ) : projects.length === 0 ? (
            <div className={styles.emptyCard}>
              <h3>Nenhum projeto ainda</h3>
              <p className={styles.cardMeta}>
                Crie um projeto para organizar a implantação do cliente — com prazo, prioridade e tarefas
                personalizadas por módulo.
              </p>
              <button
                type="button"
                className={styles.primaryBtn}
                style={{ marginTop: "1rem" }}
                onClick={() => setCreateOpen(true)}
              >
                Criar primeiro projeto
              </button>
            </div>
          ) : (
            <div className={styles.board}>
              {BOARD_COLUMNS.map((col) => (
                <section key={col} className={styles.column}>
                  <h3 className={styles.columnTitle}>
                    {PROJECT_STATUS_LABELS[col]}
                    <span className={styles.columnCount}>{grouped.get(col)?.length ?? 0}</span>
                  </h3>
                  {(grouped.get(col) ?? []).map((project) => (
                    <article
                      key={project.id}
                      className={`${styles.card} ${selectedId === project.id ? styles.cardActive : ""}`}
                      onClick={() => setSelectedId(project.id)}
                    >
                      <div className={styles.cardTop}>
                        <h4 className={styles.cardTitle}>{project.title}</h4>
                        <span className={`${styles.priorityBadge} ${priorityClass(project.priority)}`}>
                          {PROJECT_PRIORITY_LABELS[project.priority]}
                        </span>
                      </div>
                      <p className={styles.cardMeta}>{project.company_name}</p>
                      <p className={`${styles.cardMeta} ${isOverdue(project.delivery_deadline) ? styles.overdue : ""}`}>
                        Prazo: {fmtDate(project.delivery_deadline)}
                      </p>
                      <p className={styles.cardMeta}>
                        {project.tasks.filter((t) => t.status === "done").length}/{project.tasks.length} tarefas ·{" "}
                        {project.progress_percent}%
                      </p>
                      <div className={styles.progressBar}>
                        <div className={styles.progressFill} style={{ width: `${project.progress_percent}%` }} />
                      </div>
                    </article>
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>

        <aside className={styles.detail}>
          {!selected ? (
            <div className={styles.empty} style={{ border: "none" }}>
              Selecione um projeto para editar prazo, contato e plano de ação.
            </div>
          ) : (
            <>
              <div className={styles.detailHeader}>
                <h3>{selected.title}</h3>
                <p className={styles.detailSub}>{selected.company_name}</p>
                <div className={styles.detailProgress}>
                  <div className={styles.progressBar} style={{ flex: 1 }}>
                    <div className={styles.progressFill} style={{ width: `${selected.progress_percent}%` }} />
                  </div>
                  <span>{selected.progress_percent}% concluído</span>
                </div>
              </div>

              <div className={styles.tabs}>
                {(
                  [
                    ["overview", "Resumo"],
                    ["plan", "Plano de ação"],
                    ["contact", "Contato"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`${styles.tab} ${detailTab === id ? styles.tabActive : ""}`}
                    onClick={() => setDetailTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className={styles.detailBody}>
                {detailTab === "overview" ? (
                  <div className={styles.detailGrid}>
                    <div>
                      <label htmlFor="proj-title">Título do projeto</label>
                      <input
                        id="proj-title"
                        defaultValue={selected.title}
                        disabled={busy}
                        onBlur={(e) => {
                          if (e.target.value.trim() !== selected.title) {
                            void saveProjectField("title", e.target.value.trim());
                          }
                        }}
                      />
                    </div>
                    <div>
                      <label htmlFor="proj-status">Fase</label>
                      <select
                        id="proj-status"
                        value={selected.status}
                        disabled={busy}
                        onChange={(e) => void saveProjectField("status", e.target.value)}
                      >
                        {(Object.keys(PROJECT_STATUS_LABELS) as PlatformProjectStatus[]).map((s) => (
                          <option key={s} value={s}>
                            {PROJECT_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="proj-priority">Prioridade</label>
                      <select
                        id="proj-priority"
                        value={selected.priority}
                        disabled={busy}
                        onChange={(e) => void saveProjectField("priority", e.target.value)}
                      >
                        {(Object.keys(PROJECT_PRIORITY_LABELS) as PlatformProjectPriority[]).map((p) => (
                          <option key={p} value={p}>
                            {PROJECT_PRIORITY_LABELS[p]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="proj-deadline">Prazo de entrega</label>
                      <input
                        id="proj-deadline"
                        type="date"
                        value={selected.delivery_deadline ?? ""}
                        disabled={busy}
                        onChange={(e) => void saveProjectField("delivery_deadline", e.target.value || null)}
                      />
                    </div>
                    <div>
                      <label htmlFor="proj-desc">Objetivo / escopo</label>
                      <textarea
                        id="proj-desc"
                        rows={3}
                        defaultValue={selected.description ?? ""}
                        disabled={busy}
                        placeholder="O que o cliente precisa alcançar com o Climaris neste projeto?"
                        onBlur={(e) => {
                          const v = e.target.value.trim() || null;
                          if (v !== (selected.description ?? null)) void saveProjectField("description", v);
                        }}
                      />
                    </div>
                    <div>
                      <label htmlFor="proj-notes">Notas internas</label>
                      <textarea
                        id="proj-notes"
                        rows={3}
                        defaultValue={selected.notes ?? ""}
                        disabled={busy}
                        onBlur={(e) => {
                          const v = e.target.value.trim() || null;
                          if (v !== (selected.notes ?? null)) void saveProjectField("notes", v);
                        }}
                      />
                    </div>
                  </div>
                ) : null}

                {detailTab === "contact" ? (
                  <div className={styles.detailGrid}>
                    <div>
                      <label htmlFor="proj-contact">Responsável</label>
                      <input
                        id="proj-contact"
                        defaultValue={selected.contact_name ?? ""}
                        disabled={busy}
                        onBlur={(e) => void saveProjectField("contact_name", e.target.value.trim() || null)}
                      />
                    </div>
                    <div>
                      <label htmlFor="proj-email">E-mail</label>
                      <input
                        id="proj-email"
                        type="email"
                        defaultValue={selected.contact_email ?? ""}
                        disabled={busy}
                        onBlur={(e) => void saveProjectField("contact_email", e.target.value.trim() || null)}
                      />
                    </div>
                    <div>
                      <label htmlFor="proj-phone">WhatsApp / telefone</label>
                      <input
                        id="proj-phone"
                        defaultValue={selected.contact_phone ?? ""}
                        disabled={busy}
                        onBlur={(e) => void saveProjectField("contact_phone", e.target.value.trim() || null)}
                      />
                    </div>
                  </div>
                ) : null}

                {detailTab === "plan" ? (
                  <>
                    <div className={styles.templateSection}>
                      <p className={styles.sectionTitle}>Sugestões por módulo</p>
                      <p className={styles.cardMeta} style={{ marginBottom: "0.65rem" }}>
                        Clique para adicionar ao plano — personalize livremente o que implantar.
                      </p>
                      {PROJECT_TASK_TEMPLATE_CATEGORIES.map((category) => (
                        <div key={category} className={styles.templateCategory}>
                          <div className={styles.templateCategoryLabel}>{category}</div>
                          <div className={styles.templateChips}>
                            {PROJECT_TASK_TEMPLATES.filter((t) => t.category === category).map((tpl) => {
                              const added = existingTaskTitles.has(tpl.title.toLowerCase());
                              return (
                                <button
                                  key={tpl.id}
                                  type="button"
                                  className={styles.templateChip}
                                  disabled={busy || added}
                                  title={added ? "Já adicionada" : tpl.title}
                                  onClick={() => void addTask(tpl.title)}
                                >
                                  {added ? "✓ " : "+ "}
                                  {tpl.title}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className={styles.sectionTitle}>Tarefas do projeto</p>
                    <form
                      className={styles.addTaskRow}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void addTask(newTaskTitle);
                      }}
                    >
                      <input
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder="Nova tarefa personalizada…"
                        disabled={busy}
                      />
                      <button type="submit" className={styles.primaryBtn} disabled={busy || !newTaskTitle.trim()}>
                        Adicionar
                      </button>
                    </form>

                    {selected.tasks.length === 0 ? (
                      <p className={styles.cardMeta}>
                        Nenhuma tarefa ainda. Use as sugestões acima ou crie tarefas livres para o que precisa
                        implementar.
                      </p>
                    ) : (
                      <ul className={styles.taskList}>
                        {selected.tasks.map((task) => (
                          <li key={task.id} className={styles.taskItem}>
                            <div className={styles.taskRow}>
                              <div className={styles.taskMain}>
                                <div className={task.status === "done" ? styles.taskTitleDone : styles.taskTitle}>
                                  {task.title}
                                </div>
                                <div className={styles.taskControls}>
                                  <span className={`${styles.statusBadge} ${taskStatusClass(task.status)}`}>
                                    {TASK_STATUS_LABELS[task.status]}
                                  </span>
                                  <select
                                    value={task.status}
                                    disabled={busy}
                                    onChange={(e) =>
                                      void updateTask(task.id, {
                                        status: e.target.value as PlatformProjectTaskStatus,
                                      })
                                    }
                                  >
                                    {(Object.keys(TASK_STATUS_LABELS) as PlatformProjectTaskStatus[]).map((s) => (
                                      <option key={s} value={s}>
                                        {TASK_STATUS_LABELS[s]}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    type="date"
                                    value={task.due_date ?? ""}
                                    disabled={busy}
                                    onChange={(e) =>
                                      void updateTask(task.id, { due_date: e.target.value || null })
                                    }
                                  />
                                  <button
                                    type="button"
                                    className={styles.taskDelete}
                                    disabled={busy}
                                    onClick={() => void removeTask(task.id)}
                                  >
                                    Excluir
                                  </button>
                                </div>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : null}
              </div>
            </>
          )}
        </aside>
      </div>

      {createOpen ? (
        <div className={styles.modalBackdrop} role="presentation" onClick={() => setCreateOpen(false)}>
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-project-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h3 id="create-project-title">Novo projeto de implantação</h3>
              <p>Defina o escopo inicial. O plano de ação é montado depois, com total liberdade.</p>
            </div>
            <form onSubmit={(e) => void handleCreateSubmit(e)}>
              <div className={styles.modalBody}>
                <div>
                  <label htmlFor="create-title">Título *</label>
                  <input
                    id="create-title"
                    required
                    value={createDraft.title}
                    onChange={(e) => setCreateDraft((d) => ({ ...d, title: e.target.value }))}
                    placeholder="Ex.: Implantação — Empresa XYZ"
                  />
                </div>
                <div>
                  <label htmlFor="create-company">Empresa *</label>
                  <input
                    id="create-company"
                    required
                    value={createDraft.company_name}
                    onChange={(e) => setCreateDraft((d) => ({ ...d, company_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label htmlFor="create-contact">Responsável</label>
                  <input
                    id="create-contact"
                    value={createDraft.contact_name}
                    onChange={(e) => setCreateDraft((d) => ({ ...d, contact_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label htmlFor="create-deadline">Prazo de entrega</label>
                  <input
                    id="create-deadline"
                    type="date"
                    value={createDraft.delivery_deadline}
                    onChange={(e) => setCreateDraft((d) => ({ ...d, delivery_deadline: e.target.value }))}
                  />
                </div>
                <div>
                  <label htmlFor="create-priority">Prioridade</label>
                  <select
                    id="create-priority"
                    value={createDraft.priority}
                    onChange={(e) =>
                      setCreateDraft((d) => ({ ...d, priority: e.target.value as PlatformProjectPriority }))
                    }
                  >
                    {(Object.keys(PROJECT_PRIORITY_LABELS) as PlatformProjectPriority[]).map((p) => (
                      <option key={p} value={p}>
                        {PROJECT_PRIORITY_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="create-desc">Objetivo</label>
                  <textarea
                    id="create-desc"
                    rows={2}
                    value={createDraft.description}
                    onChange={(e) => setCreateDraft((d) => ({ ...d, description: e.target.value }))}
                    placeholder="Resumo do que será implantado…"
                  />
                </div>
                <label className={styles.modalCheck}>
                  <input
                    type="checkbox"
                    checked={createDraft.use_default_checklist}
                    onChange={(e) =>
                      setCreateDraft((d) => ({ ...d, use_default_checklist: e.target.checked }))
                    }
                  />
                  Incluir checklist padrão de implantação (opcional)
                </label>
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.ghostBtn} onClick={() => setCreateOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className={styles.primaryBtn} disabled={busy}>
                  {busy ? "Criando…" : "Criar projeto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
