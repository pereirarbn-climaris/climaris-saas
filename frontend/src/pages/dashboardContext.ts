import type { TenantOut, UserOut } from "../api/auth";

export type DashboardOutletContext = {
  user: UserOut;
  tenant: TenantOut;
  refreshWorkspace: () => Promise<void>;
};
