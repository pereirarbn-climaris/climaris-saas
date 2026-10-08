import type { TenantOut, UserOut } from "../api/auth";

export type PlatformAdminOutletContext = {
  user: UserOut;
  tenant: TenantOut | null;
  refreshWorkspace: () => Promise<void>;
};
