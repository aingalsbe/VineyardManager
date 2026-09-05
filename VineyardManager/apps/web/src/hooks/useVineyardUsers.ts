import type { PublicUser } from "@vineyard/shared";
import { useCallback, useEffect, useState } from "react";
import { ApiError, listVineyardUsers } from "@/lib/api";

export type VineyardUsersState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; users: PublicUser[] };

export function useVineyardUsers(vineyardId: string | undefined) {
  const [state, setState] = useState<VineyardUsersState>({ status: "loading" });

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!vineyardId) {
        setState({ status: "loading" });
        return;
      }
      if (!options?.silent) {
        setState({ status: "loading" });
      }
      try {
        const users = await listVineyardUsers(vineyardId);
        setState({ status: "ready", users });
      } catch (error) {
        setState({
          status: "error",
          message:
            error instanceof ApiError
              ? error.message
              : "Could not load people",
        });
      }
    },
    [vineyardId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: load };
}
