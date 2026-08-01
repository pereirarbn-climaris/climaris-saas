import { Link } from "react-router-dom";
import { Wrench } from "lucide-react";
import clientStyles from "../../../pages/clients/ClientDetail.module.css";

type Props = {
  mode: "create" | "edit";
};

export function ServiceFormHeader({ mode }: Props) {
  const isCreate = mode === "create";

  return (
    <>
      <nav className={clientStyles.breadcrumb} aria-label="Navegação">
        <Link className={clientStyles.breadcrumbLink} to="/app/services">
          Serviços
        </Link>
        <span className={clientStyles.breadcrumbSep} aria-hidden>
          /
        </span>
        <span className={clientStyles.breadcrumbCurrent}>
          {isCreate ? "Novo serviço" : "Editar serviço"}
        </span>
      </nav>

      <header className={clientStyles.headerRow}>
        <div className={clientStyles.headerMain}>
          <span className={clientStyles.headerIcon} aria-hidden>
            <Wrench />
          </span>
          <div>
            <h1 className={clientStyles.headerTitle}>
              {isCreate ? "Novo serviço" : "Editar serviço"}
            </h1>
            <p className={clientStyles.headerSubtitle}>
              {isCreate
                ? "Cadastre um novo serviço oferecido pela sua empresa."
                : "Altere as informações do serviço."}
            </p>
          </div>
        </div>
      </header>
    </>
  );
}
