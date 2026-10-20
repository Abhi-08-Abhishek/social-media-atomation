"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/session";
import { usePathname, useRouter } from "next/navigation";
import { useSocialixStore } from "@/lib/store";
import { BackgroundSync } from "./BackgroundSync";
import { CreateCampaignModal } from "./CreateCampaignModal";
import { Header } from "./Header";
import { ImageKitModal } from "./ImageKitModal";
import { PostEditorModal } from "./PostEditorModal";
import { Sidebar } from "./Sidebar";
import Link from "next/link";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useSession();
  useEffect(() => {
    if (status === "unauthenticated" && pathname !== "/login") router.replace("/login");
  }, [status, pathname, router]);
  const loadWorkspace = useSocialixStore((state) => state.loadWorkspace);
  const { campaigns, currentCampaignId, setCurrentCampaign, openCreateCampaignModal, workspaceError, isLoadingWorkspace } = useSocialixStore();

  useEffect(() => {
    if (status === "authenticated") {
      void loadWorkspace().catch((error) => console.error("[Workspace load]", error));
    }
  }, [loadWorkspace, status]);

  if (pathname === "/login") return children;
  if (status !== "authenticated") return <main className="p-8 text-sm text-slate-500" aria-live="polite">Loading your workspace…</main>;

  return (
    <>
      <BackgroundSync />
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <nav aria-label="Mobile navigation" className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-3 md:hidden">
            {[["/", "Overview"], ["/agents", "Agents"], ["/posts", "Posts"], ["/calendar", "Calendar"], ["/analytics", "Analytics"], ["/accounts", "Accounts"], ["/settings", "Settings"]].map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold ${pathname === href ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-600"}`}>{label}</Link>)}
          </nav>
          <div className="flex gap-2 border-b border-slate-200 bg-white px-4 pb-3 md:hidden">
            <select aria-label="Active campaign" value={currentCampaignId} onChange={(event) => setCurrentCampaign(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs">
              {!currentCampaignId && <option value="">Select a campaign</option>}
              {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
            </select>
            <button onClick={openCreateCampaignModal} className="shrink-0 rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">New campaign</button>
          </div>
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            {workspaceError && <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <span>{workspaceError}</span><button disabled={isLoadingWorkspace} onClick={() => void loadWorkspace().catch(() => undefined)} className="shrink-0 font-semibold underline disabled:opacity-50">Retry</button>
            </div>}
            {children}
          </main>
        </div>
      </div>
      <PostEditorModal />
      <ImageKitModal />
      <CreateCampaignModal />
    </>
  );
}
