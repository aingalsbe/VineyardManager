import type { PublicUser } from "@vineyard/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, listVineyardUsers } from "@/lib/api";

export type VineyardUsersState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; users: PublicUser[] };

export function useVineyardUsers(vineyardId: string | undefined) {
  const [state, setState] = useState<VineyardUsersState>({ status: "loading" });
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!vineyardId) {
        setState({ status: "loading" });
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!options?.silent) {
        setState({ status: "loading" });
      }
      try {
        const users = await listVineyardUsers(vineyardId, controller.signal);
        if (controller.signal.aborted) return;
        setState({ status: "ready", users });
      } catch (error) {
        if (controller.signal.aborted) return;
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
    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

  return { state, reload: load };
}
