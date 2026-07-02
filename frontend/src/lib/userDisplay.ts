import type { UserRole } from "../api/auth";

export function userInitial(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  return t[0]!.toUpperCase();
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case "admin":
      return "Administrador";
    case "technician":
      return "Técnico";
    case "receptionist":
      return "Recepção";
    default:
      return role;
  }
}
