import tableStyles from "./ServicesListTable.module.css";



type Props = {

  active: boolean;

};



export function ServiceStatusBadge({ active }: Props) {

  return (

    <span className={`${tableStyles.statusBadge} ${active ? tableStyles.statusActive : tableStyles.statusInactive}`}>

      {active ? "Ativo" : "Inativo"}

    </span>

  );

}

