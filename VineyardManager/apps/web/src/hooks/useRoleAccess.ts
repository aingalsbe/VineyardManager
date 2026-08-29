import { canOperateVineyard, canSetupVineyard } from "@vineyard/shared";
import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "@/components/layout/AppLayout";

export function useRoleAccess() {
  const { user } = useOutletContext<AppOutletContext>();
  const role = user?.role;
  return {
    user,
    canOperate: role ? canOperateVineyard(role) : false,
    canSetup: role ? canSetupVineyard(role) : false,
  };
}
