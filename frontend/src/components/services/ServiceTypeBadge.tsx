import type { ServiceTypeKey } from "./services.utils";

import tableStyles from "./ServicesListTable.module.css";



type Props = {

  typeKey: ServiceTypeKey;

  label: string;

};



export function ServiceTypeBadge({ label }: Props) {

  return <span className={tableStyles.typeTag}>{label}</span>;

}

