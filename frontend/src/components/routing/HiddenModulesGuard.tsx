import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isHiddenAppModulePath } from "../../lib/hiddenAppModules";

export function HiddenModulesGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  if (isHiddenAppModulePath(pathname)) {
    return <Navigate to="/app" replace />;
  }

  return children;
}
