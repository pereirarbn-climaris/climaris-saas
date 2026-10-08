import { useEffect } from "react";
import { startSessionRefreshTimer } from "../lib/sessionRefresh";

export function SessionMaintenance() {
  useEffect(() => startSessionRefreshTimer(), []);
  return null;
}
