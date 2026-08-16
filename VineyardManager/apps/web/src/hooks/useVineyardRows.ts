import type { Row, Vineyard } from "@vineyard/shared";
import { useCallback, useEffect, useState } from "react";
import { ApiError, listRows, listVineyards } from "@/lib/api";

export type VineyardRowsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty-vineyard" }
  | { status: "ready"; vineyard: Vineyard; rows: Row[] };

export function useVineyardRows() {
  const [state, setState] = useState<VineyardRowsState>({
    status: "loading",
  });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const vineyards = await listVineyards();
      const vineyard = vineyards[0];
      if (!vineyard) {
        setState({ status: "empty-vineyard" });
        return;
      }
      const rows = await listRows(vineyard.id);
      setState({ status: "ready", vineyard, rows });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "Could not reach the Vineyard Manager API.";
      setState({ status: "error", message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: load };
}
