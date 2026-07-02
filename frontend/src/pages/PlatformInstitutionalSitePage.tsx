import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import {

  deleteWebsiteScreenshot,

  fetchPlatformWebsiteSettings,

  listWebsiteLeads,

  lookupPlatformWebsiteCnpj,

  patchPlatformWebsiteSettings,

  resolveWebsiteAssetUrl,

  uploadWebsiteScreenshot,

  type PlatformWebsiteSettingsOut,

  type WebsiteLeadOut,

  type WebsiteScreenshotSlot,

} from "../api/platformWebsite";
import { listPlatformWebsitePages, type WebsitePageSummary } from "../api/platformWebsitePages";
import { digitsOnly, formatCnpjInput } from "../lib/brMask";
import { PlatformWebsitePageEditor } from "./PlatformWebsitePageEditor";

import baseStyles from "./PlatformBrandingPage.module.css";

import styles from "./PlatformInstitutionalSitePage.module.css";



type PageTab = "home" | "leads" | string;

type HomeSubTab = "content" | "legal" | "seo" | "images";



const SITE_URL = "https://climaris.com.br";



const SCREENSHOT_META: Record<WebsiteScreenshotSlot, { label: string; hint: string }> = {

  hero: { label: "Hero (destaque)", hint: "Print principal do app — aparece na home ao lado do título." },

  dashboard: { label: "Painel / Dashboard", hint: "Tela inicial do sistema para a seção de benefícios." },

  finance: { label: "Financeiro", hint: "Módulo financeiro na página de funcionalidades." },

  orders: { label: "Gestão de OS", hint: "Ordens de serviço na página de funcionalidades." },

};






function fmtDate(iso: string): string {

  try {

    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  } catch {

    return iso;

  }

}



export function PlatformInstitutionalSitePage() {

  const [pageTab, setPageTab] = useState<PageTab>("home");

  const [homeSubTab, setHomeSubTab] = useState<HomeSubTab>("content");

  const [settings, setSettings] = useState<PlatformWebsiteSettingsOut | null>(null);

  const [leads, setLeads] = useState<WebsiteLeadOut[]>([]);
  const [configPages, setConfigPages] = useState<WebsitePageSummary[]>([]);

  const [loading, setLoading] = useState(true);

  const [busy, setBusy] = useState<string | null>(null);

  const [msg, setMsg] = useState("");

  const [error, setError] = useState("");

  const fileRefs = useRef<Partial<Record<WebsiteScreenshotSlot, HTMLInputElement | null>>>({});



  const [cnpjLookupBusy, setCnpjLookupBusy] = useState(false);

  const [form, setForm] = useState({

    hero_title: "",

    hero_subtitle: "",

    seo_title: "",

    seo_description: "",

    contact_email: "",

    contact_phone: "",

    legal_name: "",

    trade_name: "",

    cnpj: "",

    dpo_name: "",

    dpo_email: "",

    address_street: "",

    address_city: "",

    address_state: "",

    address_postal: "",

    services: "",

  });



  const applySettings = useCallback((row: PlatformWebsiteSettingsOut) => {

    setSettings(row);

    setForm({

      hero_title: row.hero_title,

      hero_subtitle: row.hero_subtitle,

      seo_title: row.seo_title,

      seo_description: row.seo_description,

      contact_email: row.contact_email,

      contact_phone: row.contact_phone ?? "",

      legal_name: row.legal_name,

      trade_name: row.trade_name ?? "",

      cnpj: row.cnpj ? formatCnpjInput(row.cnpj) : "",

      dpo_name: row.dpo_name ?? "",

      dpo_email: row.dpo_email ?? "",

      address_street: row.address_street,

      address_city: row.address_city,

      address_state: row.address_state,

      address_postal: row.address_postal,

      services: row.services.join("\n"),

    });

  }, []);



  const load = useCallback(async () => {

    setLoading(true);

    setError("");

    try {

      const [row, leadRows, pages] = await Promise.all([
        fetchPlatformWebsiteSettings(),
        listWebsiteLeads({ limit: 80 }),
        listPlatformWebsitePages(),
      ]);

      applySettings(row);

      setLeads(leadRows);
      setConfigPages(pages);

    } catch (err) {

      setError(err instanceof Error ? err.message : "Erro ao carregar dados do site.");

    } finally {

      setLoading(false);

    }

  }, [applySettings]);



  useEffect(() => {

    void load();

  }, [load]);



  async function onSaveHome(e: FormEvent) {

    e.preventDefault();

    setBusy("home");

    setMsg("");

    setError("");

    try {

      const services = form.services

        .split("\n")

        .map((s) => s.trim())

        .filter(Boolean);

      const payload =

        homeSubTab === "seo"

          ? {

              seo_title: form.seo_title,

              seo_description: form.seo_description,

            }

          : homeSubTab === "legal"

            ? {

                legal_name: form.legal_name,

                trade_name: form.trade_name.trim() || null,

                cnpj: form.cnpj.trim() ? digitsOnly(form.cnpj) : null,

                dpo_name: form.dpo_name.trim() || null,

                dpo_email: form.dpo_email.trim() || null,

                contact_email: form.contact_email,

                contact_phone: form.contact_phone.trim() || null,

                address_street: form.address_street,

                address_city: form.address_city,

                address_state: form.address_state,

                address_postal: form.address_postal,

              }

            : {

              hero_title: form.hero_title,

              hero_subtitle: form.hero_subtitle,

              services,

            };

      const updated = await patchPlatformWebsiteSettings(payload);

      applySettings(updated);

      setMsg(
        homeSubTab === "seo"
          ? "SEO da home salvo."
          : homeSubTab === "legal"
            ? "Dados da empresa e LGPD salvos."
            : "Conteúdo da home salvo.",
      );

    } catch (err) {

      setError(err instanceof Error ? err.message : "Não foi possível salvar.");

    } finally {

      setBusy(null);

    }

  }



  async function onLookupPlatformCnpj() {

    const digits = digitsOnly(form.cnpj);

    if (digits.length !== 14) {

      setError("Informe um CNPJ válido com 14 dígitos para consultar a CNPJA.");

      return;

    }

    setCnpjLookupBusy(true);

    setError("");

    setMsg("");

    try {

      await lookupPlatformWebsiteCnpj(digits);

      const refreshed = await fetchPlatformWebsiteSettings();

      applySettings(refreshed);

      setMsg("Dados da empresa atualizados pela consulta CNPJA.");

    } catch (err) {

      setError(err instanceof Error ? err.message : "Não foi possível consultar o CNPJ.");

    } finally {

      setCnpjLookupBusy(false);

    }

  }



  async function onScreenshotFile(slot: WebsiteScreenshotSlot, file: File | undefined) {

    if (!file) return;

    setBusy(`img-${slot}`);

    setMsg("");

    setError("");

    try {

      const updated = await uploadWebsiteScreenshot(slot, file);

      applySettings(updated);

      setMsg(`Imagem "${SCREENSHOT_META[slot].label}" atualizada.`);

    } catch (err) {

      setError(err instanceof Error ? err.message : "Falha no upload.");

    } finally {

      setBusy(null);

      const input = fileRefs.current[slot];

      if (input) input.value = "";

    }

  }



  async function onRemoveScreenshot(slot: WebsiteScreenshotSlot) {

    setBusy(`del-${slot}`);

    setMsg("");

    setError("");

    try {

      const updated = await deleteWebsiteScreenshot(slot);

      applySettings(updated);

      setMsg(`Imagem "${SCREENSHOT_META[slot].label}" removida.`);

    } catch (err) {

      setError(err instanceof Error ? err.message : "Não foi possível remover.");

    } finally {

      setBusy(null);

    }

  }



  if (loading) {

    return <p className={baseStyles.hint}>Carregando site institucional…</p>;

  }

  const pageTabs: { id: PageTab; label: string }[] = [
    { id: "home", label: "Página inicial" },
    ...configPages.map((page) => ({ id: page.slug, label: page.label })),
    { id: "leads", label: "Leads" },
  ];

  const activeConfigPage = configPages.find((page) => page.slug === pageTab);

  return (

    <div className={styles.page}>

      <header className={styles.hero}>

        <div className={styles.heroTop}>

          <div>

            <p className={styles.eyebrow}>Site institucional</p>

            <h1 className={styles.title}>climaris.com.br</h1>

            <p className={styles.lead}>

              Configure cada página do site — textos, SEO e imagens. Alterações refletem em{" "}

              <a href={SITE_URL} target="_blank" rel="noreferrer">

                {SITE_URL}

              </a>{" "}

              após salvar.

            </p>

          </div>

          <button type="button" className={baseStyles.btnGhost} onClick={() => void load()}>

            Recarregar

          </button>

        </div>

      </header>



      <nav className={styles.pageNav} aria-label="Páginas do site">

        {pageTabs.map((tab) => (

          <button

            key={tab.id}

            type="button"

            className={`${styles.pageNavBtn} ${pageTab === tab.id ? styles.pageNavBtnActive : ""}`}

            onClick={() => setPageTab(tab.id)}

          >

            {tab.label}

          </button>

        ))}

      </nav>



      {msg ? <p className={baseStyles.success}>{msg}</p> : null}

      {error ? <p className={baseStyles.error}>{error}</p> : null}



      {pageTab === "home" ? (

        <div className={styles.panel}>

          <div className={styles.panelHeader}>

            <div>

              <h2 className={styles.panelTitle}>Página inicial</h2>

              <p className={styles.panelHint}>

                Home e dados de contato —{" "}

                <a href={SITE_URL} target="_blank" rel="noreferrer" className={styles.previewLink}>

                  ver no site

                </a>

              </p>

            </div>

          </div>



          <div className={styles.subNav}>

            {(

              [

                ["content", "Conteúdo"],

                ["legal", "Empresa / LGPD"],

                ["seo", "SEO"],

                ["images", "Imagens do app"],

              ] as const

            ).map(([key, label]) => (

              <button

                key={key}

                type="button"

                className={`${styles.subNavBtn} ${homeSubTab === key ? styles.subNavBtnActive : ""}`}

                onClick={() => setHomeSubTab(key)}

              >

                {label}

              </button>

            ))}

          </div>



          {homeSubTab === "content" ? (

            <form className={baseStyles.card} onSubmit={onSaveHome}>

              <div className={baseStyles.fieldGrid}>

                <label className={baseStyles.field}>

                  Título do hero (H1)

                  <input value={form.hero_title} onChange={(e) => setForm({ ...form, hero_title: e.target.value })} />

                </label>

                <label className={baseStyles.field} style={{ gridColumn: "1 / -1" }}>

                  Subtítulo do hero

                  <textarea rows={3} value={form.hero_subtitle} onChange={(e) => setForm({ ...form, hero_subtitle: e.target.value })} />

                </label>

                <label className={baseStyles.field} style={{ gridColumn: "1 / -1" }}>

                  Serviços (um por linha)

                  <textarea rows={4} value={form.services} onChange={(e) => setForm({ ...form, services: e.target.value })} />

                </label>

              </div>

              <button type="submit" className={baseStyles.btnPrimary} disabled={busy === "home"}>

                {busy === "home" ? "Salvando…" : "Salvar conteúdo"}

              </button>

            </form>

          ) : null}



          {homeSubTab === "legal" ? (

            <form className={baseStyles.card} onSubmit={onSaveHome}>

              <p className={styles.panelHint} style={{ marginBottom: "1rem" }}>

                Cadastre a empresa controladora (Climaris) para rodapé do site, política de privacidade e LGPD. Use a

                consulta CNPJA para preencher razão social e endereço automaticamente (requer chave em Operação → Chaves

                API).

              </p>

              {settings?.is_verified_cnpj ? (

                <p className={styles.panelHint} style={{ marginBottom: "1rem", color: "var(--color-success, #15803d)" }}>

                  CNPJ verificado via CNPJA

                  {settings.cnpj_verified_at ? ` em ${fmtDate(settings.cnpj_verified_at)}` : ""}.

                </p>

              ) : null}

              <div className={baseStyles.fieldGrid}>

                <label className={baseStyles.field} style={{ gridColumn: "1 / -1" }}>

                  CNPJ da empresa

                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>

                    <input

                      value={form.cnpj}

                      onChange={(e) => setForm({ ...form, cnpj: formatCnpjInput(e.target.value) })}

                      placeholder="00.000.000/0000-00"

                      style={{ flex: "1 1 12rem" }}

                    />

                    <button

                      type="button"

                      className={baseStyles.btn}

                      onClick={() => void onLookupPlatformCnpj()}

                      disabled={cnpjLookupBusy}

                    >

                      {cnpjLookupBusy ? "Consultando…" : "Consultar CNPJA"}

                    </button>

                  </div>

                </label>

                <label className={baseStyles.field}>

                  Razão social

                  <input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} />

                </label>

                <label className={baseStyles.field}>

                  Nome fantasia

                  <input value={form.trade_name} onChange={(e) => setForm({ ...form, trade_name: e.target.value })} />

                </label>

                <label className={baseStyles.field}>

                  E-mail de contato (site)

                  <input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />

                </label>

                <label className={baseStyles.field}>

                  Telefone / WhatsApp

                  <input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />

                </label>

                <label className={baseStyles.field}>

                  Encarregado LGPD (nome)

                  <input value={form.dpo_name} onChange={(e) => setForm({ ...form, dpo_name: e.target.value })} placeholder="Nome do DPO" />

                </label>

                <label className={baseStyles.field}>

                  E-mail do encarregado (DPO)

                  <input

                    type="email"

                    value={form.dpo_email}

                    onChange={(e) => setForm({ ...form, dpo_email: e.target.value })}

                    placeholder="privacidade@empresa.com.br"

                  />

                </label>

                <label className={baseStyles.field}>

                  Endereço

                  <input value={form.address_street} onChange={(e) => setForm({ ...form, address_street: e.target.value })} />

                </label>

                <label className={baseStyles.field}>

                  Cidade

                  <input value={form.address_city} onChange={(e) => setForm({ ...form, address_city: e.target.value })} />

                </label>

                <label className={baseStyles.field}>

                  UF

                  <input maxLength={2} value={form.address_state} onChange={(e) => setForm({ ...form, address_state: e.target.value.toUpperCase() })} />

                </label>

                <label className={baseStyles.field}>

                  CEP

                  <input value={form.address_postal} onChange={(e) => setForm({ ...form, address_postal: e.target.value })} />

                </label>

              </div>

              <button type="submit" className={baseStyles.btnPrimary} disabled={busy === "home"}>

                {busy === "home" ? "Salvando…" : "Salvar empresa / LGPD"}

              </button>

            </form>

          ) : null}



          {homeSubTab === "seo" ? (

            <form className={baseStyles.card} onSubmit={onSaveHome}>

              <label className={baseStyles.field}>

                Título SEO (meta title)

                <input value={form.seo_title} onChange={(e) => setForm({ ...form, seo_title: e.target.value })} />

              </label>

              <label className={baseStyles.field}>

                Descrição SEO (meta description)

                <textarea rows={3} value={form.seo_description} onChange={(e) => setForm({ ...form, seo_description: e.target.value })} />

              </label>

              <button type="submit" className={baseStyles.btnPrimary} disabled={busy === "home"}>

                {busy === "home" ? "Salvando…" : "Salvar SEO"}

              </button>

            </form>

          ) : null}



          {homeSubTab === "images" ? (

            <div className={baseStyles.grid}>

              {(Object.keys(SCREENSHOT_META) as WebsiteScreenshotSlot[]).map((slot) => {

                const shot = settings?.screenshots.find((s) => s.slot === slot);

                const src = resolveWebsiteAssetUrl(shot?.url);

                const meta = SCREENSHOT_META[slot];

                const isBusy = busy === `img-${slot}` || busy === `del-${slot}`;

                return (

                  <div key={slot} className={baseStyles.card}>

                    <h3 className={baseStyles.cardTitle}>{meta.label}</h3>

                    <p className={baseStyles.hint}>{meta.hint}</p>

                    <div className={baseStyles.previewWrap}>

                      {src ? (

                        <img src={src} alt={meta.label} className={baseStyles.previewImg} />

                      ) : (

                        <span className={baseStyles.previewPlaceholder}>Sem imagem — use print do app</span>

                      )}

                    </div>

                    <input

                      ref={(el) => {

                        fileRefs.current[slot] = el;

                      }}

                      type="file"

                      accept="image/png,image/jpeg,image/webp"

                      className={baseStyles.hiddenInput}

                      onChange={(e) => void onScreenshotFile(slot, e.target.files?.[0])}

                    />

                    <div className={baseStyles.actionsRow}>

                      <button type="button" className={baseStyles.btnPrimary} disabled={isBusy} onClick={() => fileRefs.current[slot]?.click()}>

                        Enviar imagem

                      </button>

                      {shot?.has_image ? (

                        <button type="button" className={baseStyles.btnGhost} disabled={isBusy} onClick={() => void onRemoveScreenshot(slot)}>

                          Remover

                        </button>

                      ) : null}

                    </div>

                  </div>

                );

              })}

            </div>

          ) : null}

        </div>

      ) : null}



      {activeConfigPage ? (
        <PlatformWebsitePageEditor slug={activeConfigPage.slug} onMessage={setMsg} onError={setError} />
      ) : null}



      {pageTab === "leads" ? (

        <div className={baseStyles.card}>

          <h2 className={baseStyles.cardTitle}>Leads do formulário ({leads.length})</h2>

          {leads.length === 0 ? (

            <p className={baseStyles.hint}>Nenhum lead recebido ainda.</p>

          ) : (

            <div className={baseStyles.tableWrap}>

              <table className={baseStyles.table}>

                <thead>

                  <tr>

                    <th>Data</th>

                    <th>Nome</th>

                    <th>E-mail</th>

                    <th>WhatsApp</th>

                    <th>Empresa</th>

                    <th>Cargo</th>

                    <th>Técnicos</th>

                    <th>Plano</th>

                    <th>Status</th>

                  </tr>

                </thead>

                <tbody>

                  {leads.map((lead) => (

                    <tr key={lead.id}>

                      <td>{fmtDate(lead.created_at)}</td>

                      <td>{lead.name}</td>

                      <td>{lead.email}</td>

                      <td>{lead.phone ?? "—"}</td>

                      <td>{lead.company ?? "—"}</td>

                      <td>{lead.job_title ?? "—"}</td>

                      <td>{lead.technicians_count ?? "—"}</td>

                      <td>{lead.selected_plan ?? "—"}</td>

                      <td>{lead.status}</td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          )}

        </div>

      ) : null}

    </div>

  );

}

