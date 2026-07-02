import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchPublicWebsiteLegalSettings } from "../../api/publicWebsite";
import { PlatformBrandMark } from "../../components/branding/PlatformBrandMark";
import { LGPD_POLICY_VERSION, buildLgpdSections, type LgpdSection } from "../../lib/lgpdContent";
import styles from "./PrivacyPolicyPage.module.css";

export function PrivacyPolicyPage() {
  const [sections, setSections] = useState<LgpdSection[]>(() => buildLgpdSections());

  useEffect(() => {
    void (async () => {
      const settings = await fetchPublicWebsiteLegalSettings();
      setSections(buildLgpdSections(settings));
    })();
  }, []);

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <PlatformBrandMark variant="auth" />
          <p className={styles.eyebrow}>Privacidade e proteção de dados</p>
          <h1 className={styles.title}>Política de Privacidade e LGPD</h1>
          <p className={styles.lead}>
            Entenda como coletamos, utilizamos e protegemos dados pessoais em conformidade com a Lei Geral de
            Proteção de Dados (LGPD).
          </p>
          <p className={styles.meta}>Versão {LGPD_POLICY_VERSION} · Última atualização: junho de 2026</p>
        </div>
      </header>

      <main className={styles.content} id="conteudo-principal">
        {sections.map((section) => (
          <section key={section.id} id={section.id} className={styles.section} aria-labelledby={`${section.id}-title`}>
            <h2 id={`${section.id}-title`} className={styles.sectionTitle}>
              {section.title}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.list ? (
              <ul className={styles.list}>
                {section.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {section.footer ? <p>{section.footer}</p> : null}
          </section>
        ))}

        <footer className={styles.footer}>
          <Link to="/register" className={styles.backLink}>
            ← Voltar ao cadastro
          </Link>
          <Link to="/login" className={styles.backLink}>
            Entrar no sistema
          </Link>
        </footer>
      </main>
    </div>
  );
}
