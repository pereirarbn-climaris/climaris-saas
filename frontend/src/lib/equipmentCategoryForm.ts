export type CapacityFieldMeta = {
  label: string;
  placeholder: string;
};

type CategoryNameRef = { name: string } | null;

/** Rótulo e placeholder do campo de capacidade conforme o nome da categoria. */
export function getCapacityFieldMeta(category: CategoryNameRef): CapacityFieldMeta {
  if (!category) {
    return { label: "Capacidade *", placeholder: "Informe a capacidade do equipamento" };
  }
  const n = category.name.toLowerCase();
  if (n.includes("climatizador")) {
    return { label: "Vazão (m³/h) *", placeholder: "Ex: 1200 m³/h, 2500 m³/h" };
  }
  if (n.includes("geladeira")) {
    return { label: "Capacidade (Litros) *", placeholder: "Ex: 350 L, 450 Litros" };
  }
  if (n.includes("bebedouro")) {
    return { label: "Capacidade (Litros) *", placeholder: "Ex: 20 L, 30 Litros" };
  }
  if (n.includes("ar-condicionado") || n.includes("split")) {
    return { label: "Capacidade (BTUs) *", placeholder: "Ex: 9000 BTUs, 12000 BTUs" };
  }
  return { label: "Capacidade *", placeholder: "Ex: conforme especificação do fabricante" };
}

export function isSplitCategoryName(name: string): boolean {
  return /ar-condicionado|climatizador|split/i.test(name);
}
