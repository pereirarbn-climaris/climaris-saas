import { useEffect, useRef, useState } from "react";
import { fetchCepStreetSearch, type CepStreetMatch } from "../../../api/cep";
import styles from "./street-address-lookup.module.css";

export type StreetLookupSelection = {
  cep: string;
  street: string;
  district: string;
  city: string;
  state: string;
  complement?: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (selection: StreetLookupSelection) => void;
  city?: string;
  state?: string;
  /** Endereço principal do cliente — usado para priorizar cidades mais próximas. */
  nearCity?: string;
  nearState?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
};

function matchKey(m: CepStreetMatch): string {
  return [m.cep, m.address_street, m.address_district, m.address_city, m.address_state].join("|");
}

function formatMatchLabel(m: CepStreetMatch): { main: string; meta: string } {
  const main = m.address_street ?? "";
  const metaParts = [
    m.address_district,
    m.address_city && m.address_state ? `${m.address_city} / ${m.address_state}` : m.address_city || m.address_state,
    m.cep,
  ].filter(Boolean);
  return { main, meta: metaParts.join(" · ") };
}

export function StreetAddressLookupInput({
  value,
  onChange,
  onSelect,
  city = "",
  state = "",
  nearCity = "",
  nearState = "",
  disabled,
  className,
  style,
  placeholder = "Digite o logradouro (mín. 3 letras)",
}: Props) {
  const [matches, setMatches] = useState<CepStreetMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState("");
  const [resultMeta, setResultMeta] = useState<{ total: number; truncated: boolean } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const uf = state.trim().toUpperCase().slice(0, 2);
    const cityName = city.trim();
    const term = value.trim();
    if (disabled || term.length < 3) {
      setMatches([]);
      setOpen(false);
      setResultMeta(null);
      setHint(term.length > 0 && term.length < 3 ? "Digite ao menos 3 letras do logradouro." : "");
      return;
    }

    const timer = window.setTimeout(() => {
      setLoading(true);
      setHint("");
      const biasUf = nearState.trim().toUpperCase().slice(0, 2) || undefined;
      const biasCity = nearCity.trim() || undefined;
      void fetchCepStreetSearch(term, {
        uf: uf || undefined,
        city: cityName || undefined,
        nearUf: biasUf,
        nearCity: biasCity,
      })
        .then((res) => {
          setMatches(res.matches);
          setOpen(res.matches.length > 0);
          setResultMeta({ total: res.total_found, truncated: res.truncated });
          if (res.matches.length === 0) {
            setHint("Nenhum endereço encontrado.");
          } else if (res.truncated) {
            setHint(`Mostrando ${res.matches.length} de ${res.total_found} — digite mais letras para refinar.`);
          } else {
            setHint("");
          }
        })
        .catch((e) => {
          setMatches([]);
          setOpen(false);
          setResultMeta(null);
          setHint(e instanceof Error ? e.message : "Busca indisponível.");
        })
        .finally(() => setLoading(false));
    }, 450);

    return () => window.clearTimeout(timer);
  }, [value, city, state, nearCity, nearState, disabled]);

  useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      if (!wrapRef.current?.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const inputClassName = className ? `${styles.input} ${className}` : styles.input;

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <input
        type="text"
        className={inputClassName}
        style={style}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => matches.length > 0 && setOpen(true)}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
      />
      {loading ? <span className={styles.hint}>Buscando…</span> : hint ? <span className={styles.hint}>{hint}</span> : null}
      {open && matches.length > 0 ? (
        <ul className={styles.list}>
          {matches.map((m) => {
            const { main, meta } = formatMatchLabel(m);
            return (
              <li key={matchKey(m)}>
                <button
                  type="button"
                  className={styles.listItemBtn}
                  onClick={() => {
                    onSelect({
                      cep: m.cep,
                      street: m.address_street ?? "",
                      district: m.address_district ?? "",
                      city: m.address_city ?? city,
                      state: m.address_state ?? state,
                      complement: m.address_complement ?? undefined,
                    });
                    setOpen(false);
                  }}
                >
                  <div className={styles.listItemMain}>{main}</div>
                  {meta ? <div className={styles.listItemMeta}>{meta}</div> : null}
                </button>
              </li>
            );
          })}
          {resultMeta?.truncated ? (
            <li className={styles.listFooter}>
              {resultMeta.total} endereços encontrados — priorizando região do cliente
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
