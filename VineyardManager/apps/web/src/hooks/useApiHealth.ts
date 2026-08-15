import { useEffect, useState } from "react";
import { getApiHealth, type ApiHealth } from "@/lib/api";

export type ApiHealthState = ApiHealth | "loading" | "offline";

export function useApiHealth(): ApiHealthState {
  const [state, setState] = useState<ApiHealthState>("loading");

  useEffect(() => {
    let cancelled = false;

    getApiHealth()
      .then((data) => {
        if (!cancelled) setState(data);
      })
      .catch(() => {
        if (!cancelled) setState("offline");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
