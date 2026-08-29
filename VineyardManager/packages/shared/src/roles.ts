import type { UserRole } from "./types.js";

export function canOperateVineyard(role: UserRole): boolean {
  return role === "manager" || role === "power_user";
}

export function canSetupVineyard(role: UserRole): boolean {
  return role === "power_user";
}
