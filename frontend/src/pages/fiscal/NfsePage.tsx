import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import QRCode from "qrcode";
import {
  getNfseSettings,
  importIssuedNfseXml,
  importIssuedNfseXmlBatch,
  issueNfse,
  listNfseInvoices,
  listNfseTributacaoNacionalCatalog,
  patchNfseInvoice,
  refreshNfseInvoiceFromAdn,
  reparseNfseInvoiceFromXml,
  type NfseImportXmlBatchOut,
  type NfseInvoiceOut,
  type NfseTributacaoNacionalItem,
} from "../../api/nfse";
import { createClient } from "../../api/clients";
import { listFinanceEntries, type FinanceEntryOut } from "../../api/finance";
import { listClients, type ClientOut } from "../../api/clients";
import { listServiceOrders, type ServiceOrderOut } from "../../api/serviceOrders";
import styles from "./NfsePage.module.css";

function money(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);
}

/** Consulta pública NFS-e Nacional (QR Code / rodapé). */
const CONSULTA_NFSE_NACIONAL = "https://www.nfse.gov.br/consultapublica";

function parseJsonSafe(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function findXmlValue(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const data = input as Record<string, unknown>;
  const keys = ["xml", "nfse_xml", "xml_nfse", "signed_xml", "raw_xml", "document_xml"];
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim().startsWith("<")) {
      return value.trim();
    }
  }
  return null;
}

/** Chave numérica da NFS-e (atributo Id de infNFSe no XML nacional). */
function extractChaveAcessoNfse(invoice: NfseInvoiceOut): string | null {
  const stored = (invoice.nfse_access_key || "").replace(/\D/g, "");
  if (stored.length >= 44) return stored;
  const blob = parseJsonSafe(invoice.response_payload_json);
  const xml = findXmlValue(blob);
  if (!xml?.trim()) return null;
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return null;
  const all = doc.getElementsByTagName("*");
  for (let i = 0; i < all.length; i += 1) {
    const el = all.item(i);
    if (!el) continue;
    const loc = (el.localName || el.nodeName.split(":").pop() || "").toLowerCase();
    if (loc !== "infnfse") continue;
    const idAttr = el.getAttribute("Id") || el.getAttribute("id");
    if (!idAttr) continue;
    const digits = idAttr.replace(/\D/g, "");
    if (digits.length >= 44) return digits;
  }
  return null;
}

function formatChaveAcessoExibicao(chave: string): string {
  const d = chave.replace(/\D/g, "");
  const parts: string[] = [];
  for (let i = 0; i < d.length; i += 5) {
    parts.push(d.slice(i, i + 5));
  }
  return parts.join(" ");
}

function payloadQrConsultaNfse(chave: string): string {
  return `${CONSULTA_NFSE_NACIONAL}?chaveAcesso=${encodeURIComponent(chave)}`;
}

function dt(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

function dateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function importDisplaySectionLabel(key: string): string {
  const map: Record<string, string> = {
    vinculo_sistema: "Cliente no sistema",
    layout_nfse_versao: "Versão do layout NFS-e",
    nfse: "NFS-e (cabecalho)",
    prestador_nfse: "Prestador (emit)",
    tomador_resumo: "Tomador (resumo)",
    tomador_xml: "Tomador (XML)",
    dps: "Serviço / declaração (XML nacional)",
    prestador_dps: "Prestador (declaração)",
    servico: "Servico prestado",
    valores_dps: "Valores e tributos (XML)",
  };
  return map[key] ?? key.replace(/_/g, " ");
}

function renderImportDisplayValue(v: unknown): ReactNode {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "string" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return <pre className={styles.preTiny}>{JSON.stringify(v, null, 2)}</pre>;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const entries = Object.entries(o).filter(([, x]) => x !== null && x !== undefined && x !== "");
    if (entries.length === 0) return "—";
    return (
      <dl className={styles.kvList}>
        {entries.map(([k, x]) => (
          <div key={k} className={styles.kvRow}>
            <dt>{k.replace(/_/g, " ")}</dt>
            <dd>{renderImportDisplayValue(x)}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return String(v);
}

function ImportDisplayPanel(props: { data: Record<string, unknown> | null | undefined }) {
  const { data } = props;
  if (!data || Object.keys(data).length === 0) {
    return (
      <p className={styles.helperText}>
        Sem resumo estruturado (registro antigo ou emissao interna). Veja o payload bruto abaixo ou reimporte o XML.
      </p>
    );
  }
  const order = [
    "vinculo_sistema",
    "layout_nfse_versao",
    "nfse",
    "servico",
    "valores_dps",
    "tomador_xml",
    "tomador_resumo",
    "prestador_nfse",
    "prestador_dps",
    "dps",
  ];
  const keys = Object.keys(data).sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return (
    <div className={styles.importDisplay}>
      {keys.map((key) => {
        const val = data[key];
        if (val === null || val === undefined) return null;
        return (
          <section key={key} className={styles.importSection}>
            <h4>{importDisplaySectionLabel(key)}</h4>
            {renderImportDisplayValue(val)}
          </section>
        );
      })}
    </div>
  );
}

function subRecord(obj: unknown, key: string): Record<string, unknown> | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const v = (obj as Record<string, unknown>)[key];
  if (v !== null && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return undefined;
}

function strVal(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  return String(v);
}

function formatTaxIdForPrint(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return raw;
}

function formatCompetenceBr(isoDate: string): string {
  if (!isoDate || isoDate.length < 10) return isoDate;
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

/** Explica Pendente envio e resume dados do JSON interno da solicitação (não substitui NFS-e autorizada). */
function PendingSubmissionBanner(props: { invoice: NfseInvoiceOut }) {
  const raw = parseJsonSafe(props.invoice.request_payload_json);
  let servValor: number | null = null;
  let servDesc = "";
  let tomNome = "";
  let prestDoc = "";
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const serv = o.servico as Record<string, unknown> | undefined;
    const tom = o.tomador as Record<string, unknown> | undefined;
    const prest = o.prestador as Record<string, unknown> | undefined;
    if (serv && typeof serv.valor === "number") servValor = serv.valor;
    if (serv && typeof serv.descricao === "string") servDesc = serv.descricao.trim();
    if (tom && typeof tom.nome === "string") tomNome = tom.nome.trim();
    if (prest && typeof prest.cpf_cnpj === "string") prestDoc = String(prest.cpf_cnpj).trim();
  }
  const valorExibir =
    servValor != null ? servValor : props.invoice.amount > 0 ? props.invoice.amount : null;
  const hasSummary =
    valorExibir != null || Boolean(servDesc) || Boolean(tomNome) || Boolean(prestDoc);
  return (
    <div className={styles.pendingNfseBanner} role="status">
      <strong>Pendente envio — quadro da NFS-e vazio é esperado</strong>
      <p>
        Enquanto o status for <strong>Pendente envio</strong>, ainda não há NFS-e autorizada no Ambiente Nacional (ADN): não
        existe XML oficial nem número definitivo para montar o documento abaixo. Isso não é falha de cadastro do cliente —
        apenas indica que o processamento no ambiente nacional não concluiu (ou não foi enviado). No início deste painel,
        use <strong>Sincronizar com o ADN</strong> para atualizar o status; em <em>Dados técnicos</em> você vê
        solicitação/resposta; use <strong>Reemitir</strong> após corrigir certificado ou configuração.
      </p>
      {hasSummary ? (
        <div className={styles.pendingSummary}>
          <span className={styles.pendingSummaryTitle}>Referência da solicitação no sistema</span>
          <dl className={styles.pendingSummaryDl}>
            {prestDoc ? (
              <>
                <dt>Prestador</dt>
                <dd>{formatTaxIdForPrint(prestDoc)}</dd>
              </>
            ) : null}
            {tomNome ? (
              <>
                <dt>Tomador</dt>
                <dd>{tomNome}</dd>
              </>
            ) : null}
            {servDesc ? (
              <>
                <dt>Discriminação</dt>
                <dd>{servDesc}</dd>
              </>
            ) : null}
            {valorExibir != null ? (
              <>
                <dt>Valor</dt>
                <dd>{money(valorExibir)}</dd>
              </>
            ) : null}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

function lineEnderecoNf(end: Record<string, unknown> | undefined): string {
  if (!end) return "";
  const parts = [
    [strVal(end["logradouro"]), strVal(end["numero"])].filter(Boolean).join(", "),
    strVal(end["bairro"]),
    [strVal(end["municipio_ibge"]), strVal(end["uf"])].filter(Boolean).join(" / "),
    strVal(end["cep"]) ? `CEP ${strVal(end["cep"])}` : "",
  ].filter(Boolean);
  return parts.join(" — ");
}

function NfsePrintableDocument(props: { invoice: NfseInvoiceOut }) {
  const { invoice } = props;
  const chave = useMemo(() => extractChaveAcessoNfse(invoice), [invoice]);
  const [qrSrc, setQrSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!chave) {
      setQrSrc(null);
      return;
    }
    let cancelled = false;
    const payload = payloadQrConsultaNfse(chave);
    void QRCode.toDataURL(payload, {
      width: 180,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (!cancelled) setQrSrc(url);
      })
      .catch(() => {
        if (!cancelled) setQrSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [chave]);

  const raw = invoice.import_display;
  const nf = raw ? subRecord(raw, "nfse") : undefined;
  const prestEmit = raw ? subRecord(raw, "prestador_nfse") : undefined;
  const prestDps = raw ? subRecord(raw, "prestador_dps") : undefined;
  const tom = raw ? subRecord(raw, "tomador_xml") : undefined;
  const vinc = raw ? subRecord(raw, "vinculo_sistema") : undefined;
  const serv = raw ? subRecord(raw, "servico") : undefined;
  const valoresDps = raw ? subRecord(raw, "valores_dps") : undefined;
  const dps = raw ? subRecord(raw, "dps") : undefined;
  const trib = valoresDps ? subRecord(valoresDps, "tributos_municipais") : undefined;

  const endPrest = prestEmit ? subRecord(prestEmit, "endereco") : undefined;
  const endTom = tom ? subRecord(tom, "endereco") : undefined;

  const numero = strVal(nf?.["numero"]) || invoice.nfse_number || "—";
  const dhEmi = strVal(dps?.["data_hora_emissao"]) || strVal(nf?.["data_hora_processamento"]) || "";
  const competencia = strVal(dps?.["competencia"]);
  const locInc = strVal(nf?.["local_incidencia_nome"]) || strVal(nf?.["local_emissao"]);
  const municipioCod = strVal(nf?.["codigo_local_incidencia"]) || invoice.municipal_code || "";
  const nDfse = strVal(nf?.["n_dfse"]);
  const statusCod = strVal(nf?.["status_codigo"]);

  const valorLiquido = typeof nf?.["valor_liquido"] === "number" ? nf["valor_liquido"] : null;
  const valorServ = typeof valoresDps?.["valor_servico"] === "number" ? valoresDps["valor_servico"] : null;
  const valorFinal = valorLiquido ?? valorServ ?? invoice.amount ?? 0;

  const nomePrest = strVal(prestEmit?.["nome"]) || "—";
  const docPrest = formatTaxIdForPrint(strVal(prestEmit?.["cnpj_cpf"]));
  const nomeTom =
    strVal(tom?.["nome"]) || strVal(vinc?.["nome_cliente_cadastro"]) || invoice.client_name || "—";
  const docTom = formatTaxIdForPrint(strVal(tom?.["cnpj_cpf"]));

  const descServ = strVal(serv?.["descricao"]) || "—";
  const codNbs = strVal(serv?.["codigo_nbs"]);
  const codTrib = strVal(serv?.["codigo_tributacao_nacional"]);
  const codLocPrest = strVal(serv?.["codigo_local_prestacao"]);
  const textoTrib = strVal(nf?.["texto_tributacao_nacional"]);
  const descNbsTopo = strVal(nf?.["descricao_nbs"]);

  let emissaoDisplay = dt(invoice.issued_at);
  if (dhEmi) {
    const t = Date.parse(dhEmi);
    if (!Number.isNaN(t)) emissaoDisplay = new Date(t).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  const fonePrest = strVal(prestEmit?.["telefone"]);
  const emailPrest = strVal(prestEmit?.["email"]) || strVal(prestDps?.["email"]);

  return (
    <article className={styles.nfseProofDoc}>
      <header className={styles.nfseProofHeader}>
        <div className={styles.nfseProofHeaderLeft}>
          <div className={styles.nfseProofSigla}>NFS-e</div>
          <div className={styles.nfseProofTituloOficial}>NOTA FISCAL DE SERVIÇO ELETRÔNICA</div>
          <div className={styles.nfseProofSubtitulo}>
            Pré-visualização para conferência no Climaris — não substitui a NFS-e autorizada (XML assinado) nem a consulta
            oficial no Ambiente Nacional de NFS-e.
          </div>
        </div>
        {qrSrc ? (
          <div className={styles.nfseProofQr}>
            <img src={qrSrc} alt="QR Code — consulta pública NFS-e" width={152} height={152} />
            <span className={styles.nfseProofQrLegenda}>Consulta da autenticidade no portal nacional</span>
          </div>
        ) : null}
      </header>

      <p className={styles.nfseProofAvisoLegal}>
        Esta página é só um resumo operacional e não tem valor fiscal. Para validade jurídica e tributária, utilize a NFS-e
        autorizada (arquivo XML com assinatura digital) e o registro no sistema nacional. Consulte pela chave de acesso em{" "}
        <strong>{CONSULTA_NFSE_NACIONAL.replace("https://", "")}</strong>.
      </p>

      {chave ? (
        <section className={styles.nfseProofBloco}>
          <div className={styles.nfseProofRotulo}>CHAVE DE ACESSO</div>
          <div className={styles.nfseProofChave}>{formatChaveAcessoExibicao(chave)}</div>
        </section>
      ) : null}

      <section className={styles.nfseProofBlocoCinza}>
        <div className={styles.nfseProofLinhaMeta}>
          <div>
            <span className={styles.nfseProofRotulo}>NÚMERO DA NFS-e</span>
            <strong className={styles.nfseProofDestaque}>{numero}</strong>
          </div>
          <div>
            <span className={styles.nfseProofRotulo}>DATA E HORA DE EMISSÃO</span>
            <strong className={styles.nfseProofDestaque}>{emissaoDisplay}</strong>
          </div>
          {nDfse ? (
            <div>
              <span className={styles.nfseProofRotulo}>Nº DF-e</span>
              <strong className={styles.nfseProofDestaque}>{nDfse}</strong>
            </div>
          ) : null}
          {statusCod ? (
            <div>
              <span className={styles.nfseProofRotulo}>STATUS (cStat)</span>
              <strong className={styles.nfseProofDestaque}>{statusCod}</strong>
            </div>
          ) : null}
        </div>
        <div className={styles.nfseProofRotulo}>LOCAL DA PRESTAÇÃO / INCIDÊNCIA</div>
        <p className={styles.nfseProofTexto}>
          {locInc || "—"}
          {municipioCod ? ` · Município IBGE ${municipioCod}` : ""}
          {codLocPrest ? ` · Local prestação (IBGE) ${codLocPrest}` : ""}
        </p>
        {competencia ? (
          <p className={styles.nfseProofTexto}>
            <span className={styles.nfseProofRotulo}>COMPETÊNCIA: </span>
            {formatCompetenceBr(competencia)}
          </p>
        ) : null}
      </section>

      <div className={styles.nfseProofDuasColunas}>
        <section className={styles.nfseProofBloco}>
          <div className={styles.nfseProofRotuloBarra}>PRESTADOR DE SERVIÇOS</div>
          <p className={styles.nfseProofNomeRazao}>{nomePrest}</p>
          <p>
            <span className={styles.nfseProofRotulo}>CNPJ: </span>
            {docPrest || "—"}
          </p>
          {lineEnderecoNf(endPrest) ? <p className={styles.nfseProofTexto}>{lineEnderecoNf(endPrest)}</p> : null}
          {fonePrest || emailPrest ? (
            <p className={styles.nfseProofTextoSec}>
              {[fonePrest ? `Tel. ${fonePrest}` : "", emailPrest ? `E-mail: ${emailPrest}` : ""]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
        </section>
        <section className={styles.nfseProofBloco}>
          <div className={styles.nfseProofRotuloBarra}>TOMADOR DE SERVIÇOS</div>
          <p className={styles.nfseProofNomeRazao}>{nomeTom}</p>
          <p>
            <span className={styles.nfseProofRotulo}>CPF / CNPJ: </span>
            {docTom || "—"}
          </p>
          {lineEnderecoNf(endTom) ? <p className={styles.nfseProofTexto}>{lineEnderecoNf(endTom)}</p> : null}
          {strVal(tom?.["email"]) ? (
            <p className={styles.nfseProofTextoSec}>E-mail: {strVal(tom?.["email"])}</p>
          ) : null}
        </section>
      </div>

      <section className={styles.nfseProofBloco}>
        <div className={styles.nfseProofRotuloBarra}>DISCRIMINAÇÃO DO SERVIÇO</div>
        <p className={styles.nfseProofDiscriminacao}>{descServ}</p>
        {textoTrib ? <p className={styles.nfseProofTextoSec}>{textoTrib}</p> : null}
        {descNbsTopo ? <p className={styles.nfseProofTextoSec}>{descNbsTopo}</p> : null}
        <p className={styles.nfseProofTextoSec}>
          {[codTrib ? `Código tributação nacional: ${codTrib}` : "", codNbs ? `NBS: ${codNbs}` : ""]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </section>

      {trib && Object.keys(trib).length > 0 ? (
        <section className={styles.nfseProofBloco}>
          <div className={styles.nfseProofRotuloBarra}>TRIBUTAÇÃO MUNICIPAL (RESUMO)</div>
          <ul className={styles.nfseProofListaTrib}>
            {strVal(trib["trib_issqn"]) ? <li>TRIBISSQN: {strVal(trib["trib_issqn"])}</li> : null}
            {strVal(trib["tp_ret_issqn"]) ? <li>Retenção ISSQN: {strVal(trib["tp_ret_issqn"])}</li> : null}
            {strVal(trib["ind_tot_trib"]) ? <li>Indicador total tributos: {strVal(trib["ind_tot_trib"])}</li> : null}
          </ul>
        </section>
      ) : null}

      <section className={styles.nfseProofTotal}>
        <div className={styles.nfseProofRotulo}>VALOR TOTAL DO SERVIÇO</div>
        <div className={styles.nfseProofValorTotal}>{money(Number(valorFinal))}</div>
        {dps ? (
          <p className={styles.nfseProofTextoSec}>
            Série {strVal(dps["serie"]) || "—"}, nº {strVal(dps["numero"]) || "—"} (referência no XML importado)
          </p>
        ) : null}
      </section>

      <footer className={styles.nfseProofRodape}>
        {invoice.verification_code ? (
          <p>
            <span className={styles.nfseProofRotulo}>Código de verificação: </span>
            {invoice.verification_code}
          </p>
        ) : null}
        <p className={styles.nfseProofTextoSec}>
          Impresso em {new Date().toLocaleString("pt-BR")} — Climaris (cópia de conferência)
        </p>
      </footer>
    </article>
  );
}

type TomadorDraft = {
  name: string;
  document: string;
  tax_id_kind: "cpf" | "cnpj";
  email: string;
  phone: string;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_district: string;
  address_city: string;
  address_state: string;
  address_postal_code: string;
};

function nodeLocalName(node: Element): string {
  return (node.localName || node.nodeName || "").split(":").pop()?.toLowerCase() ?? "";
}

function xmlTextByTags(doc: Document | Element, tags: string[]): string {
  const tagsLower = new Set(tags.map((t) => t.toLowerCase()));
  const all = doc.getElementsByTagName("*");
  for (let i = 0; i < all.length; i += 1) {
    const node = all.item(i);
    if (!node) continue;
    if (tagsLower.has(nodeLocalName(node))) {
      const value = (node.textContent || "").trim();
      if (value) return value;
    }
  }
  return "";
}

function xmlTextByTagsScoped(doc: Document, sectionTags: string[], valueTags: string[]): string {
  const sectionSet = new Set(sectionTags.map((s) => s.toLowerCase()));
  const all = doc.getElementsByTagName("*");
  for (let i = 0; i < all.length; i += 1) {
    const node = all.item(i);
    if (!node) continue;
    if (!sectionSet.has(nodeLocalName(node))) continue;
    const value = xmlTextByTags(node, valueTags);
    if (value) return value;
  }
  return "";
}

function digitsOnly(v: string): string {
  return v.replace(/\D/g, "");
}

/** Primeiro <tom> da DPS nacional com CPF/CNPJ (igual ao backend). */
function findNacionalTomElement(doc: Document): Element | null {
  const all = doc.getElementsByTagName("*");
  for (let i = 0; i < all.length; i += 1) {
    const node = all.item(i);
    if (!node) continue;
    const loc = nodeLocalName(node);
    if (loc !== "tom" && loc !== "toma") continue;
    const raw = xmlTextByTags(node, ["Cnpj", "Cpf", "CpfCnpj", "TomadorCpfCnpj", "Documento"]);
    if (raw) return node;
  }
  return null;
}

function parseTomadorFromXml(xml: string): TomadorDraft | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    const parserError = doc.getElementsByTagName("parsererror");
    if (parserError && parserError.length > 0) return null;
    const tomadorSections = [
      "TomadorServico",
      "Tomador",
      "DadosTomador",
      "IdentificacaoTomador",
      "tom",
      "toma",
      "Toma",
      "infToma",
    ];
    const tagDoc = ["Cnpj", "Cpf", "CpfCnpj", "TomadorCpfCnpj", "Documento"];
    const tagName = ["RazaoSocial", "Nome", "TomadorRazaoSocial", "TomadorNome", "xNome", "xFant", "XNome", "XFant"];
    const tagEmail = ["Email", "email", "TomadorEmail"];
    const tagPhone = ["Telefone", "TelefoneContato", "TomadorTelefone", "fone"];
    const tagStreet = ["Endereco", "Logradouro", "Rua", "xLgr"];
    const tagNumber = ["Numero", "NumeroEndereco", "nro"];
    const tagCompl = ["Complemento", "xCpl"];
    const tagDistrict = ["Bairro", "xBairro"];
    const tagCity = ["Cidade", "Municipio", "xMun"];
    const tagState = ["Uf", "Estado", "UF"];
    const tagCep = ["Cep", "CodigoPostal", "CEP"];

    const tomEl = findNacionalTomElement(doc);
    let documentRaw: string;
    let name: string;
    let email: string;
    let phone: string;
    let address_street: string;
    let address_number: string;
    let address_complement: string;
    let address_district: string;
    let address_city: string;
    let address_state: string;
    let address_postal_code: string;

    if (tomEl) {
      documentRaw = xmlTextByTags(tomEl, tagDoc);
      name =
        xmlTextByTags(tomEl, tagName) ||
        xmlTextByTags(doc, ["TomadorRazaoSocial", "TomadorNome", "xNome", "XNome"]) ||
        "Tomador importado NFS-e";
      email = xmlTextByTags(tomEl, tagEmail) || xmlTextByTags(doc, ["TomadorEmail"]);
      phone = xmlTextByTags(tomEl, tagPhone) || xmlTextByTags(doc, ["TomadorTelefone"]);
      address_street = xmlTextByTags(tomEl, tagStreet);
      address_number = xmlTextByTags(tomEl, tagNumber);
      address_complement = xmlTextByTags(tomEl, tagCompl);
      address_district = xmlTextByTags(tomEl, tagDistrict);
      address_city = xmlTextByTags(tomEl, tagCity);
      address_state = xmlTextByTags(tomEl, tagState);
      address_postal_code = digitsOnly(xmlTextByTags(tomEl, tagCep)).slice(0, 8);
    } else {
      documentRaw =
        xmlTextByTagsScoped(doc, tomadorSections, tagDoc) || xmlTextByTags(doc, ["TomadorCpfCnpj"]);
      name =
        xmlTextByTagsScoped(doc, tomadorSections, tagName) ||
        xmlTextByTags(doc, ["TomadorRazaoSocial", "TomadorNome", "xNome", "XNome"]) ||
        "Tomador importado NFS-e";
      email = xmlTextByTagsScoped(doc, tomadorSections, tagEmail) || xmlTextByTags(doc, ["TomadorEmail"]);
      phone =
        xmlTextByTagsScoped(doc, tomadorSections, tagPhone) || xmlTextByTags(doc, ["TomadorTelefone"]);
      address_street = xmlTextByTagsScoped(doc, tomadorSections, tagStreet);
      address_number = xmlTextByTagsScoped(doc, tomadorSections, tagNumber);
      address_complement = xmlTextByTagsScoped(doc, tomadorSections, tagCompl);
      address_district = xmlTextByTagsScoped(doc, tomadorSections, tagDistrict);
      address_city = xmlTextByTagsScoped(doc, tomadorSections, tagCity);
      address_state = xmlTextByTagsScoped(doc, tomadorSections, tagState);
      address_postal_code = digitsOnly(xmlTextByTagsScoped(doc, tomadorSections, tagCep)).slice(0, 8);
    }
    const documentDigits = digitsOnly(documentRaw);
    const taxKind: "cpf" | "cnpj" = documentDigits.length === 11 ? "cpf" : "cnpj";
    return {
      name,
      document: documentDigits,
      tax_id_kind: taxKind,
      email,
      phone,
      address_street,
      address_number,
      address_complement,
      address_district,
      address_city,
      address_state: address_state.slice(0, 2).toUpperCase(),
      address_postal_code,
    };
  } catch {
    return null;
  }
}

type TypeaheadOption = {
  id: number;
  label: string;
};

function TypeaheadInput(props: {
  value: string;
  onValueChange: (next: string) => void;
  options: TypeaheadOption[];
  placeholder: string;
  onPick: (option: TypeaheadOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  function commitIndex(idx: number) {
    const option = props.options[idx];
    if (!option) return;
    props.onPick(option);
    setOpen(false);
  }

  return (
    <div className={styles.typeaheadWrap}>
      <input
        value={props.value}
        onChange={(e) => {
          props.onValueChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            setOpen(true);
            return;
          }
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((prev) => (props.options.length === 0 ? 0 : (prev + 1) % props.options.length));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((prev) => (props.options.length === 0 ? 0 : (prev - 1 + props.options.length) % props.options.length));
          } else if (e.key === "Enter") {
            e.preventDefault();
            commitIndex(activeIndex);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
          }
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        placeholder={props.placeholder}
      />
      {open && props.options.length > 0 ? (
        <ul className={styles.typeaheadMenu}>
          {props.options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                className={`${styles.typeaheadItem} ${props.options[activeIndex]?.id === option.id ? styles.typeaheadItemActive : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  props.onPick(option);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function rowHasStoredXml(row: NfseInvoiceOut): boolean {
  return Boolean(findXmlValue(parseJsonSafe(row.response_payload_json)));
}

/** Mensagens cruas legadas do backend + texto útil para HTTP 404 no ADN. */
function displayNfseErrorForUi(msg: string | null | undefined, emptyLabel: string): string {
  if (msg == null || !String(msg).trim()) return emptyLabel;
  const t = String(msg).trim();
  if (t === "HTTP 404" || /^HTTP\s*404$/i.test(t)) {
    return (
      "Recurso não encontrado no Ambiente Nacional (HTTP 404). " +
      "A DPS pode não existir nesse ambiente, ou homologação/produção não coincide com a emissão — use Reemitir."
    );
  }
  return String(msg);
}

const STATUS_LABEL: Record<NfseInvoiceOut["status"], string> = {
  pending_submission: "Pendente envio",
  issued: "Emitida",
  failed: "Falhou",
  cancelled: "Cancelada",
};

const PROVIDER_LABEL: Record<NfseInvoiceOut["provider"], string> = {
  national_mei: "Nacional MEI",
  focus: "Focus",
};

function IconEmit() {
  return (
    <svg className={styles.toolbarIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12m0 0l4-4m-4 4l-4-4M5 19h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconImport() {
  return (
    <svg className={styles.toolbarIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 11V3m0 8l4-4m-4 4L8 7M5 21h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBatch() {
  return (
    <svg className={styles.toolbarIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6h16M4 12h10M4 18h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function NfsePage() {
  const [rows, setRows] = useState<NfseInvoiceOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | NfseInvoiceOut["status"]>("");
  const [providerFilter, setProviderFilter] = useState<"" | NfseInvoiceOut["provider"]>("");
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const batchFileRef = useRef<HTMLInputElement>(null);
  const [issueSoId, setIssueSoId] = useState("");
  const [issueSoSearch, setIssueSoSearch] = useState("");
  const [issueSoOptions, setIssueSoOptions] = useState<ServiceOrderOut[]>([]);
  const [issueFeId, setIssueFeId] = useState("");
  const [issueFeSearch, setIssueFeSearch] = useState("");
  const [financeOptionsIssue, setFinanceOptionsIssue] = useState<FinanceEntryOut[]>([]);
  const [issueCodigoTrib, setIssueCodigoTrib] = useState("");
  const [issueCodigoNbs, setIssueCodigoNbs] = useState("");
  const [issueEmitMode, setIssueEmitMode] = useState<"linked" | "standalone">("linked");
  const [issueClientId, setIssueClientId] = useState("");
  const [issueClientSearch, setIssueClientSearch] = useState("");
  const [issueClientOptions, setIssueClientOptions] = useState<ClientOut[]>([]);
  const [issueAmount, setIssueAmount] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [tribCatalog, setTribCatalog] = useState<NfseTributacaoNacionalItem[]>([]);
  const [forceProvider, setForceProvider] = useState<"" | NfseInvoiceOut["provider"]>("");
  const [issuing, setIssuing] = useState(false);
  const [payloadModal, setPayloadModal] = useState<NfseInvoiceOut | null>(null);
  const [linkSoId, setLinkSoId] = useState("");
  const [linkSoSearch, setLinkSoSearch] = useState("");
  const [linkSoOptions, setLinkSoOptions] = useState<ServiceOrderOut[]>([]);
  const [linkFeId, setLinkFeId] = useState("");
  const [linkFeSearch, setLinkFeSearch] = useState("");
  const [linkFeOptions, setLinkFeOptions] = useState<FinanceEntryOut[]>([]);
  const [linkSaving, setLinkSaving] = useState(false);
  const [importClientId, setImportClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [clientOptions, setClientOptions] = useState<ClientOut[]>([]);
  const [importServiceOrderId, setImportServiceOrderId] = useState("");
  const [importSoSearch, setImportSoSearch] = useState("");
  const [importSoOptions, setImportSoOptions] = useState<ServiceOrderOut[]>([]);
  const [importFinanceEntryId, setImportFinanceEntryId] = useState("");
  const [financeSearchImport, setFinanceSearchImport] = useState("");
  const [financeOptionsImport, setFinanceOptionsImport] = useState<FinanceEntryOut[]>([]);
  const [importProvider, setImportProvider] = useState<NfseInvoiceOut["provider"]>("national_mei");
  const [importAmount, setImportAmount] = useState("");
  const [associateClientSearch, setAssociateClientSearch] = useState("");
  const [associateClientId, setAssociateClientId] = useState("");
  const [autoCreateClientIfMissing, setAutoCreateClientIfMissing] = useState(false);
  const [importXml, setImportXml] = useState("");
  const [importingXml, setImportingXml] = useState(false);
  const [batchXmlItems, setBatchXmlItems] = useState<string[]>([]);
  const [batchFileNames, setBatchFileNames] = useState<string[]>([]);
  const [importingBatch, setImportingBatch] = useState(false);
  const [batchResult, setBatchResult] = useState<NfseImportXmlBatchOut | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [tomadorDraft, setTomadorDraft] = useState<TomadorDraft | null>(null);
  const [creatingFromTomador, setCreatingFromTomador] = useState(false);
  const [reprocessingInvoice, setReprocessingInvoice] = useState(false);
  const [refreshingAdn, setRefreshingAdn] = useState(false);
  /** Erro da última tentativa de sync ADN (mostrado no modal, ao lado do botão). */
  const [refreshAdnErr, setRefreshAdnErr] = useState<string | null>(null);
  const [invoiceSearchInput, setInvoiceSearchInput] = useState("");
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState("");
  const [invoiceSort, setInvoiceSort] = useState<"nfse_number_desc" | "nfse_number_asc" | "id_desc">("nfse_number_desc");
  const clientTypeaheadOptions = useMemo<TypeaheadOption[]>(
    () => clientOptions.map((c) => ({ id: c.id, label: `${c.id} - ${c.name}` })),
    [clientOptions],
  );
  const associateClientTypeaheadOptions = clientTypeaheadOptions;
  const issueSoTypeaheadOptions = useMemo<TypeaheadOption[]>(
    () => issueSoOptions.map((o) => ({ id: o.id, label: `${o.id} - ${o.title}` })),
    [issueSoOptions],
  );
  const importSoTypeaheadOptions = useMemo<TypeaheadOption[]>(
    () => importSoOptions.map((o) => ({ id: o.id, label: `${o.id} - ${o.title}` })),
    [importSoOptions],
  );
  const linkSoTypeaheadOptions = useMemo<TypeaheadOption[]>(
    () => linkSoOptions.map((o) => ({ id: o.id, label: `${o.id} - ${o.title}` })),
    [linkSoOptions],
  );
  const linkFeTypeaheadOptions = useMemo<TypeaheadOption[]>(
    () => linkFeOptions.map((f) => ({ id: f.id, label: `${f.id} - ${f.description} - R$ ${Number(f.amount).toFixed(2)}` })),
    [linkFeOptions],
  );
  const issueClientTypeaheadOptions = useMemo<TypeaheadOption[]>(
    () => issueClientOptions.map((c) => ({ id: c.id, label: `${c.id} - ${c.name}` })),
    [issueClientOptions],
  );
  const financeIssueTypeaheadOptions = useMemo<TypeaheadOption[]>(
    () => financeOptionsIssue.map((f) => ({ id: f.id, label: `${f.id} - ${f.description} - R$ ${Number(f.amount).toFixed(2)}` })),
    [financeOptionsIssue],
  );
  const financeImportTypeaheadOptions = useMemo<TypeaheadOption[]>(
    () => financeOptionsImport.map((f) => ({ id: f.id, label: `${f.id} - ${f.description} - R$ ${Number(f.amount).toFixed(2)}` })),
    [financeOptionsImport],
  );

  const modalChaveAcesso = useMemo(
    () => (payloadModal ? extractChaveAcessoNfse(payloadModal) : null),
    [payloadModal],
  );

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const data = await listNfseInvoices({
        status: statusFilter || undefined,
        provider: providerFilter || undefined,
        search: invoiceSearchQuery.trim() || undefined,
        sort: invoiceSort,
        limit: 150,
      });
      setRows(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível carregar NFS-e.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [statusFilter, providerFilter, invoiceSearchQuery, invoiceSort]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listClients({ q: clientSearch || undefined, limit: 20, skip: 0 });
        if (!cancelled) setClientOptions(rows);
      } catch {
        if (!cancelled) setClientOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientSearch]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listServiceOrders({ limit: 200, skip: 0 });
        if (!cancelled) {
          const qi = issueSoSearch.trim().toLowerCase();
          setIssueSoOptions(
            qi ? rows.filter((r) => `${r.id} ${r.title}`.toLowerCase().includes(qi)).slice(0, 30) : rows.slice(0, 30),
          );
          const qm = importSoSearch.trim().toLowerCase();
          setImportSoOptions(
            qm ? rows.filter((r) => `${r.id} ${r.title}`.toLowerCase().includes(qm)).slice(0, 30) : rows.slice(0, 30),
          );
          const ql = linkSoSearch.trim().toLowerCase();
          setLinkSoOptions(
            ql ? rows.filter((r) => `${r.id} ${r.title}`.toLowerCase().includes(ql)).slice(0, 30) : rows.slice(0, 30),
          );
        }
      } catch {
        if (!cancelled) {
          setIssueSoOptions([]);
          setImportSoOptions([]);
          setLinkSoOptions([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [issueSoSearch, importSoSearch, linkSoSearch]);

  useEffect(() => {
    if (!payloadModal) {
      setRefreshAdnErr(null);
      return;
    }
    setRefreshAdnErr(null);
    setLinkSoId(payloadModal.service_order_id != null ? String(payloadModal.service_order_id) : "");
    setLinkSoSearch(payloadModal.service_order_id != null ? `OS #${payloadModal.service_order_id}` : "");
    setLinkFeId(payloadModal.finance_entry_id != null ? String(payloadModal.finance_entry_id) : "");
    setLinkFeSearch(payloadModal.finance_entry_id != null ? `Lançamento #${payloadModal.finance_entry_id}` : "");
  }, [payloadModal?.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const end = new Date();
        const start = new Date();
        start.setMonth(start.getMonth() - 6);
        const rows = await listFinanceEntries({
          start_date: dateInput(start),
          end_date: dateInput(end),
          service_order_id: issueSoId.trim() ? Number(issueSoId) : undefined,
        });
        if (!cancelled) {
          const q = issueFeSearch.trim().toLowerCase();
          const filtered = q
            ? rows.filter((r) => `${r.id} ${r.description} ${r.amount} ${r.due_date}`.toLowerCase().includes(q))
            : rows;
          setFinanceOptionsIssue(filtered.slice(0, 40));
        }
      } catch {
        if (!cancelled) setFinanceOptionsIssue([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [issueFeSearch, issueSoId]);

  useEffect(() => {
    if (!payloadModal) return;
    let cancelled = false;
    void (async () => {
      try {
        const end = new Date();
        const start = new Date();
        start.setMonth(start.getMonth() - 6);
        const rows = await listFinanceEntries({
          start_date: dateInput(start),
          end_date: dateInput(end),
          service_order_id: linkSoId.trim() ? Number(linkSoId) : undefined,
        });
        if (!cancelled) {
          const q = linkFeSearch.trim().toLowerCase();
          const filtered = q
            ? rows.filter((r) => `${r.id} ${r.description} ${r.amount} ${r.due_date}`.toLowerCase().includes(q))
            : rows;
          setLinkFeOptions(filtered.slice(0, 40));
        }
      } catch {
        if (!cancelled) setLinkFeOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [linkFeSearch, linkSoId, payloadModal?.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const end = new Date();
        const start = new Date();
        start.setMonth(start.getMonth() - 6);
        const rows = await listFinanceEntries({
          start_date: dateInput(start),
          end_date: dateInput(end),
          service_order_id: importServiceOrderId.trim() ? Number(importServiceOrderId) : undefined,
        });
        if (!cancelled) {
          const q = financeSearchImport.trim().toLowerCase();
          const filtered = q
            ? rows.filter((r) => `${r.id} ${r.description} ${r.amount} ${r.due_date}`.toLowerCase().includes(q))
            : rows;
          setFinanceOptionsImport(filtered.slice(0, 40));
        }
      } catch {
        if (!cancelled) setFinanceOptionsImport([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [financeSearchImport, importServiceOrderId]);

  useEffect(() => {
    if (!issueModalOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const [cat, settings] = await Promise.all([listNfseTributacaoNacionalCatalog(), getNfseSettings()]);
        if (cancelled) return;
        setTribCatalog(cat);
        const def = settings.default_codigo_tributacao_nacional?.trim();
        if (def) {
          setIssueCodigoTrib((prev) => (prev.trim() ? prev : def));
        }
        const defNbs = settings.default_codigo_nbs?.trim();
        if (defNbs) {
          setIssueCodigoNbs((prev) => (prev.trim() ? prev : defNbs));
        }
      } catch {
        if (!cancelled) setTribCatalog([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [issueModalOpen]);

  useEffect(() => {
    if (!issueModalOpen || issueEmitMode !== "standalone") return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listClients({ q: issueClientSearch || undefined, limit: 20, skip: 0 });
        if (!cancelled) setIssueClientOptions(rows);
      } catch {
        if (!cancelled) setIssueClientOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [issueClientSearch, issueEmitMode, issueModalOpen]);

  function resetIssueForm() {
    setIssueSoId("");
    setIssueSoSearch("");
    setIssueFeId("");
    setIssueFeSearch("");
    setIssueCodigoTrib("");
    setIssueCodigoNbs("");
    setIssueEmitMode("linked");
    setIssueClientId("");
    setIssueClientSearch("");
    setIssueAmount("");
    setIssueDescription("");
    setForceProvider("");
  }

  async function onIssue(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    setIssuing(true);
    try {
      if (issueEmitMode === "standalone") {
        const cid = issueClientId.trim() ? Number(issueClientId) : NaN;
        const amtRaw = issueAmount.trim().replace(",", ".");
        const amt = amtRaw ? Number(amtRaw) : NaN;
        if (!Number.isFinite(cid) || cid < 1) {
          setErr("Selecione o cliente (tomador).");
          setIssuing(false);
          return;
        }
        if (!Number.isFinite(amt) || amt <= 0) {
          setErr("Informe o valor do serviço (maior que zero).");
          setIssuing(false);
          return;
        }
        const desc = issueDescription.trim();
        if (desc.length < 5) {
          setErr("Descrição do serviço é obrigatória (mínimo 5 caracteres).");
          setIssuing(false);
          return;
        }
        if (forceProvider !== "focus") {
          if (!issueCodigoTrib.trim()) {
            setErr("Código de tributação nacional (cTribNac) é obrigatório na NFS-e Nacional. Escolha na lista ou digite.");
            setIssuing(false);
            return;
          }
          if (!issueCodigoNbs.trim()) {
            setErr(
              "Código NBS é obrigatório na NFS-e Nacional. Defina o padrão em Administração → Fiscal, use a lista sugerida ou digite o código oficial.",
            );
            setIssuing(false);
            return;
          }
        }
        const row = await issueNfse({
          client_id: cid,
          amount: amt,
          service_description: desc,
          force_provider: forceProvider || undefined,
          codigo_tributacao_nacional: issueCodigoTrib.trim(),
          codigo_nbs: issueCodigoNbs.trim() || undefined,
        });
        setMsg(`NFS-e processada (#${row.id}) com status ${STATUS_LABEL[row.status]}.`);
      } else {
        const so = issueSoId.trim() ? Number(issueSoId) : undefined;
        const fe = issueFeId.trim() ? Number(issueFeId) : undefined;
        if (!so && !fe) {
          setErr("Informe a ordem de serviço ou o lançamento financeiro.");
          setIssuing(false);
          return;
        }
        const row = await issueNfse({
          service_order_id: so,
          finance_entry_id: fe,
          force_provider: forceProvider || undefined,
          codigo_tributacao_nacional: issueCodigoTrib.trim() || undefined,
          codigo_nbs: issueCodigoNbs.trim() || undefined,
        });
        setMsg(`NFS-e processada (#${row.id}) com status ${STATUS_LABEL[row.status]}.`);
      }
      setIssueModalOpen(false);
      resetIssueForm();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível emitir NFS-e.");
    } finally {
      setIssuing(false);
    }
  }

  async function onSaveVinculos() {
    if (!payloadModal) return;
    setLinkSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const patch: { service_order_id?: number; finance_entry_id?: number } = {};
      if (linkSoId.trim()) {
        const n = Number(linkSoId);
        if (!Number.isFinite(n) || n < 1) {
          setErr("ID da OS inválido.");
          return;
        }
        patch.service_order_id = n;
      }
      if (linkFeId.trim()) {
        const n = Number(linkFeId);
        if (!Number.isFinite(n) || n < 1) {
          setErr("ID do lançamento inválido.");
          return;
        }
        patch.finance_entry_id = n;
      }
      if (Object.keys(patch).length === 0) {
        setErr("Informe ao menos uma OS ou um lançamento para vincular.");
        return;
      }
      const updated = await patchNfseInvoice(payloadModal.id, patch);
      setPayloadModal(updated);
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setMsg("Vínculos atualizados.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível salvar os vínculos.");
    } finally {
      setLinkSaving(false);
    }
  }

  async function onRefreshAdn(row: NfseInvoiceOut) {
    setMsg(null);
    setErr(null);
    setRefreshAdnErr(null);
    setRefreshingAdn(true);
    try {
      const updated = await refreshNfseInvoiceFromAdn(row.id);
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setPayloadModal((cur) => (cur?.id === updated.id ? updated : cur));
      setRefreshAdnErr(null);
      setMsg(`Status sincronizado com o ADN: ${STATUS_LABEL[updated.status]}.`);
    } catch (e) {
      const m = e instanceof Error ? e.message : "Não foi possível consultar o ADN.";
      setErr(m);
      setRefreshAdnErr(m);
    } finally {
      setRefreshingAdn(false);
    }
  }

  async function onReissue(row: NfseInvoiceOut) {
    setMsg(null);
    setErr(null);
    if (!row.service_order_id && !row.finance_entry_id) {
      setErr("Esta NFS-e não possui vínculo com OS ou lançamento para reemissão.");
      return;
    }
    setIssuing(true);
    try {
      const next = await issueNfse({
        service_order_id: row.service_order_id ?? undefined,
        finance_entry_id: row.finance_entry_id ?? undefined,
        force_provider: row.provider,
      });
      setMsg(`Reemissão processada (#${next.id}) com status ${STATUS_LABEL[next.status]}.`);
      setPayloadModal((cur) => (cur?.id === row.id || cur?.id === next.id ? next : cur));
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível reemitir NFS-e.");
    } finally {
      setIssuing(false);
    }
  }

  async function onCopyNumber(row: NfseInvoiceOut) {
    const number = row.nfse_number ?? row.rps_number;
    if (!number) {
      setErr("Esta NFS-e ainda não possui número para copiar.");
      return;
    }
    try {
      await navigator.clipboard.writeText(number);
      setMsg(`Número ${number} copiado.`);
    } catch {
      setErr("Não foi possível copiar automaticamente. Verifique permissões do navegador.");
    }
  }

  async function onCopyChaveAcesso(row: NfseInvoiceOut) {
    setErr(null);
    const chave = extractChaveAcessoNfse(row);
    if (!chave) {
      setErr("Chave de acesso não disponível (importe o XML ou emita pela integração nacional).");
      return;
    }
    const digits = chave.replace(/\D/g, "");
    try {
      await navigator.clipboard.writeText(digits);
      setMsg("Chave de acesso copiada (somente números, para colar no portal ou sistemas).");
    } catch {
      setErr("Não foi possível copiar automaticamente. Verifique permissões do navegador.");
    }
  }

  function buildXmlFallback(row: NfseInvoiceOut): string {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<nfse>",
      `  <invoice_id>${row.id}</invoice_id>`,
      `  <provider>${row.provider}</provider>`,
      `  <status>${row.status}</status>`,
      `  <service_order_id>${row.service_order_id ?? ""}</service_order_id>`,
      `  <finance_entry_id>${row.finance_entry_id ?? ""}</finance_entry_id>`,
      `  <nfse_number>${row.nfse_number ?? ""}</nfse_number>`,
      `  <nfse_access_key>${row.nfse_access_key ?? ""}</nfse_access_key>`,
      `  <rps_number>${row.rps_number ?? ""}</rps_number>`,
      `  <verification_code>${row.verification_code ?? ""}</verification_code>`,
      `  <amount>${row.amount}</amount>`,
      `  <issued_at>${row.issued_at ?? ""}</issued_at>`,
      `  <created_at>${row.created_at}</created_at>`,
      "</nfse>",
    ].join("\n");
  }

  function onSaveXml(row: NfseInvoiceOut) {
    setMsg(null);
    setErr(null);
    const requestObj = parseJsonSafe(row.request_payload_json);
    const responseObj = parseJsonSafe(row.response_payload_json);
    const xmlFromPayload = findXmlValue(responseObj) ?? findXmlValue(requestObj);
    const xmlContent = xmlFromPayload ?? buildXmlFallback(row);
    const blob = new Blob([xmlContent], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const suffix = row.nfse_number || row.rps_number || String(row.id);
    a.href = url;
    a.download = `nfse-${suffix}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg(`XML da NFS-e #${row.id} salvo com sucesso.`);
  }

  async function onReprocessXml(row: NfseInvoiceOut) {
    if (!rowHasStoredXml(row)) {
      setErr("Esta NFS-e não possui XML armazenado para reprocessar.");
      return;
    }
    setMsg(null);
    setErr(null);
    setReprocessingInvoice(true);
    try {
      const updated = await reparseNfseInvoiceFromXml(row.id);
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setPayloadModal((cur) => (cur?.id === updated.id ? updated : cur));
      setMsg(`Dados do XML atualizados (NFS-e #${updated.id}).`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível reprocessar o XML.");
    } finally {
      setReprocessingInvoice(false);
    }
  }

  function downloadXml(content: string, fileName: string) {
    const blob = new Blob([content], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onImportXml(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    setBatchResult(null);
    if (!importXml.trim()) {
      setErr("Cole o XML da NFS-e (ou carregue via botão de arquivo).");
      return;
    }
    const clientId = importClientId.trim() ? Number(importClientId) : undefined;
    if (clientId != null && (!Number.isFinite(clientId) || clientId <= 0)) {
      setErr("ID do cliente inválido.");
      return;
    }
    const associatedClientId = associateClientId.trim() ? Number(associateClientId) : undefined;
    if (associatedClientId != null && (!Number.isFinite(associatedClientId) || associatedClientId <= 0)) {
      setErr("Cliente associado inválido.");
      return;
    }

    if (autoCreateClientIfMissing && !clientId && !associatedClientId) {
      const draft = parseTomadorFromXml(importXml);
      if (!draft) {
        setErr("Não foi possível extrair os dados do tomador do XML para revisão.");
        return;
      }
      setTomadorDraft(draft);
      setReviewModalOpen(true);
      return;
    }
    setImportingXml(true);
    try {
      const row = await importIssuedNfseXml({
        client_id: clientId,
        associate_client_id: associatedClientId,
        auto_create_client_if_missing: autoCreateClientIfMissing,
        service_order_id: importServiceOrderId.trim() ? Number(importServiceOrderId) : undefined,
        finance_entry_id: importFinanceEntryId.trim() ? Number(importFinanceEntryId) : undefined,
        provider: importProvider,
        xml_content: importXml,
        amount: importAmount.trim() ? Number(importAmount.replace(",", ".")) : undefined,
      });
      setMsg(`NFS-e importada com sucesso (#${row.id}).`);
      setImportModalOpen(false);
      setImportXml("");
      setImportAmount("");
      await load();
    } catch (e) {
      const msgText = e instanceof Error ? e.message : "Não foi possível importar XML da NFS-e.";
      if (!autoCreateClientIfMissing && msgText.toLowerCase().includes("tomador não encontrado")) {
        const ok = window.confirm(
          `${msgText}\n\nDeseja criar automaticamente o cliente com os dados do tomador e tentar novamente?`,
        );
        if (ok) {
          try {
            const row = await importIssuedNfseXml({
              client_id: clientId,
              associate_client_id: associatedClientId,
              auto_create_client_if_missing: true,
              service_order_id: importServiceOrderId.trim() ? Number(importServiceOrderId) : undefined,
              finance_entry_id: importFinanceEntryId.trim() ? Number(importFinanceEntryId) : undefined,
              provider: importProvider,
              xml_content: importXml,
              amount: importAmount.trim() ? Number(importAmount.replace(",", ".")) : undefined,
            });
            setMsg(`NFS-e importada e cliente criado automaticamente (#${row.id}).`);
            setImportModalOpen(false);
            await load();
            return;
          } catch (e2) {
            setErr(e2 instanceof Error ? e2.message : "Falha ao criar cliente automaticamente.");
            return;
          }
        }
      }
      setErr(msgText);
    } finally {
      setImportingXml(false);
    }
  }

  async function onConfirmCreateTomadorClient() {
    if (!tomadorDraft) return;
    setCreatingFromTomador(true);
    setErr(null);
    setMsg(null);
    try {
      const created = await createClient({
        name: tomadorDraft.name.trim() || "Tomador importado NFS-e",
        document: tomadorDraft.document || undefined,
        tax_id_kind: tomadorDraft.tax_id_kind,
        email: tomadorDraft.email || undefined,
        phone: tomadorDraft.phone || undefined,
        address_street: tomadorDraft.address_street || undefined,
        address_number: tomadorDraft.address_number || undefined,
        address_complement: tomadorDraft.address_complement || undefined,
        address_district: tomadorDraft.address_district || undefined,
        address_city: tomadorDraft.address_city || undefined,
        address_state: tomadorDraft.address_state || undefined,
        address_postal_code: tomadorDraft.address_postal_code || undefined,
      });
      const row = await importIssuedNfseXml({
        associate_client_id: created.id,
        auto_create_client_if_missing: false,
        service_order_id: importServiceOrderId.trim() ? Number(importServiceOrderId) : undefined,
        finance_entry_id: importFinanceEntryId.trim() ? Number(importFinanceEntryId) : undefined,
        provider: importProvider,
        xml_content: importXml,
        amount: importAmount.trim() ? Number(importAmount.replace(",", ".")) : undefined,
      });
      setImportClientId(String(created.id));
      setClientSearch(`${created.id} - ${created.name}`);
      setReviewModalOpen(false);
      setTomadorDraft(null);
      setMsg(`Cliente criado e NFS-e importada com sucesso (#${row.id}).`);
      setImportModalOpen(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível criar cliente a partir do tomador.");
    } finally {
      setCreatingFromTomador(false);
    }
  }

  async function onPickXmlFile(file: File | null) {
    if (!file) return;
    try {
      const text = await file.text();
      setImportXml(text);
      setMsg(`Arquivo ${file.name} carregado para importação.`);
      setErr(null);
    } catch {
      setErr("Não foi possível ler o arquivo XML.");
    }
  }

  async function onPickManyXmlFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    try {
      const files = Array.from(fileList);
      const loaded = await Promise.all(files.map((f) => f.text()));
      const zipped = files.map((f, i) => ({ name: f.name, xml: loaded[i] ?? "" })).filter((x) => x.xml.trim().length > 0);
      setBatchXmlItems(zipped.map((x) => x.xml));
      setBatchFileNames(zipped.map((x) => x.name));
      setMsg(`${files.length} arquivo(s) XML carregado(s) para importação em lote.`);
      setErr(null);
    } catch {
      setErr("Não foi possível ler os arquivos XML do lote.");
    }
  }

  async function onImportBatchXml(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    setBatchResult(null);
    if (batchXmlItems.length === 0) {
      setErr("Carregue ao menos um XML no lote.");
      return;
    }
    const clientId = importClientId.trim() ? Number(importClientId) : undefined;
    if (clientId != null && (!Number.isFinite(clientId) || clientId <= 0)) {
      setErr("ID do cliente inválido.");
      return;
    }
    const associatedClientId = associateClientId.trim() ? Number(associateClientId) : undefined;
    if (associatedClientId != null && (!Number.isFinite(associatedClientId) || associatedClientId <= 0)) {
      setErr("Cliente associado inválido.");
      return;
    }
    setImportingBatch(true);
    try {
      const result = await importIssuedNfseXmlBatch({
        client_id: clientId,
        associate_client_id: associatedClientId,
        auto_create_client_if_missing: autoCreateClientIfMissing,
        service_order_id: importServiceOrderId.trim() ? Number(importServiceOrderId) : undefined,
        finance_entry_id: importFinanceEntryId.trim() ? Number(importFinanceEntryId) : undefined,
        provider: importProvider,
        amount: importAmount.trim() ? Number(importAmount.replace(",", ".")) : undefined,
        xml_items: batchXmlItems,
        file_names: batchFileNames,
      });
      setBatchResult(result);
      setMsg(`Lote processado: ${result.imported} importado(s), ${result.failed} falha(s).`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível importar lote de XML.");
    } finally {
      setImportingBatch(false);
    }
  }

  const summary = useMemo(() => {
    return {
      total: rows.length,
      issued: rows.filter((r) => r.status === "issued").length,
      pending: rows.filter((r) => r.status === "pending_submission").length,
      failed: rows.filter((r) => r.status === "failed").length,
    };
  }, [rows]);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1>NFS-e</h1>
        <p>Emissão e acompanhamento de notas fiscais de serviço.</p>
      </header>

      <div className={styles.heroBar}>
        <div className={styles.statCards}>
          <article className={styles.statCard}>
            <span className={styles.statValue}>{summary.total}</span>
            <span className={styles.statLabel}>Total</span>
          </article>
          <article className={styles.statCard}>
            <span className={styles.statValue}>{summary.issued}</span>
            <span className={styles.statLabel}>Emitidas</span>
          </article>
          <article className={styles.statCard}>
            <span className={styles.statValue}>{summary.pending}</span>
            <span className={styles.statLabel}>Pendentes</span>
          </article>
          <article className={styles.statCard}>
            <span className={styles.statValue}>{summary.failed}</span>
            <span className={styles.statLabel}>Falhas</span>
          </article>
        </div>
        <div className={styles.toolbar}>
          <input
            ref={importFileRef}
            type="file"
            className={styles.visuallyHidden}
            accept=".xml,text/xml,application/xml"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              void onPickXmlFile(f);
              setImportModalOpen(true);
              e.target.value = "";
            }}
          />
          <input
            ref={batchFileRef}
            type="file"
            className={styles.visuallyHidden}
            multiple
            accept=".xml,text/xml,application/xml"
            onChange={(e) => {
              void onPickManyXmlFiles(e.target.files);
              setBatchModalOpen(true);
              e.target.value = "";
            }}
          />
          <button type="button" className={styles.toolBtnPrimary} onClick={() => setIssueModalOpen(true)}>
            <IconEmit />
            <span>Emitir NFS-e</span>
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => setImportModalOpen(true)}
            title="Importar XML já emitido"
          >
            <IconImport />
            <span>Importar XML</span>
          </button>
          <button type="button" className={styles.toolBtn} onClick={() => importFileRef.current?.click()} title="Carregar arquivo XML">
            <IconImport />
            <span>Arquivo</span>
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => {
              setBatchModalOpen(true);
              batchFileRef.current?.click();
            }}
            title="Importação em lote"
          >
            <IconBatch />
            <span>Lote</span>
          </button>
        </div>
      </div>

      <p className={styles.pageHint}>
        <strong>NFS-e Nacional:</strong> <strong>cTribNac</strong> e <strong>NBS</strong> são obrigatórios na emissão, com prestador e tomador válidos,
        valor, discriminação e <strong>código IBGE do município do tomador</strong> (7 dígitos no cadastro do cliente — <strong>Buscar CEP</strong>{" "}
        preenche quando disponível). <strong>Ordem de uso:</strong> (1) o que você informar ao emitir; (2) códigos em cada{" "}
        <strong>Serviço</strong> usado na OS; (3) padrão em <strong>Administração → Fiscal</strong> só para completar o que faltar ou emissão avulsa.
      </p>

      <div className={styles.filters}>
        <label>
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "" | NfseInvoiceOut["status"])}>
            <option value="">Todos</option>
            <option value="pending_submission">Pendente envio</option>
            <option value="issued">Emitida</option>
            <option value="failed">Falhou</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </label>
        <label>
          Provedor
          <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value as "" | NfseInvoiceOut["provider"])}>
            <option value="">Todos</option>
            <option value="national_mei">Nacional MEI</option>
            <option value="focus">Focus</option>
          </select>
        </label>
        <label>
          Ordenar por
          <select
            value={invoiceSort}
            onChange={(e) =>
              setInvoiceSort(e.target.value as "nfse_number_desc" | "nfse_number_asc" | "id_desc")
            }
          >
            <option value="nfse_number_desc">Número da NFS-e (maior primeiro)</option>
            <option value="nfse_number_asc">Número da NFS-e (menor primeiro)</option>
            <option value="id_desc">ID interno (mais recente)</option>
          </select>
        </label>
        <div className={styles.searchRow}>
          <label className={styles.searchField}>
            Pesquisar
            <input
              value={invoiceSearchInput}
              onChange={(e) => setInvoiceSearchInput(e.target.value)}
              placeholder="Número, RPS, cliente, ID…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setInvoiceSearchQuery(invoiceSearchInput.trim());
                }
              }}
            />
          </label>
          <button
            type="button"
            className={styles.searchButton}
            onClick={() => setInvoiceSearchQuery(invoiceSearchInput.trim())}
          >
            Pesquisar
          </button>
          {invoiceSearchQuery ? (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => {
                setInvoiceSearchInput("");
                setInvoiceSearchQuery("");
              }}
            >
              Limpar
            </button>
          ) : null}
        </div>
      </div>

      {msg ? <p className={styles.ok}>{msg}</p> : null}
      {err ? <p className={styles.err}>{err}</p> : null}
      {loading ? <p>Carregando...</p> : null}

      <div className={`${styles.tableWrap} ${styles.invoiceTableWrap}`}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Número</th>
              <th>Cliente</th>
              <th>OS</th>
              <th>Provedor</th>
              <th>Status</th>
              <th>Valor</th>
              <th>Emissão</th>
              <th>Erro</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const chaveDigits = extractChaveAcessoNfse(r);
              const chaveFmt = chaveDigits ? formatChaveAcessoExibicao(chaveDigits) : "";
              const chaveShort =
                chaveFmt.length > 28 ? `${chaveFmt.slice(0, 28).trim()}…` : chaveFmt;
              return (
              <tr
                key={r.id}
                className={styles.invoiceRow}
                tabIndex={0}
                role="button"
                aria-label={`Abrir detalhes da NFS-e ${r.nfse_number ?? r.rps_number ?? r.id}${chaveDigits ? `, chave ${chaveDigits.replace(/\D/g, "").slice(0, 8)}…` : ""}`}
                onClick={() => setPayloadModal(r)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setPayloadModal(r);
                  }
                }}
              >
                <td>
                  <span className={styles.numeroCell}>{r.nfse_number ?? r.rps_number ?? "—"}</span>
                  {chaveDigits ? (
                    <span className={styles.chaveHint} title={`Chave de acesso: ${chaveFmt}`}>
                      {chaveShort}
                    </span>
                  ) : null}
                </td>
                <td>{r.client_name ?? "—"}</td>
                <td>{r.service_order_id ?? "—"}</td>
                <td>{PROVIDER_LABEL[r.provider]}</td>
                <td>{STATUS_LABEL[r.status]}</td>
                <td>{money(r.amount)}</td>
                <td>{dt(r.issued_at)}</td>
                <td className={styles.errCell}>{displayNfseErrorForUi(r.error_message, "—")}</td>
              </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8}>Nenhuma NFS-e encontrada.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {payloadModal ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Detalhes da NFS-e">
          <div className={`${styles.modal} ${styles.modalNfseDetail}`}>
            <header className={styles.modalHeader}>
              <h3>
                NFS-e {payloadModal.nfse_number ?? payloadModal.rps_number ?? `#${payloadModal.id}`}
              </h3>
              <div className={styles.modalHeaderActions}>
                <button type="button" className={styles.noPrint} onClick={() => window.print()}>
                  Imprimir
                </button>
                <button type="button" onClick={() => setPayloadModal(null)}>
                  Fechar
                </button>
              </div>
            </header>
            <div className={styles.modalBody}>
              <div className={styles.detailMeta}>
                <p className={styles.noPrint}>
                  <strong>Status:</strong> {STATUS_LABEL[payloadModal.status]} | <strong>Provedor:</strong>{" "}
                  {PROVIDER_LABEL[payloadModal.provider]}
                </p>
                <p className={styles.noPrint}>
                  <strong>Erro:</strong> {displayNfseErrorForUi(payloadModal.error_message, "Sem erro registrado.")}
                </p>
              </div>
              {payloadModal.status === "pending_submission" ? (
                <>
                  <div className={`${styles.pendingAdnStrip} ${styles.noPrint}`}>
                    <button
                      type="button"
                      className={styles.pendingAdnPrimary}
                      onClick={() => void onRefreshAdn(payloadModal)}
                      disabled={issuing || refreshingAdn}
                    >
                      {refreshingAdn ? "Consultando o ADN..." : "Sincronizar com o ADN"}
                    </button>
                    <p className={styles.pendingAdnStripHint}>
                      Atualiza esta NFS-e quando o ambiente nacional já tiver processado a DPS (útil em homologação ou se você
                      saiu da tela durante a emissão).
                    </p>
                  </div>
                  {refreshAdnErr ? (
                    <p className={`${styles.refreshAdnErr} ${styles.noPrint}`} role="alert">
                      {refreshAdnErr}
                    </p>
                  ) : null}
                </>
              ) : null}
              {modalChaveAcesso ? (
                <div className={`${styles.chavePanel} ${styles.noPrint}`}>
                  <strong>Chave de acesso (NFS-e Nacional)</strong>
                  <p className={styles.chaveFormatted}>{formatChaveAcessoExibicao(modalChaveAcesso)}</p>
                  <div className={styles.chaveLinks}>
                    <a href={payloadQrConsultaNfse(modalChaveAcesso)} target="_blank" rel="noopener noreferrer">
                      Consultar no portal nacional
                    </a>
                    <button type="button" onClick={() => void onCopyChaveAcesso(payloadModal)}>
                      Copiar chave (só números)
                    </button>
                  </div>
                </div>
              ) : null}
              <div className={`${styles.detailActions} ${styles.noPrint}`}>
                <button type="button" onClick={() => void onReissue(payloadModal)} disabled={issuing}>
                  Reemitir
                </button>
                <button type="button" onClick={() => void onCopyNumber(payloadModal)}>
                  Copiar número
                </button>
                <button type="button" onClick={() => onSaveXml(payloadModal)} disabled={payloadModal.status !== "issued"}>
                  Salvar XML
                </button>
                {rowHasStoredXml(payloadModal) ? (
                  <button type="button" disabled={reprocessingInvoice} onClick={() => void onReprocessXml(payloadModal)}>
                    {reprocessingInvoice ? "Reprocessando..." : "Reprocessar XML"}
                  </button>
                ) : null}
              </div>
              <section className={`${styles.vinculosPanel} ${styles.noPrint}`}>
                <h4 className={styles.vinculosTitle}>Vínculos com operação</h4>
                <p className={styles.helperText}>
                  Associe esta NFS-e a uma OS ou a um lançamento financeiro (mesmo cliente da nota).
                </p>
                <div className={styles.grid}>
                  <label>
                    Ordem de serviço
                    <TypeaheadInput
                      value={linkSoSearch}
                      onValueChange={setLinkSoSearch}
                      options={linkSoTypeaheadOptions}
                      placeholder="Pesquisar OS"
                      onPick={(option) => {
                        setLinkSoId(String(option.id));
                        setLinkSoSearch(option.label);
                      }}
                    />
                  </label>
                  <label>
                    Lançamento financeiro
                    <TypeaheadInput
                      value={linkFeSearch}
                      onValueChange={setLinkFeSearch}
                      options={linkFeTypeaheadOptions}
                      placeholder="Pesquisar lançamento"
                      onPick={(option) => {
                        setLinkFeId(String(option.id));
                        setLinkFeSearch(option.label);
                      }}
                    />
                  </label>
                </div>
                <button type="button" className={styles.vinculosSave} disabled={linkSaving} onClick={() => void onSaveVinculos()}>
                  {linkSaving ? "Salvando..." : "Salvar vínculos"}
                </button>
              </section>
              {payloadModal.status === "pending_submission" ? (
                <div className={styles.noPrint}>
                  <PendingSubmissionBanner invoice={payloadModal} />
                </div>
              ) : null}
              <div className={styles.printAreaWrap}>
                <NfsePrintableDocument invoice={payloadModal} />
              </div>
              <details className={styles.noPrint}>
                <summary>Dados técnicos (JSON / XML bruto)</summary>
                <div className={styles.payloadBlock}>
                  <span>Resumo estruturado</span>
                  <ImportDisplayPanel data={payloadModal.import_display} />
                </div>
                <label className={styles.payloadBlock}>
                  <span>Payload de requisição</span>
                  <textarea readOnly value={payloadModal.request_payload_json ?? ""} rows={6} />
                </label>
                <label className={styles.payloadBlock}>
                  <span>Payload de resposta</span>
                  <textarea readOnly value={payloadModal.response_payload_json ?? ""} rows={6} />
                </label>
              </details>
            </div>
          </div>
        </div>
      ) : null}

      {issueModalOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Emitir NFS-e">
          <div className={styles.modal}>
            <header className={styles.modalHeader}>
              <h3>Emitir NFS-e</h3>
              <button
                type="button"
                onClick={() => {
                  setIssueModalOpen(false);
                  setErr(null);
                  resetIssueForm();
                }}
              >
                Fechar
              </button>
            </header>
            <form className={styles.modalBody} onSubmit={onIssue}>
              <div className={styles.emitModeSwitch} role="group" aria-label="Modo de emissão">
                <button
                  type="button"
                  className={issueEmitMode === "linked" ? styles.emitModeBtnActive : styles.emitModeBtn}
                  onClick={() => setIssueEmitMode("linked")}
                >
                  Com OS / financeiro
                </button>
                <button
                  type="button"
                  className={issueEmitMode === "standalone" ? styles.emitModeBtnActive : styles.emitModeBtn}
                  onClick={() => setIssueEmitMode("standalone")}
                >
                  Avulsa (sem OS)
                </button>
              </div>

              {issueEmitMode === "standalone" ? (
                <div className={styles.grid}>
                  <label>
                    Cliente (tomador)
                    <TypeaheadInput
                      value={issueClientSearch}
                      onValueChange={setIssueClientSearch}
                      options={issueClientTypeaheadOptions}
                      placeholder="Pesquisar cliente"
                      onPick={(option) => {
                        setIssueClientId(String(option.id));
                        setIssueClientSearch(option.label);
                      }}
                    />
                  </label>
                  <label>
                    Valor (R$)
                    <input
                      value={issueAmount}
                      onChange={(e) => setIssueAmount(e.target.value)}
                      placeholder="0,00"
                      inputMode="decimal"
                    />
                  </label>
                  <label className={styles.fullWidthLabel}>
                    Descrição do serviço (discriminação)
                    <textarea
                      value={issueDescription}
                      onChange={(e) => setIssueDescription(e.target.value)}
                      rows={3}
                      placeholder="Ex.: Manutenção preventiva em sistema split 12.000 BTUs"
                    />
                  </label>
                </div>
              ) : (
                <div className={styles.grid}>
                  <label>
                    Ordem de serviço
                    <TypeaheadInput
                      value={issueSoSearch}
                      onValueChange={setIssueSoSearch}
                      options={issueSoTypeaheadOptions}
                      placeholder="Pesquisar OS"
                      onPick={(option) => {
                        setIssueSoId(String(option.id));
                        setIssueSoSearch(option.label);
                      }}
                    />
                  </label>
                  <label>
                    Lançamento financeiro (opcional)
                    <TypeaheadInput
                      value={issueFeSearch}
                      onValueChange={setIssueFeSearch}
                      options={financeIssueTypeaheadOptions}
                      placeholder="Descrição, valor ou ID"
                      onPick={(option) => {
                        setIssueFeId(String(option.id));
                        setIssueFeSearch(option.label);
                      }}
                    />
                  </label>
                </div>
              )}

              {issueEmitMode === "linked" ? (
                <p className={styles.nfseEmitTaxHint}>
                  <strong>Com OS:</strong> em geral cada item da ordem herda <strong>cTribNac</strong> e <strong>NBS</strong> do cadastro de{" "}
                  <strong>Serviços</strong>. Os campos abaixo ficam vazios para usar essa regra; preencha só para{" "}
                  <strong>substituir</strong> nesta emissão. O que faltar nos serviços é completado pelo padrão em Administração → Fiscal.
                </p>
              ) : (
                <p className={styles.nfseEmitTaxHint}>
                  <strong>Avulsa:</strong> informe <strong>cTribNac</strong> e <strong>NBS</strong> abaixo (ou mantenha o padrão do tenant já carregado).
                  Para notas ligadas a OS, prefira cadastrar os códigos em cada <strong>Serviço</strong>.
                </p>
              )}

              <div className={styles.grid}>
                <label>
                  Cód. tributação nacional (cTribNac)
                  {issueEmitMode === "standalone" && forceProvider !== "focus" ? " — obrigatório" : ""}
                  <input
                    list="nfse-issue-trib-datalist"
                    value={issueCodigoTrib}
                    onChange={(e) => setIssueCodigoTrib(e.target.value)}
                    placeholder="Lista sugerida ou digite o código oficial"
                    maxLength={32}
                    autoComplete="off"
                  />
                  <datalist id="nfse-issue-trib-datalist">
                    {tribCatalog.map((t) => (
                      <option key={t.codigo} value={t.codigo}>
                        {t.descricao}
                      </option>
                    ))}
                  </datalist>
                </label>
                <label>
                  Código NBS {issueEmitMode === "standalone" && forceProvider !== "focus" ? "— obrigatório" : "(padrão / OS / override)"}
                  <input
                    list="nfse-issue-nbs-datalist"
                    value={issueCodigoNbs}
                    onChange={(e) => setIssueCodigoNbs(e.target.value)}
                    placeholder="Lista sugerida (exemplos) ou código oficial"
                    maxLength={32}
                    autoComplete="off"
                  />
                  <datalist id="nfse-issue-nbs-datalist">
                    {[...new Set(tribCatalog.map((t) => t.nbs_sugerido).filter((v): v is string => Boolean(v && String(v).trim())))].map(
                      (nbs) => (
                        <option key={nbs} value={nbs} />
                      ),
                    )}
                  </datalist>
                </label>
                <label>
                  Forçar provedor
                  <select value={forceProvider} onChange={(e) => setForceProvider(e.target.value as "" | NfseInvoiceOut["provider"])}>
                    <option value="">Automático</option>
                    <option value="national_mei">Nacional MEI</option>
                    <option value="focus">Focus</option>
                  </select>
                </label>
              </div>
              <p className={styles.helperText}>
                {issueEmitMode === "standalone"
                  ? "Emissão avulsa não exige OS. Os códigos devem seguir as tabelas oficiais (listas da tela são só auxiliares)."
                  : "Deixe os campos vazios para usar serviços da OS + padrão fiscal; preencha para forçar valores só nesta NFS-e."}
              </p>
              <div className={styles.modalFooter}>
                <button type="submit" className={styles.modalPrimaryBtn} disabled={issuing}>
                  {issuing ? "Emitindo..." : "Emitir"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {importModalOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Importar XML">
          <div className={styles.modal}>
            <header className={styles.modalHeader}>
              <h3>Importar NFS-e (XML)</h3>
              <button type="button" onClick={() => setImportModalOpen(false)}>
                Fechar
              </button>
            </header>
            <form className={styles.modalBody} onSubmit={onImportXml}>
              <div className={styles.grid}>
                <label>
                  Cliente (opcional)
                  <TypeaheadInput
                    value={clientSearch}
                    onValueChange={setClientSearch}
                    options={clientTypeaheadOptions}
                    placeholder="Forçar associação"
                    onPick={(option) => {
                      setImportClientId(String(option.id));
                      setClientSearch(option.label);
                    }}
                  />
                </label>
                <label>
                  Associar cliente existente
                  <TypeaheadInput
                    value={associateClientSearch}
                    onValueChange={setAssociateClientSearch}
                    options={associateClientTypeaheadOptions}
                    placeholder="Tomador = cadastro"
                    onPick={(option) => {
                      setAssociateClientId(String(option.id));
                      setAssociateClientSearch(option.label);
                    }}
                  />
                </label>
                <label>
                  Ordem de serviço (opcional)
                  <TypeaheadInput
                    value={importSoSearch}
                    onValueChange={setImportSoSearch}
                    options={importSoTypeaheadOptions}
                    placeholder="Pesquisar OS"
                    onPick={(option) => {
                      setImportServiceOrderId(String(option.id));
                      setImportSoSearch(option.label);
                    }}
                  />
                </label>
                <label>
                  Lançamento (opcional)
                  <TypeaheadInput
                    value={financeSearchImport}
                    onValueChange={setFinanceSearchImport}
                    options={financeImportTypeaheadOptions}
                    placeholder="Pesquisar lançamento"
                    onPick={(option) => {
                      setImportFinanceEntryId(String(option.id));
                      setFinanceSearchImport(option.label);
                    }}
                  />
                </label>
                <label>
                  Provedor
                  <select value={importProvider} onChange={(e) => setImportProvider(e.target.value as NfseInvoiceOut["provider"])}>
                    <option value="national_mei">Nacional MEI</option>
                    <option value="focus">Focus</option>
                  </select>
                </label>
                <label>
                  Valor (opcional)
                  <input value={importAmount} onChange={(e) => setImportAmount(e.target.value)} placeholder="150,90" />
                </label>
                <label>
                  Arquivo XML
                  <input
                    type="file"
                    accept=".xml,text/xml,application/xml"
                    onChange={(e) => void onPickXmlFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <label className={styles.weekdayLike}>
                <input
                  type="checkbox"
                  checked={autoCreateClientIfMissing}
                  onChange={(e) => setAutoCreateClientIfMissing(e.target.checked)}
                />
                Criar cliente automaticamente se o tomador não existir
              </label>
              <label className={styles.xmlField}>
                XML
                <textarea
                  value={importXml}
                  onChange={(e) => setImportXml(e.target.value)}
                  rows={8}
                  placeholder="Cole o XML emitido no portal..."
                />
              </label>
              <div className={styles.modalFooter}>
                <button type="submit" className={styles.modalPrimaryBtn} disabled={importingXml}>
                  {importingXml ? "Importando..." : "Importar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {batchModalOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Importar lote">
          <div className={styles.modal}>
            <header className={styles.modalHeader}>
              <h3>Importação em lote</h3>
              <button type="button" onClick={() => setBatchModalOpen(false)}>
                Fechar
              </button>
            </header>
            <div className={styles.modalBody}>
              <form onSubmit={onImportBatchXml} className={styles.batchForm}>
                <p className={styles.helperText}>
                  {batchXmlItems.length} arquivo(s) selecionado(s). Use o botão &quot;Lote&quot; na barra superior ou escolha
                  novamente.
                </p>
                <label>
                  <span className={styles.visuallyHidden}>Arquivos XML</span>
                  <input
                    type="file"
                    multiple
                    accept=".xml,text/xml,application/xml"
                    onChange={(e) => void onPickManyXmlFiles(e.target.files)}
                  />
                </label>
                <div className={styles.modalFooter}>
                  <button type="submit" className={styles.modalPrimaryBtn} disabled={importingBatch || batchXmlItems.length === 0}>
                    {importingBatch ? "Importando..." : "Importar lote"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBatchXmlItems([]);
                      setBatchFileNames([]);
                      setBatchResult(null);
                    }}
                    disabled={importingBatch}
                  >
                    Limpar
                  </button>
                </div>
              </form>
              {batchResult ? (
                <section className={styles.batchResult}>
                  <h4>Resultado</h4>
                  <p className={styles.helperText}>
                    Total: {batchResult.total} | OK: {batchResult.imported} | Falhas: {batchResult.failed}
                  </p>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Arquivo</th>
                          <th>Status</th>
                          <th>Mensagem</th>
                          <th>ID</th>
                          <th>Número</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchResult.items.map((it) => (
                          <tr key={it.index}>
                            <td>{it.index}</td>
                            <td>
                              {it.file_name ? (
                                <button
                                  type="button"
                                  className={styles.linkButton}
                                  onClick={() => {
                                    const xml = batchXmlItems[it.index - 1] ?? "";
                                    if (!xml.trim()) return;
                                    downloadXml(xml, it.file_name ?? `xml-${it.index}.xml`);
                                  }}
                                >
                                  {it.file_name}
                                </button>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>{it.ok ? "OK" : "Falhou"}</td>
                            <td>{it.message}</td>
                            <td>{it.invoice_id ?? "—"}</td>
                            <td>{it.nfse_number ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {reviewModalOpen && tomadorDraft ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Revisar dados do tomador">
          <div className={styles.modal}>
            <header className={styles.modalHeader}>
              <h3>Revisar tomador antes de criar cliente</h3>
              <button type="button" onClick={() => setReviewModalOpen(false)} disabled={creatingFromTomador}>
                Fechar
              </button>
            </header>
            <div className={styles.modalBody}>
              <div className={styles.grid}>
                <label>
                  Nome
                  <input value={tomadorDraft.name} onChange={(e) => setTomadorDraft((p) => (p ? { ...p, name: e.target.value } : p))} />
                </label>
                <label>
                  Documento
                  <input
                    value={tomadorDraft.document}
                    onChange={(e) => setTomadorDraft((p) => (p ? { ...p, document: digitsOnly(e.target.value) } : p))}
                  />
                </label>
                <label>
                  Tipo
                  <select
                    value={tomadorDraft.tax_id_kind}
                    onChange={(e) =>
                      setTomadorDraft((p) => (p ? { ...p, tax_id_kind: e.target.value as "cpf" | "cnpj" } : p))
                    }
                  >
                    <option value="cpf">CPF</option>
                    <option value="cnpj">CNPJ</option>
                  </select>
                </label>
                <label>
                  E-mail
                  <input value={tomadorDraft.email} onChange={(e) => setTomadorDraft((p) => (p ? { ...p, email: e.target.value } : p))} />
                </label>
                <label>
                  Telefone
                  <input value={tomadorDraft.phone} onChange={(e) => setTomadorDraft((p) => (p ? { ...p, phone: e.target.value } : p))} />
                </label>
                <label>
                  Endereço
                  <input
                    value={tomadorDraft.address_street}
                    onChange={(e) => setTomadorDraft((p) => (p ? { ...p, address_street: e.target.value } : p))}
                  />
                </label>
                <label>
                  Número
                  <input
                    value={tomadorDraft.address_number}
                    onChange={(e) => setTomadorDraft((p) => (p ? { ...p, address_number: e.target.value } : p))}
                  />
                </label>
                <label>
                  Complemento
                  <input
                    value={tomadorDraft.address_complement}
                    onChange={(e) => setTomadorDraft((p) => (p ? { ...p, address_complement: e.target.value } : p))}
                  />
                </label>
                <label>
                  Bairro
                  <input
                    value={tomadorDraft.address_district}
                    onChange={(e) => setTomadorDraft((p) => (p ? { ...p, address_district: e.target.value } : p))}
                  />
                </label>
                <label>
                  Cidade
                  <input value={tomadorDraft.address_city} onChange={(e) => setTomadorDraft((p) => (p ? { ...p, address_city: e.target.value } : p))} />
                </label>
                <label>
                  UF
                  <input
                    value={tomadorDraft.address_state}
                    onChange={(e) => setTomadorDraft((p) => (p ? { ...p, address_state: e.target.value.toUpperCase().slice(0, 2) } : p))}
                  />
                </label>
                <label>
                  CEP
                  <input
                    value={tomadorDraft.address_postal_code}
                    onChange={(e) => setTomadorDraft((p) => (p ? { ...p, address_postal_code: digitsOnly(e.target.value).slice(0, 8) } : p))}
                  />
                </label>
              </div>
              <div className={styles.actions}>
                <button type="button" onClick={() => void onConfirmCreateTomadorClient()} disabled={creatingFromTomador}>
                  {creatingFromTomador ? "Criando cliente..." : "Criar cliente e importar XML"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
