import type { Block, Vineyard } from "@vineyard/shared";
import { useCallback, useEffect, useState } from "react";
import { ApiError, listBlocks, listVineyards } from "@/lib/api";

export type VineyardBlocksState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty-vineyard" }
  | { status: "ready"; vineyard: Vineyard; blocks: Block[] };

export function useVineyardBlocks() {
  const [state, setState] = useState<VineyardBlocksState>({
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
      const blocks = await listBlocks(vineyard.id);
      setState({ status: "ready", vineyard, blocks });
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
