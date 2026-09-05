import { useCallback, useEffect, useState } from "react";
import type { PublicUser } from "@vineyard/shared";
import { ApiError, getAuthToken, getCurrentUser } from "@/lib/api";

export type CurrentUserState =
  | { status: "loading" }
  | { status: "ready"; user: PublicUser }
  | { status: "error"; message: string };

export function useCurrentUser() {
  const [state, setState] = useState<CurrentUserState>({ status: "loading" });

  const reload = useCallback(async (options?: { silent?: boolean }) => {
    if (!getAuthToken()) {
      setState({ status: "error", message: "Unauthorized" });
      return;
    }
    if (!options?.silent) {
      setState({ status: "loading" });
    }
    try {
      const user = await getCurrentUser();
      setState({ status: "ready", user });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof ApiError ? error.message : "Could not load account",
      });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { state, reload };
}
