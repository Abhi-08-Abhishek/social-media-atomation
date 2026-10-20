"use client";

import { useEffect } from "react";
import { useSocialixStore } from "@/lib/store";

/** Read progress only. The Python worker owns execution and analytics. */
export function BackgroundSync() {
  const campaignId = useSocialixStore((state) => state.currentCampaignId);
  const loadCampaign = useSocialixStore((state) => state.loadCampaign);
  const active = useSocialixStore((state) => state.plans.some((p) => ["in_progress", "waiting_for_metrics"].includes(p.status)));
  useEffect(() => {
    if (!campaignId || !active) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try { await loadCampaign(campaignId); }
      catch { /* A later poll retries transient read failures. */ }
      finally { if (!disposed) timer = setTimeout(refresh, 4000); }
    };
    void refresh();
    return () => { disposed = true; clearTimeout(timer); };
  }, [campaignId, active, loadCampaign]);
  return null;
}
