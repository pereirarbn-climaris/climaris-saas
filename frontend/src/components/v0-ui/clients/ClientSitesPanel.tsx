import { useCallback, useEffect, useState } from "react";
import {
  createClientSite,
  deleteClientSite,
  listClientSites,
  type ClientSiteOut,
  type ClientSitePayload,
} from "../../../api/clients";
import { fetchCepLookup } from "../../../api/cep";
import { Button } from "../../ui/button";
import { digitsOnly, formatCepInput, formatPhoneBrInput } from "../../../lib/brMask";
import { StreetAddressLookupInput } from "./StreetAddressLookupInput";
import panelStyles from "./client-sites-panel.module.css";

type Props = {
  clientId: number;
  readOnly?: boolean;
  nearCity?: string;
  nearState?: string;
  /** Dispara após criar/excluir unidade (atualizar equipamentos e selects). */
  onSitesChanged?: () => void;
  /** Abre o cadastro de equipamento com a obra já selecionada. */
  onAddEquipmentForSite?: (siteId: number) => void;
};

const emptyForm = (): ClientSitePayload => ({
  name: "",
  contact_name: "",
  phone: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  cep: "",
});

function PanelToggle({
  checked,
  onChange,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      id={id}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        display: "inline-flex",
        height: 24,
        width: 44,
        flexShrink: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        borderRadius: 9999,
        border: "2px solid transparent",
        backgroundColor: checked ? "var(--color-primary, #2563eb)" : "#e2e8f0",
        opacity: disabled ? 0.55 : 1,
        transition: "background-color 0.2s ease",
      }}
    >
      <span
        style={{
          pointerEvents: "none",
          display: "inline-block",
          height: 20,
          width: 20,
          borderRadius: "50%",
          backgroundColor: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transform: checked ? "translateX(20px)" : "translateX(0)",
          transition: "transform 0.2s ease",
        }}
      />
    </button>
  );
}


export function ClientSitesPanel({ clientId, readOnly, nearCity, nearState, onSitesChanged, onAddEquipmentForSite }: Props) {
  const [sites, setSites] = useState<ClientSiteOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState<ClientSitePayload>(emptyForm);
  const [hasMultipleSites, setHasMultipleSites] = useState(false);
  const [isAddingSite, setIsAddingSite] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  const onBuscarCepSite = async () => {
    const digits = digitsOnly(form.cep ?? "");
    if (digits.length !== 8) {
      setErr("Informe um CEP válido com 8 dígitos.");
      return;
    }
    setCepLoading(true);
    setErr("");
    try {
      const data = await fetchCepLookup(digits);
      setForm((f) => ({
        ...f,
        street: data.address_street ?? f.street,
        neighborhood: data.address_district ?? f.neighborhood,
        complement: data.address_complement ?? f.complement,
        city: data.address_city ?? f.city,
        state: data.address_state ?? f.state,
        cep: data.cep ? formatCepInput(data.cep) : f.cep,
      }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível buscar o CEP.");
    } finally {
      setCepLoading(false);
    }
  };

  const reload = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const rows = await listClientSites(clientId);
      setSites(rows);
      if (rows.length > 0) {
        setHasMultipleSites(true);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar filiais/obras.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const closeAddForm = () => {
    setIsAddingSite(false);
    setForm(emptyForm());
  };

  const onAdd = async () => {
    if (readOnly || !form.name.trim()) return;
    setSaving(true);
    setErr("");
    try {
      await createClientSite(clientId, {
        ...form,
        phone: digitsOnly(form.phone ?? "") || undefined,
        contact_name: form.contact_name?.trim() || undefined,
        complement: form.complement?.trim() || undefined,
      });
      setForm(emptyForm());
      setIsAddingSite(false);
      setHasMultipleSites(true);
      await reload();
      onSitesChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao cadastrar filial/obra.");
    } finally {
      setSaving(false);
    }
  };

  const onRemove = async (siteId: number, label: string) => {
    if (readOnly) return;
    if (!window.confirm(`Excluir a unidade "${label}"? Equipamentos vinculados ficarão sem filial.`)) return;
    setSaving(true);
    setErr("");
    try {
      await deleteClientSite(clientId, siteId);
      await reload();
      onSitesChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao excluir filial/obra.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem", fontWeight: 600 }}>Filiais / obras</h3>

      <label
        htmlFor="client-has-multiple-sites"
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "0.75rem",
          marginBottom: "1rem",
          cursor: readOnly ? "default" : "pointer",
        }}
      >
        <PanelToggle
          id="client-has-multiple-sites"
          checked={hasMultipleSites}
          onChange={setHasMultipleSites}
          disabled={readOnly}
        />
        <span style={{ fontSize: "0.875rem", lineHeight: 1.45, color: "var(--color-text)" }}>
          Este cliente possui filiais, sub-unidades ou obras espalhadas?
        </span>
      </label>

      {err ? <p style={{ color: "var(--color-danger, #c00)", fontSize: "0.875rem" }}>{err}</p> : null}

      {hasMultipleSites ? (
        <>
          <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
            Cadastre unidades com endereço próprio para vincular equipamentos a filiais ou obras.
          </p>
          {loading ? <p style={{ fontSize: "0.875rem" }}>Carregando…</p> : null}
          {!loading && sites.length === 0 && !isAddingSite ? (
            <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginBottom: "1rem" }}>
              Nenhuma filial ou obra cadastrada ainda. Use o botão abaixo para cadastrar a primeira unidade.
            </p>
          ) : null}
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "0 0 1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            {sites.map((s) => (
              <li
                key={s.id}
                style={{
                  border: "1px solid var(--color-border, #e5e7eb)",
                  borderRadius: 8,
                  padding: "0.75rem 1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "1rem",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong>{s.name}</strong>
                  {s.contact_name ? (
                    <div style={{ fontSize: "0.8125rem", marginTop: 2 }}>Contato: {s.contact_name}</div>
                  ) : null}
                  {s.phone ? (
                    <div style={{ fontSize: "0.8125rem" }}>Tel.: {formatPhoneBrInput(s.phone)}</div>
                  ) : null}
                  <div style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginTop: 4 }}>
                    {[s.street, s.number, s.complement, s.neighborhood, s.city, s.state].filter(Boolean).join(" — ")}
                    {s.cep ? ` · CEP ${formatCepInput(s.cep)}` : ""}
                  </div>
                </div>
                {!readOnly ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: "0.5rem",
                      flexShrink: 0,
                      flexWrap: "wrap",
                    }}
                  >
                    {onAddEquipmentForSite ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onAddEquipmentForSite(s.id)}
                      >
                        + Adicionar Equipamento
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => void onRemove(s.id, s.name)}
                      disabled={saving}
                    >
                      Excluir
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>

          {!readOnly ? (
            <>
              {!isAddingSite ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setIsAddingSite(true)}>
                  + Cadastrar Nova Obra / Filial
                </Button>
              ) : (
                <div className={panelStyles.formCard} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0.5rem", alignItems: "end" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
                    <span className={panelStyles.fieldLabel}>Nome da unidade *</span>
                    <input
                      className={panelStyles.fieldInput}
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Ex.: Obra Centro, Filial SP"
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className={panelStyles.fieldLabel}>Nome do contato</span>
                    <input
                      className={panelStyles.fieldInput}
                      value={form.contact_name ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                      placeholder="Pessoa de contato na unidade"
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className={panelStyles.fieldLabel}>Telefone</span>
                    <input
                      className={panelStyles.fieldInput}
                      value={form.phone ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, phone: formatPhoneBrInput(e.target.value) }))}
                      placeholder="(00) 0000-0000"
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
                    <span className={panelStyles.fieldLabel}>CEP</span>
                    <div className={panelStyles.cepRow}>
                      <input
                        className={`${panelStyles.fieldInput} ${panelStyles.cepInput}`}
                        value={form.cep ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, cep: formatCepInput(e.target.value) }))}
                        placeholder="00000-000"
                        inputMode="numeric"
                        autoComplete="postal-code"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void onBuscarCepSite()}
                        disabled={cepLoading}
                      >
                        {cepLoading ? "…" : "Buscar CEP"}
                      </Button>
                    </div>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
                    <span className={panelStyles.fieldLabel}>Logradouro</span>
                    <StreetAddressLookupInput
                      value={form.street ?? ""}
                      onChange={(street) => setForm((f) => ({ ...f, street }))}
                      city={form.city ?? ""}
                      state={form.state ?? ""}
                      nearCity={nearCity}
                      nearState={nearState}
                      className={panelStyles.fieldInput}
                      onSelect={(sel) =>
                        setForm((f) => ({
                          ...f,
                          street: sel.street || f.street,
                          neighborhood: sel.district || f.neighborhood,
                          complement: sel.complement || f.complement,
                          city: sel.city || f.city,
                          state: sel.state || f.state,
                          cep: sel.cep ? formatCepInput(sel.cep) : f.cep,
                        }))
                      }
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className={panelStyles.fieldLabel}>Número</span>
                    <input
                      className={panelStyles.fieldInput}
                      value={form.number ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className={panelStyles.fieldLabel}>Complemento</span>
                    <input
                      className={panelStyles.fieldInput}
                      value={form.complement ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, complement: e.target.value }))}
                      placeholder="Apt, sala, bloco…"
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className={panelStyles.fieldLabel}>Bairro</span>
                    <input
                      className={panelStyles.fieldInput}
                      value={form.neighborhood ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, neighborhood: e.target.value }))}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className={panelStyles.fieldLabel}>Cidade</span>
                    <input
                      className={panelStyles.fieldInput}
                      value={form.city ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className={panelStyles.fieldLabel}>UF</span>
                    <input
                      className={panelStyles.fieldInput}
                      maxLength={2}
                      value={form.state ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, state: e.target.value.toUpperCase() }))}
                    />
                  </label>
                  <div
                    style={{
                      gridColumn: "1 / -1",
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                      marginTop: "0.25rem",
                    }}
                  >
                    <Button type="button" variant="outline" size="sm" onClick={closeAddForm} disabled={saving}>
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={() => void onAdd()}
                      disabled={saving || !form.name.trim()}
                    >
                      {saving ? "Salvando…" : "Adicionar unidade"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
