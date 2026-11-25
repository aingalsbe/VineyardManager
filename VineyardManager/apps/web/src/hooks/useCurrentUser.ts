import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicUser } from "@vineyard/shared";
import { ApiError, getCurrentUser } from "@/lib/api";

export type CurrentUserState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "ready"; user: PublicUser }
  | { status: "error"; message: string };

export function useCurrentUser() {
  const [state, setState] = useState<CurrentUserState>({ status: "loading" });
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async (options?: { silent?: boolean }) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!options?.silent) {
      setState({ status: "loading" });
    }
    try {
      const user = await getCurrentUser(controller.signal);
      if (controller.signal.aborted) return;
      setState({ status: "ready", user });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && (error.status === 401 || error.code === "UNAUTHORIZED")) {
        setState({ status: "unauthenticated" });
        return;
      }
      setState({
        status: "error",
        message:
          error instanceof ApiError ? error.message : "Could not load account",
      });
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => {
      abortRef.current?.abort();
    };
  }, [reload]);

  return { state, reload };
}
