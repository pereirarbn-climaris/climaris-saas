import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { completeTenantFiscal, fetchCurrentTenant, fetchCurrentUser, type FiscalTaxIdKind } from "../api/auth";
import { isPlatformOperatorUser } from "../lib/platformAdmin";
import { fetchCnpjRegisterLookup, type CnpjLookupResult } from "../api/cnpj";
import { digitsOnly, formatTaxDocumentInput, taxDocumentOnKindChange } from "../lib/brMask";
import { clearAccessToken, getAccessToken } from "../lib/authStorage";
import styles from "./LoginPage.module.css";

const LOOKUP_DEBOUNCE_MS = 480;

export function CompleteRegistrationPage() {
  const navigate = useNavigate();
  const [taxIdKind, setTaxIdKind] = useState<FiscalTaxIdKind>("cnpj");
  const [document, setDocument] = useState("");
  const [cnpjLookupLoading, setCnpjLookupLoading] = useState(false);
  const [cnpjAlreadyRegistered, setCnpjAlreadyRegistered] = useState(false);
  const lookupGen = useRef(0);
  const [message, setMessage] = useState<{ text: string; kind: "idle" | "success" | "error" }>({
    text: "",
    kind: "idle",
  });
  const [submitting, setSubmitting] = useState(false);
  const [cnpjDetails, setCnpjDetails] = useState<CnpjLookupResult | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      navigate("/login", { replace: true });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const u = await fetchCurrentUser();
        if (cancelled) return;
        if (isPlatformOperatorUser(u)) {
          navigate("/operacao", { replace: true });
          return;
        }
        const tenant = await fetchCurrentTenant();
        if (cancelled) return;
        if (tenant.registration_complete) {
          navigate("/app", { replace: true });
        }
      } catch {
        if (!cancelled) {
          clearAccessToken();
          navigate("/login", { replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (taxIdKind !== "cnpj") {
      setCnpjLookupLoading(false);
      setCnpjAlreadyRegistered(false);
      return;
    }
    const d = digitsOnly(document);
    if (d.length !== 14) {
      setCnpjLookupLoading(false);
      setCnpjAlreadyRegistered(false);
      setCnpjDetails(null);
      if (d.length < 14) {
        setMessage((m) => (m.kind === "success" ? { text: "", kind: "idle" } : m));
      }
      return;
    }

    const gen = ++lookupGen.current;
    setCnpjLookupLoading(true);
    setMessage({ text: "", kind: "idle" });

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const data = await fetchCnpjRegisterLookup(d);
          if (gen !== lookupGen.current) return;

          if (data.already_registered) {
            setCnpjAlreadyRegistered(true);
            setCnpjDetails(null);
            setMessage({
              text: "Este CNPJ já possui conta na Climaris. Use outro documento ou fale com o suporte.",
              kind: "error",
            });
            return;
          }

          if (data.external_unavailable) {
            setCnpjAlreadyRegistered(false);
            setCnpjDetails(null);
            setMessage({
              text:
                data.lookup_hint ??
                "Não foi possível buscar a razão social agora. Você pode continuar com o documento informado.",
              kind: "idle",
            });
            return;
          }

          setCnpjAlreadyRegistered(false);
          const lu = data.lookup;
          if (lu) {
            setCnpjDetails(lu);
            const extra = [
              lu.trade_name && lu.trade_name !== lu.company_name ? `Fantasia: ${lu.trade_name}` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            setMessage({
              text: extra ? `Dados encontrados. ${extra}` : "Dados da Receita carregados.",
              kind: "success",
            });
          } else {
            setCnpjDetails(null);
          }
        } catch (err) {
          if (gen !== lookupGen.current) return;
          setCnpjAlreadyRegistered(false);
          setCnpjDetails(null);
          const text = err instanceof Error ? err.message : "Falha na consulta.";
          setMessage({ text, kind: "error" });
        } finally {
          if (gen === lookupGen.current) setCnpjLookupLoading(false);
        }
      })();
    }, LOOKUP_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [document, taxIdKind]);

  function logout() {
    clearAccessToken();
    navigate("/login", { replace: true });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (taxIdKind === "cnpj" && cnpjAlreadyRegistered) {
      setMessage({
        text: "Este CNPJ não pode ser usado. Escolha outro documento.",
        kind: "error",
      });
      return;
    }
    const docDigits = digitsOnly(document);
    if (taxIdKind === "cnpj" && docDigits.length !== 14) {
      setMessage({ text: "Informe um CNPJ com 14 dígitos.", kind: "error" });
      return;
    }
    if (taxIdKind === "cpf" && docDigits.length !== 11) {
      setMessage({ text: "Informe um CPF com 11 dígitos.", kind: "error" });
      return;
    }

    setSubmitting(true);
    setMessage({ text: "Salvando cadastro fiscal...", kind: "idle" });

    try {
      await completeTenantFiscal({ tax_id_kind: taxIdKind, tax_document: docDigits });
      navigate("/app", { replace: true });
    } catch (err) {
      const text = err instanceof Error ? err.message : "Não foi possível salvar.";
      setMessage({ text, kind: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.layout} id="conteudo-principal">
      <section className={styles.hero} aria-labelledby="complete-hero-title">
        <div className={styles.heroInner}>
          <div className={styles.brandRow}>
            <span className={styles.logoMark} />
            <span className={styles.brandName}>Climaris</span>
          </div>
          <h1 id="complete-hero-title" className={styles.heroTitle}>
            Complete seu cadastro fiscal
          </h1>
          <p className={styles.heroText}>
            Informe se você atua como pessoa jurídica ou física e o CNPJ ou CPF da conta. Isso é necessário para seguir
            com o uso do sistema.
          </p>
          <p className={styles.version}>Versão 1.0.1</p>
        </div>
      </section>

      <section className={styles.formSide} aria-labelledby="complete-form-title">
        <div className={`${styles.card} ${styles.cardRegister}`}>
          <h2 id="complete-form-title" className={styles.cardTitle}>
            Dados fiscais
          </h2>
          <p className={styles.cardSubtitle}>Escolha o tipo e o documento. Em seguida você acessa o painel.</p>

          <div className={styles.cardRegisterScroll}>
            <form className={styles.formGrid} onSubmit={onSubmit} aria-busy={submitting} noValidate>
              <div className={`${styles.formField} ${styles.formFieldFull}`}>
                <span className={styles.label} id="tax-kind-label">
                  Tipo de cadastro
                </span>
                <div
                  className={styles.kindSegment}
                  role="radiogroup"
                  aria-labelledby="tax-kind-label"
                >
                  <button
                    type="button"
                    className={`${styles.kindSegmentBtn} ${taxIdKind === "cnpj" ? styles.kindSegmentBtnActive : ""}`}
                    role="radio"
                    aria-checked={taxIdKind === "cnpj"}
                    onClick={() => {
                      lookupGen.current += 1;
                      setTaxIdKind("cnpj");
                      setDocument((prev) => taxDocumentOnKindChange(prev, "cnpj"));
                      setCnpjAlreadyRegistered(false);
                      setCnpjDetails(null);
                      setMessage({ text: "", kind: "idle" });
                    }}
                  >
                    Pessoa jurídica (CNPJ)
                  </button>
                  <button
                    type="button"
                    className={`${styles.kindSegmentBtn} ${taxIdKind === "cpf" ? styles.kindSegmentBtnActive : ""}`}
                    role="radio"
                    aria-checked={taxIdKind === "cpf"}
                    onClick={() => {
                      lookupGen.current += 1;
                      setTaxIdKind("cpf");
                      setDocument((prev) => taxDocumentOnKindChange(prev, "cpf"));
                      setCnpjAlreadyRegistered(false);
                      setCnpjDetails(null);
                      setMessage({ text: "", kind: "idle" });
                    }}
                  >
                    Pessoa física (CPF)
                  </button>
                </div>
              </div>

              <div className={styles.formField}>
                <label className={styles.label} htmlFor="tax_document_complete">
                  {taxIdKind === "cnpj" ? "CNPJ" : "CPF"}
                </label>
                <input
                  id="tax_document_complete"
                  className={styles.input}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={
                    taxIdKind === "cnpj" ? "00.000.000/0001-00" : "000.000.000-00"
                  }
                  required
                  value={document}
                  onChange={(e) => setDocument(formatTaxDocumentInput(e.target.value, taxIdKind))}
                  maxLength={taxIdKind === "cpf" ? 14 : 18}
                  enterKeyHint="next"
                  aria-busy={taxIdKind === "cnpj" && cnpjLookupLoading}
                />
                {taxIdKind === "cnpj" ? (
                  <>
                    {cnpjLookupLoading ? (
                      <span className={styles.fieldHint}>Verificando cadastro e consultando a Receita…</span>
                    ) : (
                      <span className={styles.fieldHint}>
                        Ao digitar o 14º dígito, verificamos se o CNPJ já está em uso e buscamos dados na Receita.
                      </span>
                    )}
                  </>
                ) : (
                  <span className={styles.fieldHint}>CPF é validado ao salvar.</span>
                )}
              </div>

              {taxIdKind === "cnpj" && cnpjDetails && !cnpjAlreadyRegistered ? (
                <div className={`${styles.formField} ${styles.formFieldFull}`}>
                  <dl className={styles.cnpjPreviewBox}>
                    <dt>Razão social</dt>
                    <dd>{cnpjDetails.company_name}</dd>
                    {cnpjDetails.trade_name && cnpjDetails.trade_name !== cnpjDetails.company_name ? (
                      <>
                        <dt>Nome fantasia</dt>
                        <dd>{cnpjDetails.trade_name}</dd>
                      </>
                    ) : null}
                    {cnpjDetails.address ? (
                      <>
                        <dt>Endereço (Receita)</dt>
                        <dd>
                          {[
                            [cnpjDetails.address.street, cnpjDetails.address.number].filter(Boolean).join(", "),
                            cnpjDetails.address.details,
                            cnpjDetails.address.district,
                            [cnpjDetails.address.city, cnpjDetails.address.state].filter(Boolean).join(" — "),
                            cnpjDetails.address.zip,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </dd>
                      </>
                    ) : null}
                  </dl>
                </div>
              ) : null}

              <div className={`${styles.formField} ${styles.formFieldFull}`}>
                <button
                  className={styles.primaryBtn}
                  type="submit"
                  disabled={submitting || (taxIdKind === "cnpj" && (cnpjLookupLoading || cnpjAlreadyRegistered))}
                >
                  {submitting ? "Salvando…" : "Continuar para o painel"}
                </button>
              </div>
            </form>

            <div
              className={
                message.kind === "error"
                  ? styles.messageError
                  : message.kind === "success"
                    ? styles.messageSuccess
                    : styles.message
              }
              role={message.kind === "error" ? "alert" : "status"}
              aria-live={message.kind === "error" ? "assertive" : "polite"}
            >
              {message.text}
            </div>

            <div className={styles.divider}>
              <span>Sessão</span>
            </div>

            <button type="button" className={styles.secondaryBtn} onClick={logout}>
              Sair
            </button>
          </div>

          <p className={styles.healthHint}>
            <a href="/health" target="_blank" rel="noopener noreferrer">
              Status da API
            </a>
            <span className={styles.healthHintDetail}>
              {" "}
              — caminho correto: <code className={styles.healthCode}>/health</code>
            </span>
          </p>
        </div>
      </section>
    </main>
  );
}
