import { useEffect, useMemo, useState } from "react";
import {
  PDF_STYLES,
  TABLE_THEME,
  normalizePreviewTemplateId,
  scopeLinesFromText,
  tintHex,
  type BudgetPreviewTemplateId,
} from "../../lib/budgetPdfTheme";
import { normalizeBrandColor, normalizeFontColor } from "../../lib/budgetPdfGenerator";
import "./BudgetPreview.tailwind.css";

export type BudgetPreviewConfig = {
  companyName?: string;
  technicalNotes?: string;
};

export type BudgetPreviewProRow = {
  name: string;
  qty: string;
  unit: string;
  unitPrice: string;
  subtotal: string;
};

export type BudgetPreviewDraft = {
  budgetCode?: string;
  issueDate?: string;
  clientName?: string;
  products?: BudgetPreviewProRow[];
  services?: BudgetPreviewProRow[];
  productSubtotal?: string;
  serviceSubtotal?: string;
  total?: string;
  validityDays?: number;
};

export type BudgetPreviewProps = {
  config: BudgetPreviewConfig;
  templateId: BudgetPreviewTemplateId;
  color: string;
  fontColor?: string;
  warranty: string;
  paymentTerms: string;
  paymentMethod?: string;
  scopeText?: string;
  technicalNotes?: string;
  draft?: BudgetPreviewDraft;
};

const SAMPLE = {
  budgetCode: "042-2026",
  issueDate: "01/06/2026",
  client: "Cliente Exemplo Ltda.",
  scopeBullets: [
    "Inspeção técnica e diagnóstico do equipamento.",
    "Execução conforme normas do fabricante.",
  ],
  products: [
    { name: "Filtro de ar lavável", qty: "2", unit: "un.", unitPrice: "R$ 130,00", subtotal: "R$ 260,00" },
  ],
  services: [
    { name: "Limpeza e higienização", qty: "1", unit: "un.", unitPrice: "R$ 280,00", subtotal: "R$ 280,00" },
  ],
  productSubtotal: "R$ 260,00",
  serviceSubtotal: "R$ 280,00",
  total: "R$ 540,00",
};

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

type ClassicRow = { name: string; qty: string; price: string };
type ProRow = BudgetPreviewProRow;

function ItemsTableClassic({ title, rows, color }: { title: string; rows: ClassicRow[]; color: string }) {
  const cols = TABLE_THEME.classic.columns;
  return (
    <div className="mb-2">
      <div
        className="mb-1 rounded-sm px-1.5 py-0.5 text-[6.5px] font-bold"
        style={{
          backgroundColor: tintHex(color, PDF_STYLES.lightTintFactor),
        }}
      >
        {title}
      </div>
      <table className="budget-preview-table">
        <thead>
          <tr>
            {cols.map((col) => (
              <th key={col} style={{ borderColor: color, backgroundColor: color }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td>{row.qty}</td>
              <td>{row.price}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ItemsTableProfessional({
  sectionTitle,
  headerLabel,
  rows,
  color,
}: {
  sectionTitle: string;
  headerLabel: string;
  rows: ProRow[];
  color: string;
}) {
  const theme = TABLE_THEME.professional;
  const cols = theme.columns;
  const gridBorder = tintHex(color, theme.table.gridTint);
  return (
    <div className="mb-2 w-full">
      <p className="mb-[1px] text-[6.5px] font-bold leading-tight">{sectionTitle}</p>
      <table
        className="budget-preview-table budget-preview-table--pro w-full"
        style={{ borderColor: gridBorder }}
      >
        <thead>
          <tr>
            <th style={{ borderColor: gridBorder, backgroundColor: color }}>{headerLabel}</th>
            {cols.slice(1).map((col) => (
              <th key={col} style={{ borderColor: gridBorder, backgroundColor: color }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white">
          {rows.map((row) => (
            <tr key={row.name}>
              <td style={{ borderColor: gridBorder }}>{row.name}</td>
              <td className="text-right" style={{ borderColor: gridBorder }}>
                {row.qty}
              </td>
              <td className="text-right" style={{ borderColor: gridBorder }}>
                {row.unit}
              </td>
              <td className="text-right" style={{ borderColor: gridBorder }}>
                {row.unitPrice}
              </td>
              <td className="text-right" style={{ borderColor: gridBorder }}>
                {row.subtotal}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LegalFooterClassic({
  warranty,
  paymentTerms,
  technicalNotes,
}: {
  warranty: string;
  paymentTerms: string;
  technicalNotes?: string;
}) {
  const hasAny = [warranty, paymentTerms, technicalNotes].some((t) => (t ?? "").trim());
  return (
    <div className="mt-auto border-t border-slate-200 pt-2">
      <p className="mb-1 text-[6.5px] font-bold">
        Condições comerciais
      </p>
      {!hasAny ? (
        <p className="budget-preview-muted text-[6px] italic">Garantia e pagamento aparecerão aqui.</p>
      ) : (
        <div className="space-y-0.5 text-[6px]">
          {warranty.trim() ? (
            <p>
              <span className="font-semibold">Garantia: </span>
              {truncate(warranty, 140)}
            </p>
          ) : null}
          {paymentTerms.trim() ? (
            <p>
              <span className="font-semibold">Pagamento: </span>
              {truncate(paymentTerms, 140)}
            </p>
          ) : null}
          {technicalNotes?.trim() ? (
            <p>
              <span className="font-semibold">Observações: </span>
              {truncate(technicalNotes, 140)}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ConditionsSectionProfessional({
  warranty,
  paymentTerms,
  paymentMethod,
  observations,
  validityDays = 15,
}: {
  warranty: string;
  paymentTerms: string;
  paymentMethod?: string;
  observations?: string;
  validityDays?: number;
}) {
  const theme = TABLE_THEME.professional;
  return (
    <div className="mb-2">
      <p className="mb-1 text-[6.5px] font-bold">{theme.sections.conditions}</p>
      <div className="space-y-0.5 text-[6px]">
        <p>
          Validade da Proposta: {validityDays} dias a partir da data de emissão deste documento.
        </p>
        {warranty.trim() ? (
          <p>
            <span className="font-semibold">Garantia Técnica: </span>
            {truncate(warranty, 120)}
          </p>
        ) : (
          <p className="italic">Garantia técnica configurável nas definições.</p>
        )}
        {paymentMethod?.trim() ? (
          <p>
            <span className="font-semibold">Forma de Pagamento: </span>
            {truncate(paymentMethod, 120)}
          </p>
        ) : null}
        {paymentTerms.trim() ? (
          <p>
            <span className="font-semibold">Condições de Pagamento: </span>
            {truncate(paymentTerms, 120)}
          </p>
        ) : null}
        {observations?.trim() ? (
          <p>
            <span className="font-semibold">Observações: </span>
            {truncate(observations, 120)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function TemplateClassic({
  color,
  companyName,
  warranty,
  paymentTerms,
  technicalNotes,
}: {
  color: string;
  companyName: string;
  warranty: string;
  paymentTerms: string;
  technicalNotes?: string;
}) {
  const theme = TABLE_THEME.classic;
  const classicProducts: ClassicRow[] = SAMPLE.products.map((p) => ({
    name: p.name,
    qty: p.qty,
    price: p.unitPrice,
  }));
  const classicServices: ClassicRow[] = SAMPLE.services.map((s) => ({
    name: s.name,
    qty: s.qty,
    price: s.unitPrice,
  }));

  return (
    <>
      <div className="mb-2 grid grid-cols-[18%_1fr_26%] gap-1 border-b border-dashed border-slate-200 pb-2">
        <div
          className="flex aspect-square items-center justify-center rounded-full text-[7px] font-bold"
          style={{ backgroundColor: color }}
          aria-hidden
        >
          {companyName.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="text-[7px] font-bold">{companyName}</p>
          <p className="budget-preview-muted text-[6px]">CNPJ · Endereço · Contato</p>
        </div>
        <div className="text-right">
          <p className="budget-preview-muted text-[6px]">Data do orçamento</p>
          <p className="text-[6.5px] font-semibold">{SAMPLE.issueDate}</p>
        </div>
      </div>

      <div
        className="mb-2 rounded-sm px-2 py-1 text-[8px] font-bold"
        style={{ backgroundColor: color }}
      >
        Orçamento {SAMPLE.budgetCode}
      </div>

      <div className="mb-2">
        <p className="text-[6.5px] font-bold">Cliente</p>
        <p className="budget-preview-muted text-[6px]">
          {SAMPLE.client} · (11) 98765-4321
        </p>
      </div>

      <ItemsTableClassic title={theme.sectionTitles.services} rows={classicServices} color={color} />
      <ItemsTableClassic title={theme.sectionTitles.products} rows={classicProducts} color={color} />

      <div className="mb-2 flex justify-end">
        <span
          className="rounded-sm px-2 py-0.5 text-[6.5px] font-bold"
          style={{ backgroundColor: color }}
        >
          Total {SAMPLE.total}
        </span>
      </div>

      <LegalFooterClassic
        warranty={warranty}
        paymentTerms={paymentTerms}
        technicalNotes={technicalNotes}
      />

      <div className="mt-2 grid grid-cols-2 gap-3 pt-2">
        <div className="border-t border-slate-400 pt-1 text-center text-[5.5px]">
          <span className="block font-semibold">{truncate(companyName, 24)}</span>
          Técnico responsável
        </div>
        <div className="border-t border-slate-400 pt-1 text-center text-[5.5px]">
          <span className="block font-semibold">Cliente Exemplo</span>
          Cliente
        </div>
      </div>
    </>
  );
}

function TemplateProfessional({
  color,
  companyName,
  warranty,
  paymentTerms,
  paymentMethod,
  scopeText,
  technicalNotes,
  draft,
}: {
  color: string;
  companyName: string;
  warranty: string;
  paymentTerms: string;
  paymentMethod?: string;
  scopeText?: string;
  technicalNotes?: string;
  draft?: BudgetPreviewDraft;
}) {
  const theme = TABLE_THEME.professional;
  const scopeBullets = scopeText?.trim()
    ? scopeLinesFromText(scopeText)
    : SAMPLE.scopeBullets;
  const headerDivider = tintHex(color, theme.header.dividerTint);
  const products = draft?.products?.length ? draft.products : SAMPLE.products;
  const services = draft?.services?.length ? draft.services : SAMPLE.services;
  const clientName = draft?.clientName?.trim() || SAMPLE.client;

  return (
    <>
      <div className="mb-0 flex items-start justify-between gap-2 pb-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold leading-tight">
            {companyName}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[7px] font-bold">ORÇAMENTO nº {draft?.budgetCode ?? SAMPLE.budgetCode}</p>
          <p className="budget-preview-muted text-[5.5px]">
            Data de Emissão: {draft?.issueDate ?? SAMPLE.issueDate}
          </p>
        </div>
      </div>
      <hr className="mb-2 border-0" style={{ borderTop: `1px solid ${headerDivider}` }} />

      <div className="mb-2 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[5.5px] font-bold uppercase tracking-wide">
            {theme.partyLabels.client}
          </p>
          <p className="text-[6.5px] font-bold">{clientName}</p>
          <p className="budget-preview-muted text-[5.5px]">CNPJ: 00.000.000/0001-00</p>
          <p className="budget-preview-muted text-[5.5px]">Endereço do cliente</p>
          <p className="budget-preview-muted text-[5.5px]">Email · Tel</p>
        </div>
        <div>
          <p className="text-[5.5px] font-bold uppercase tracking-wide">
            {theme.partyLabels.provider}
          </p>
          <p className="text-[6.5px] font-bold">{companyName}</p>
          <p className="budget-preview-muted text-[5.5px]">CNPJ: 00.000.000/0001-00</p>
          <p className="budget-preview-muted text-[5.5px]">Endereço do prestador</p>
          <p className="budget-preview-muted text-[5.5px]">Email · Tel</p>
        </div>
      </div>

      <div className="mb-2">
        <p className="mb-0.5 text-[6.5px] font-bold">{theme.sections.scope}</p>
        {scopeBullets.length > 0 ? (
          <ul className="list-none space-y-0.5 pl-1 text-[5.5px]">
            {scopeBullets.map((line) => (
              <li key={line}>• {truncate(line, 80)}</li>
            ))}
          </ul>
        ) : (
          <p className="budget-preview-muted pl-1 text-[5.5px]">—</p>
        )}
      </div>

      {products.length > 0 ? (
        <ItemsTableProfessional
          sectionTitle={theme.sections.products}
          headerLabel={theme.sections.productsHeader}
          rows={products}
          color={color}
        />
      ) : null}
      {services.length > 0 ? (
        <ItemsTableProfessional
          sectionTitle={theme.sections.services}
          headerLabel={theme.sections.servicesHeader}
          rows={services}
          color={color}
        />
      ) : null}

      <div className="mb-2 space-y-0.5 text-right text-[5.5px]">
        {products.length > 0 ? (
          <p>
            {theme.subtotalLabels.products}:{" "}
            <span className="font-semibold">{draft?.productSubtotal ?? SAMPLE.productSubtotal}</span>
          </p>
        ) : null}
        {services.length > 0 ? (
          <p>
            {theme.subtotalLabels.services}:{" "}
            <span className="font-semibold">{draft?.serviceSubtotal ?? SAMPLE.serviceSubtotal}</span>
          </p>
        ) : null}
        <p className="text-[6.5px] font-bold">
          {theme.subtotalLabels.total}: {draft?.total ?? SAMPLE.total}
        </p>
      </div>

      <ConditionsSectionProfessional
        warranty={warranty}
        paymentTerms={paymentTerms}
        paymentMethod={paymentMethod}
        observations={technicalNotes}
        validityDays={draft?.validityDays ?? 15}
      />

      <div className="mt-auto grid grid-cols-2 gap-3 pt-3">
        <div className="border-t border-slate-500 pt-1 text-center text-[5px]">
          <span className="block font-semibold">{truncate(companyName, 22)}</span>
          Técnico Responsável
        </div>
        <div className="border-t border-slate-500 pt-1 text-center text-[5px]">
          <span className="block font-semibold">{truncate(clientName, 22)}</span>
          De Acordo / Assinatura do Cliente
        </div>
      </div>

      <p className="mt-1 text-right text-[4.5px]">Página 1 de 1</p>
    </>
  );
}

export function BudgetPreview({
  config,
  templateId,
  color,
  fontColor,
  warranty,
  paymentTerms,
  paymentMethod,
  scopeText,
  technicalNotes,
  draft,
}: BudgetPreviewProps) {
  const brandColor = useMemo(() => normalizeBrandColor(color, PDF_STYLES.defaultBrandColor), [color]);
  const resolvedFontColor = useMemo(
    () => normalizeFontColor(fontColor, PDF_STYLES.defaultFontColor),
    [fontColor],
  );
  const layoutKey = useMemo(() => normalizePreviewTemplateId(templateId), [templateId]);
  const companyName = config.companyName?.trim() || "Sua empresa";

  const contentSignature = useMemo(
    () =>
      JSON.stringify({
        layoutKey,
        brandColor,
        resolvedFontColor,
        warranty,
        paymentTerms,
        paymentMethod,
        draft,
        technical: config.technicalNotes ?? "",
        companyName,
      }),
    [
      layoutKey,
      brandColor,
      resolvedFontColor,
      warranty,
      paymentTerms,
      paymentMethod,
      draft,
      config.technicalNotes,
      companyName,
    ],
  );

  const [fadeIn, setFadeIn] = useState(true);

  useEffect(() => {
    setFadeIn(false);
    const id = window.setTimeout(() => setFadeIn(true), 40);
    return () => window.clearTimeout(id);
  }, [contentSignature]);

  const layoutProps = {
    color: brandColor,
    companyName,
    warranty,
    paymentTerms,
    paymentMethod,
    scopeText,
    technicalNotes: technicalNotes ?? config.technicalNotes,
    draft,
  };

  return (
    <div className="mx-auto w-full max-w-[340px]" aria-label="Pré-visualização do orçamento">
      <div className="rounded-xl bg-gradient-to-br from-slate-200 via-slate-50 to-slate-200 p-3">
        <div
          className="budget-preview-sheet rounded border border-slate-300 shadow-[0_12px_28px_rgba(15,23,42,0.12)]"
          style={{ aspectRatio: PDF_STYLES.page.aspectRatio, color: resolvedFontColor }}
        >
          <div
            className={`budget-preview-fade flex h-full flex-col ${fadeIn ? "opacity-100" : "opacity-50"}`}
            key={contentSignature}
          >
            {layoutKey === "professional" ? (
              <TemplateProfessional {...layoutProps} />
            ) : (
              <TemplateClassic {...layoutProps} />
            )}
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[0.7rem] tracking-wide text-slate-500">
        Pré-visualização (proporção A4 · modelo {layoutKey === "professional" ? "2" : "1"})
      </p>
    </div>
  );
}
