"use client";

import Link from "next/link";
import { useSocialixStore } from "@/lib/store";
import { ArrowUpRight, Link2, Sparkles, FileCheck2, CalendarDays, Lightbulb, AlertCircle } from "lucide-react";

export function WorkspaceActions() {
  const { campaigns, currentCampaignId, posts, strategyReports, openCreateCampaignModal, isLoadingWorkspace } = useSocialixStore();
  const campaign = campaigns.find((item) => item.id === currentCampaignId);
  if (isLoadingWorkspace) return <div role="status" className="h-36 animate-pulse rounded-3xl bg-slate-100 p-6 text-sm text-slate-500">Loading your workspace…</div>;
  if (!campaign) return <section className="rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="text-xl font-semibold tracking-tight text-slate-900">Let’s get you set up.</h2>
    <p className="mt-2 text-sm text-slate-600">Connect your accounts, create a campaign, then tell us what you’d like to post.</p>
    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      <Link href="/settings" className="rounded-2xl border border-slate-200 bg-white p-4"><Link2 className="mb-3 h-5 w-5 text-blue-600" /><span className="text-sm font-semibold">1. Connect Zernio</span><p className="mt-1 text-xs text-slate-500">Add your key and social accounts.</p></Link>
      <button onClick={openCreateCampaignModal} className="rounded-2xl border border-slate-200 bg-white p-4 text-left"><CalendarDays className="mb-3 h-5 w-5 text-purple-600" /><span className="text-sm font-semibold">2. Create a campaign</span><p className="mt-1 text-xs text-slate-500">Choose your audience and channels.</p></button>
      <div className="rounded-2xl border border-slate-200 bg-white/60 p-4"><Sparkles className="mb-3 h-5 w-5 text-amber-600" /><span className="text-sm font-semibold">3. Brief your AI team</span><p className="mt-1 text-xs text-slate-500">Try “Create posts about this week's AI news.”</p></div>
    </div>
  </section>;
  const report = strategyReports[0];
  const pending = report?.recommendations.nextContentBriefs?.filter((_, index) => !report.decisions?.some((decision) => decision.briefIndex === index)).length || 0;
  const cards = [
    { label: "Ready for review", count: posts.filter((post) => post.status === "DRAFT").length, icon: FileCheck2, href: "/posts?status=DRAFT", color: "text-amber-600 bg-amber-50", detail: "Approve your next posts" },
    { label: "Scheduled", count: posts.filter((post) => post.status === "SCHEDULED").length, icon: CalendarDays, href: "/calendar", color: "text-blue-600 bg-blue-50", detail: campaign.timezone },
    { label: "Recommendations", count: pending, icon: Lightbulb, href: "/analytics", color: "text-purple-600 bg-purple-50", detail: "Choose what to create next" },
    { label: "Needs attention", count: posts.filter((post) => post.status === "FAILED").length, icon: AlertCircle, href: "/posts?status=FAILED", color: "text-rose-600 bg-rose-50", detail: "Review publishing issues" },
  ];
  return <section aria-label="Next actions" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {cards.map(({ label, count, icon: Icon, href, color, detail }) => <Link key={label} href={href} className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-soft transition hover:-translate-y-0.5 hover:shadow-md">
      <span className={`shrink-0 rounded-xl p-2 ${color}`}><Icon aria-hidden="true" className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1"><div className="flex items-baseline gap-2"><strong className="text-2xl tracking-tight">{count}</strong><span className="text-xs font-semibold text-slate-600">{label}</span></div><p className="truncate text-[11px] text-slate-500">{detail}</p></div>
      <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-blue-600" />
    </Link>)}
  </section>;
}
