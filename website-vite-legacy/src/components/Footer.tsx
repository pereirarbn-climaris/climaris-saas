import { Link } from "react-router-dom";
import { BrandMark } from "./BrandMark";

const APP_URL = import.meta.env.VITE_APP_URL ?? "https://app.climaris.com.br";

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface-elevated">
      <div className="section-container grid gap-10 py-12 md:grid-cols-[1.2fr_1fr_1fr]">
        <div className="space-y-4">
          <BrandMark />
          <p className="max-w-sm text-sm leading-relaxed text-text-muted">
            ERP completo para empresas de climatização e refrigeração. Operação, financeiro e
            conformidade técnica no mesmo produto.
          </p>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-text">Navegação</h3>
          <ul className="space-y-2 text-sm text-text-muted">
            <li>
              <Link to="/funcionalidades" className="hover:text-primary">
                Funcionalidades
              </Link>
            </li>
            <li>
              <Link to="/contato" className="hover:text-primary">
                Contato
              </Link>
            </li>
            <li>
              <a href={APP_URL} className="hover:text-primary" target="_blank" rel="noreferrer">
                Acessar o sistema
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-text">Contato</h3>
          <ul className="space-y-2 text-sm text-text-muted">
            <li>
              <a href="mailto:contato@climaris.com.br" className="hover:text-primary">
                contato@climaris.com.br
              </a>
            </li>
            <li>climaris.com.br</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="section-container flex flex-col gap-2 py-6 text-xs text-text-subtle sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Climaris. Todos os direitos reservados.</span>
          <span>Feito para empresas de climatização e refrigeração.</span>
        </div>
      </div>
    </footer>
  );
}
