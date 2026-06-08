import React, { useCallback, useMemo } from "react";
import type { ProductOut } from "../../../api/products";
import type { ServiceOut } from "../../../api/services";
import { CatalogCombobox } from "../../../components/ui/catalog-combobox";
import { sortByNameAsc } from "../../../lib/localeSort";
import { formatEstimatedDuration } from "../../../lib/serviceOrderEstimatedTime";
import {
  defaultUnitPriceForProduct,
  defaultUnitPriceForService,
  newLocalId,
  linkServicesToAllSelectedEquipment,
  toggleServiceOnEquipment,
} from "../../../lib/serviceOrderLinesSync";
import type { Equipamento, ProductLineDraft, ServiceLineDraft } from "./ServiceOrderFormView";

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: "var(--font-size-xs)",
  fontWeight: 600,
  color: "var(--color-text-muted)",
  padding: "0.5rem 0.65rem",
  borderBottom: "1px solid var(--color-border)",
};

const tdStyle: React.CSSProperties = {
  padding: "0.45rem 0.65rem",
  borderBottom: "1px solid var(--color-border)",
  verticalAlign: "middle",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: "4.5rem",
  height: "2.25rem",
  padding: "0 0.5rem",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--input-radius)",
  fontSize: "var(--font-size-sm)",
};

export interface ServiceOrderLineSectionsProps {
  servicos: ServiceLineDraft[];
  pecas: ProductLineDraft[];
  onServicosChange: (lines: ServiceLineDraft[]) => void;
  onPecasChange: (lines: ProductLineDraft[]) => void;
  servicesCatalog: ServiceOut[];
  productsCatalog: ProductOut[];
  canEditLines: boolean;
  /** OS concluída: bloqueia add/remove e edição de qtd/preço; mantém vínculo com equipamentos. */
  readOnly?: boolean;
  /** Exibe seção de peças/insumos do estoque (desligado quando o tenant não controla estoque). */
  showProductLines?: boolean;
  equipamentosCliente: Equipamento[];
  equipamentosIds: string[];
}

export function ServiceOrderLineSections({
  servicos = [],
  pecas = [],
  onServicosChange,
  onPecasChange,
  servicesCatalog = [],
  productsCatalog = [],
  canEditLines,
  readOnly = false,
  showProductLines = true,
  equipamentosCliente = [],
  equipamentosIds = [],
}: ServiceOrderLineSectionsProps) {
  const canEditLineFields = canEditLines && !readOnly;
  const canEditEquipmentLinks = canEditLines;

  const activeServices = useMemo(
    () => sortByNameAsc(servicesCatalog.filter((s) => s.is_active)),
    [servicesCatalog],
  );
  const durationByServiceId = useMemo(
    () => new Map(activeServices.map((s) => [String(s.id), s.duration_minutes ?? 0])),
    [activeServices],
  );
  const activeProducts = useMemo(
    () => sortByNameAsc(productsCatalog.filter((p) => p.is_active)),
    [productsCatalog],
  );

  const serviceComboboxItems = useMemo(
    () => activeServices.map((s) => ({ id: String(s.id), name: s.name })),
    [activeServices],
  );
  const productComboboxItems = useMemo(
    () => activeProducts.map((p) => ({ id: String(p.id), name: p.name })),
    [activeProducts],
  );

  const selectedEquipments = useMemo(
    () => equipamentosCliente.filter((e) => equipamentosIds.includes(e.id)),
    [equipamentosCliente, equipamentosIds],
  );

  const addServiceById = useCallback(
    (id: string) => {
      if (!id) return;
      const svc = activeServices.find((s) => String(s.id) === id);
      onServicosChange([
        ...servicos,
        {
          localId: newLocalId(),
          serviceId: id,
          label: svc?.name ?? `Serviço #${id}`,
          quantity: 1,
          unitPrice: defaultUnitPriceForService(id, activeServices),
          equipmentIds: [],
        },
      ]);
    },
    [activeServices, onServicosChange, servicos],
  );

  const addProductById = useCallback(
    (id: string) => {
      if (!id) return;
      const prd = activeProducts.find((p) => String(p.id) === id);
      onPecasChange([
        ...pecas,
        {
          localId: newLocalId(),
          productId: id,
          label: prd?.name ?? `Produto #${id}`,
          quantity: 1,
          unitPrice: defaultUnitPriceForProduct(id, activeProducts),
        },
      ]);
    },
    [activeProducts, onPecasChange, pecas],
  );

  return (
    <>
      <section
        style={{
          backgroundColor: "var(--color-surface-elevated)",
          borderRadius: "var(--card-radius)",
          padding: "var(--card-padding-lg)",
          boxShadow: "var(--card-shadow)",
        }}
      >
        <h3 style={{ margin: "0 0 0.35rem", fontSize: "var(--font-size-lg)" }}>Serviços solicitados</h3>
        <p style={{ margin: "0 0 1rem", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
          Itens do catálogo de serviços com quantidade e preço unitário editáveis.
        </p>

        {canEditLineFields ? (
          <CatalogCombobox
            id="os-add-service"
            items={serviceComboboxItems}
            onPick={addServiceById}
            placeholder="Adicionar serviço do catálogo…"
            searchPlaceholder="Pesquisar serviço…"
            emptyMessage="Nenhum serviço encontrado."
          />
        ) : null}

        <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-sm)" }}>
            <thead>
              <tr>
                <th style={thStyle}>Serviço</th>
                <th style={{ ...thStyle, width: "5.5rem" }}>Qtd.</th>
                <th style={{ ...thStyle, width: "6.5rem" }}>Tempo est.</th>
                <th style={{ ...thStyle, width: "7.5rem" }}>Preço un.</th>
                <th style={{ ...thStyle, width: "7rem" }}>Subtotal</th>
                {canEditLineFields ? <th style={{ ...thStyle, width: "3rem" }} /> : null}
              </tr>
            </thead>
            <tbody>
              {servicos.length === 0 ? (
                <tr>
                  <td colSpan={canEditLineFields ? 6 : 5} style={{ ...tdStyle, color: "var(--color-text-muted)" }}>
                    Nenhum serviço adicionado.
                  </td>
                </tr>
              ) : (
                servicos.map((line) => {
                  const sub = Math.max(line.quantity, 1) * Math.max(0, line.unitPrice);
                  const perUnitMin = Math.max(durationByServiceId.get(line.serviceId) ?? 0, 1);
                  const lineMinutes = Math.max(line.quantity, 1) * perUnitMin;
                  return (
                    <tr key={line.localId}>
                      <td style={tdStyle}>{line.label}</td>
                      <td style={tdStyle}>
                        {canEditLineFields ? (
                          <input
                            type="number"
                            min={1}
                            step={1}
                            style={inputStyle}
                            value={line.quantity}
                            onChange={(e) =>
                              onServicosChange(
                                servicos.map((l) =>
                                  l.localId === line.localId
                                    ? { ...l, quantity: Math.max(1, Number(e.target.value) || 1) }
                                    : l,
                                ),
                              )
                            }
                          />
                        ) : readOnly && canEditLines ? (
                          <input
                            type="number"
                            style={{ ...inputStyle, opacity: 0.85 }}
                            value={line.quantity}
                            disabled
                            readOnly
                          />
                        ) : (
                          line.quantity
                        )}
                      </td>
                      <td style={{ ...tdStyle, color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>
                        {formatEstimatedDuration(lineMinutes)}
                      </td>
                      <td style={tdStyle}>
                        {canEditLineFields ? (
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            style={inputStyle}
                            value={line.unitPrice}
                            onChange={(e) =>
                              onServicosChange(
                                servicos.map((l) =>
                                  l.localId === line.localId
                                    ? { ...l, unitPrice: Math.max(0, Number(e.target.value) || 0) }
                                    : l,
                                ),
                              )
                            }
                          />
                        ) : readOnly && canEditLines ? (
                          <input
                            type="text"
                            style={{ ...inputStyle, opacity: 0.85 }}
                            value={formatCurrency(line.unitPrice)}
                            disabled
                            readOnly
                          />
                        ) : (
                          formatCurrency(line.unitPrice)
                        )}
                      </td>
                      <td style={tdStyle}>{formatCurrency(sub)}</td>
                      {canEditLineFields ? (
                        <td style={tdStyle}>
                          <button
                            type="button"
                            title="Remover"
                            onClick={() => onServicosChange(servicos.filter((l) => l.localId !== line.localId))}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "var(--color-error)",
                              cursor: "pointer",
                              fontSize: "1.1rem",
                            }}
                          >
                            ×
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <TotalRow
          label="Total mão de obra"
          value={servicos.reduce((s, l) => s + Math.max(l.quantity, 1) * Math.max(0, l.unitPrice), 0)}
        />
      </section>

      {showProductLines ? (
        <section
          style={{
            backgroundColor: "var(--color-surface-elevated)",
            borderRadius: "var(--card-radius)",
            padding: "var(--card-padding-lg)",
            boxShadow: "var(--card-shadow)",
          }}
        >
          <h3 style={{ margin: "0 0 0.35rem", fontSize: "var(--font-size-lg)" }}>Peças / insumos utilizados</h3>
          <p style={{ margin: "0 0 1rem", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
            Produtos do estoque consumidos nesta ordem de serviço.
          </p>

          {canEditLineFields ? (
            <CatalogCombobox
              id="os-add-product"
              items={productComboboxItems}
              onPick={addProductById}
              placeholder="Adicionar produto do estoque…"
              searchPlaceholder="Pesquisar produto…"
              emptyMessage="Nenhum produto encontrado."
            />
          ) : null}

          <ProductTable
            pecas={pecas}
            canEditLineFields={canEditLineFields}
            readOnly={readOnly}
            onPecasChange={onPecasChange}
            formatCurrency={formatCurrency}
            inputStyle={inputStyle}
            thStyle={thStyle}
            tdStyle={tdStyle}
          />
          <TotalRow
            label="Total peças"
            value={pecas.reduce((s, l) => s + Math.max(l.quantity, 1) * Math.max(0, l.unitPrice), 0)}
          />
        </section>
      ) : null}

      <section
        style={{
          backgroundColor: "var(--color-surface-elevated)",
          borderRadius: "var(--card-radius)",
          padding: "var(--card-padding-lg)",
          boxShadow: "var(--card-shadow)",
        }}
      >
        <h3 style={{ margin: "0 0 0.35rem", fontSize: "var(--font-size-lg)" }}>Serviços por equipamento</h3>
        <p style={{ margin: "0 0 1rem", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
          {selectedEquipments.length > 0
            ? "Marque em quais aparelhos cada linha de serviço foi executada. A quantidade do serviço aumenta automaticamente conforme você vincula aparelhos."
            : "Opcional: selecione equipamentos na seção acima para vincular serviços a aparelhos específicos."}
        </p>
        {selectedEquipments.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: "1rem",
              textAlign: "center",
              color: "var(--color-text-muted)",
              fontSize: "var(--font-size-sm)",
              background: "var(--color-surface)",
              borderRadius: "var(--input-radius)",
              border: "1px dashed var(--color-border)",
            }}
          >
            Nenhum equipamento selecionado nesta OS. A ordem pode ser salva assim (ex.: visita de orçamento ou
            cadastro dos aparelhos depois).
          </p>
        ) : servicos.length === 0 ? (
          <p style={{ margin: 0, fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
            Adicione serviços solicitados para vinculá-los aos equipamentos.
          </p>
        ) : (
          <>
            {canEditEquipmentLinks && selectedEquipments.length > 1 ? (
              <div style={{ marginBottom: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() =>
                    onServicosChange(linkServicesToAllSelectedEquipment(servicos, equipamentosIds))
                  }
                  style={{
                    height: "2.25rem",
                    padding: "0 0.85rem",
                    borderRadius: "var(--btn-radius)",
                    border: "1px solid var(--color-primary)",
                    background: "#fff",
                    color: "var(--color-primary)",
                    fontWeight: 600,
                    fontSize: "var(--font-size-sm)",
                    cursor: "pointer",
                  }}
                >
                  Marcar serviço em todos os {selectedEquipments.length} equipamentos selecionados
                </button>
              </div>
            ) : null}
            <EquipmentGrid
              equipments={selectedEquipments}
              servicos={servicos}
              canEditEquipmentLinks={canEditEquipmentLinks}
              onToggle={(equipmentId, lineLocalId, checked) =>
                onServicosChange(toggleServiceOnEquipment(servicos, equipmentId, lineLocalId, checked))
              }
            />
          </>
        )}
      </section>
    </>
  );
}


function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <p style={{ textAlign: "right", margin: "0.75rem 0 0", fontWeight: 600, fontSize: "var(--font-size-sm)" }}>
      {label}: {formatCurrency(value)}
    </p>
  );
}

function ProductTable(props: {
  pecas: ProductLineDraft[];
  canEditLineFields: boolean;
  readOnly: boolean;
  onPecasChange: (lines: ProductLineDraft[]) => void;
  formatCurrency: (n: number) => string;
  inputStyle: React.CSSProperties;
  thStyle: React.CSSProperties;
  tdStyle: React.CSSProperties;
}) {
  const { pecas, canEditLineFields, readOnly, onPecasChange, formatCurrency, inputStyle, thStyle, tdStyle } = props;
  return (
    <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-sm)" }}>
        <thead>
          <tr>
            <th style={thStyle}>Produto</th>
            <th style={{ ...thStyle, width: "5.5rem" }}>Qtd.</th>
            <th style={{ ...thStyle, width: "7.5rem" }}>Preço un.</th>
            <th style={{ ...thStyle, width: "7rem" }}>Subtotal</th>
            {canEditLineFields ? <th style={{ ...thStyle, width: "3rem" }} /> : null}
          </tr>
        </thead>
        <tbody>
          {pecas.length === 0 ? (
            <tr>
              <td colSpan={canEditLineFields ? 5 : 4} style={{ ...tdStyle, color: "var(--color-text-muted)" }}>
                Nenhuma peça adicionada.
              </td>
            </tr>
          ) : (
            pecas.map((line) => {
              const sub = Math.max(line.quantity, 1) * Math.max(0, line.unitPrice);
              return (
                <tr key={line.localId}>
                  <td style={tdStyle}>{line.label}</td>
                  <td style={tdStyle}>
                    {canEditLineFields ? (
                      <input
                        type="number"
                        min={1}
                        step={1}
                        style={inputStyle}
                        value={line.quantity}
                        onChange={(e) =>
                          onPecasChange(
                            pecas.map((l) =>
                              l.localId === line.localId
                                ? { ...l, quantity: Math.max(1, Number(e.target.value) || 1) }
                                : l,
                            ),
                          )
                        }
                      />
                    ) : readOnly ? (
                      <input
                        type="number"
                        style={{ ...inputStyle, opacity: 0.85 }}
                        value={line.quantity}
                        disabled
                        readOnly
                      />
                    ) : (
                      line.quantity
                    )}
                  </td>
                  <td style={tdStyle}>
                    {canEditLineFields ? (
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        style={inputStyle}
                        value={line.unitPrice}
                        onChange={(e) =>
                          onPecasChange(
                            pecas.map((l) =>
                              l.localId === line.localId
                                ? { ...l, unitPrice: Math.max(0, Number(e.target.value) || 0) }
                                : l,
                            ),
                          )
                        }
                      />
                    ) : readOnly ? (
                      <input
                        type="text"
                        style={{ ...inputStyle, opacity: 0.85 }}
                        value={formatCurrency(line.unitPrice)}
                        disabled
                        readOnly
                      />
                    ) : (
                      formatCurrency(line.unitPrice)
                    )}
                  </td>
                  <td style={tdStyle}>{formatCurrency(sub)}</td>
                  {canEditLineFields ? (
                    <td style={tdStyle}>
                      <button
                        type="button"
                        title="Remover"
                        onClick={() => onPecasChange(pecas.filter((l) => l.localId !== line.localId))}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "var(--color-error)",
                          cursor: "pointer",
                          fontSize: "1.1rem",
                        }}
                      >
                        ×
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function EquipmentGrid(props: {
  equipments: Equipamento[];
  servicos: ServiceLineDraft[];
  canEditEquipmentLinks: boolean;
  onToggle: (equipmentId: string, lineLocalId: string, checked: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {props.equipments.map((eq) => (
        <div
          key={eq.id}
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "var(--card-radius)",
            padding: "0.85rem 1rem",
          }}
        >
          <p style={{ margin: "0 0 0.5rem", fontWeight: 600 }}>
            {eq.marca} {eq.modelo}
            {eq.tag ? ` · ${eq.tag}` : ""}
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            {props.servicos.map((line) => {
              const ids = line.equipmentIds?.length
                ? line.equipmentIds
                : line.equipmentId
                  ? [line.equipmentId]
                  : [];
              const checked = ids.includes(eq.id);
              return (
                <li key={`${eq.id}_${line.localId}`}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: props.canEditEquipmentLinks ? "pointer" : "default" }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!props.canEditEquipmentLinks}
                      onChange={(e) => props.onToggle(eq.id, line.localId, e.target.checked)}
                    />
                    <span style={{ fontSize: "var(--font-size-sm)" }}>{line.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
