import { Link } from "react-router-dom";
import styles from "../saas/SaasDashboardPage.module.css";

/**
 * Referência para operadores da plataforma: integração Pagar.me (Stone) vive no app de cada tenant.
 */
export function PlatformPagarmePage() {
  return (
    <div className={styles.panel}>
      <section className={styles.heroCard}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Operação · Pagamentos</p>
          <h2 className={styles.heroTitle}>Pagar.me (Stone) no Climaris</h2>
          <p className={styles.heroLead}>
            Não há credenciais globais na operação: cada workspace cadastra <strong>sk_</strong>, <strong>pk_</strong> e webhook no
            próprio painel do cliente.
          </p>
        </div>
      </section>

      <section className={styles.heroCard} style={{ marginTop: 16 }}>
        <h3 className={styles.heroTitle} style={{ fontSize: "1.1rem" }}>
          Onde o cliente configura
        </h3>
        <ul className={styles.heroLead} style={{ marginTop: 8, paddingLeft: "1.25rem" }}>
          <li>
            <strong>Administração do workspace</strong> → aba <strong>Pagamentos</strong> — visão do status e atalhos.
          </li>
          <li>
            <strong>Financeiro</strong> → <strong>Contas e carteiras</strong> — credenciais, chave pública para cartão e URL do
            webhook.
          </li>
        </ul>
        <p className={styles.heroLead} style={{ marginTop: 8 }}>
          Documentação Pagar.me:{" "}
          <a href="https://docs.pagar.me/" target="_blank" rel="noreferrer">
            docs.pagar.me
          </a>
          {" · "}
          <a href="https://docs.pagar.me/reference/criar-token-cart%C3%A3o-1" target="_blank" rel="noreferrer">
            Tokenização de cartão
          </a>
        </p>
        <p className={styles.heroLead} style={{ marginTop: 8 }}>
          Para suporte: oriente o tenant a registrar o <strong>domínio</strong> do app no painel Pagar.me antes de usar cartão no
          navegador.
        </p>
        <p style={{ marginTop: 16 }}>
          <Link to="/operacao" className={styles.btnSecondary}>
            Voltar ao painel
          </Link>
        </p>
      </section>
    </div>
  );
}
