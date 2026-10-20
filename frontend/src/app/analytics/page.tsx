"use client";

import { apiFetch } from "@/lib/api-client";
import { useState } from "react";
import Link from "next/link";
import { Activity, Eye, Lightbulb, Users, Sparkles, ArrowUpRight, RefreshCw } from "lucide-react";
import { useSocialixStore } from "@/lib/store";

function metric(value: number | null, suffix = "") {
  return value === null ? "—" : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`;
}

export default function AnalyticsPage() {
  const { analyticsMetrics, strategyReports, currentCampaignId, loadCampaign, executeGoal, posts, openPostEditor } = useSocialixStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [briefText, setBriefText] = useState("");
  const latest = strategyReports[0];
  const topPosts = posts.filter((post) => post.status === "PUBLISHED" && post.metrics &&
    (post.metrics.reach !== null || post.metrics.views !== null))
    .sort((a, b) => (b.metrics!.reach ?? b.metrics!.views ?? 0) - (a.metrics!.reach ?? a.metrics!.views ?? 0)).slice(0, 5);
  const metrics = [
    { label: "Published posts", value: metric(analyticsMetrics.totalPublished), icon: Activity },
    { label: "Total views", value: metric(analyticsMetrics.totalViews), icon: Eye },
    { label: "People reached", value: metric(analyticsMetrics.totalReach), icon: Users },
    { label: "Engagement rate", value: metric(analyticsMetrics.averageEngagementRate, "%"), icon: Sparkles },
  ];
  const decide = async (index: number, approve: boolean) => {
    if (!latest) return;
    setBusy(String(index)); setError(""); setNotice("");
    try {
      if (approve) {
        await executeGoal(editing === index ? briefText : "", { reportId: latest.id, briefIndex: index });
        setNotice("Added to your team's list. You can follow the new drafts as they're made.");
        setEditing(null);
      } else {
        const response = await apiFetch("/api/recommendations", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportId: latest.id, briefIndex: index }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        await loadCampaign(currentCampaignId);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save decision."); }
    finally { setBusy(null); }
  };
  const sync = async () => {
    setBusy("sync"); setError("");
    try {
      const response = await apiFetch("/api/analytics/sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: currentCampaignId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.strategyError || data.syncErrors?.length) setError(data.strategyError || "Some posts could not be refreshed. Showing available measurements.");
      await loadCampaign(currentCampaignId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Refresh failed."); }
    finally { setBusy(null); }
  };
  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-2xl font-semibold tracking-tight text-slate-900">What’s working?</h1><p className="mt-2 text-sm text-slate-500">{analyticsMetrics.lastSyncedAt ? `Last updated ${new Date(analyticsMetrics.lastSyncedAt).toLocaleString()}` : "Once your posts are live, their results will appear here."}</p></div>
      <button onClick={sync} disabled={!!busy || !currentCampaignId} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${busy === "sync" ? "animate-spin" : ""}`} />Refresh metrics</button>
    </div>
    {error && <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">{notice} <Link href="/agents" className="font-bold underline">View progress</Link></p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">{label}</span><Icon className="h-4 w-4 text-slate-400" /></div><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p></div>)}</div>
    <p className="text-xs text-slate-500">Engagement rate uses posts with reported likes, comments, shares, saves and reach. Missing metrics are excluded. Publishing success: {metric(analyticsMetrics.publishingSuccessRate, "%")}.</p>
    {!!topPosts.length && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft"><h2 className="font-bold">Your strongest posts</h2><p className="mt-1 text-xs text-slate-500">Ranked by reported reach, or views when reach is unavailable.</p><div className="mt-4 divide-y divide-slate-100">{topPosts.map((post, index) => <button key={post.id} onClick={() => openPostEditor(post)} className="flex w-full items-center gap-3 py-3 text-left"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-sm font-bold text-purple-600">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{post.title}</span><span className="text-xs text-slate-500">{post.platform}</span></span><span className="text-right"><strong className="block text-sm">{metric(post.metrics!.reach ?? post.metrics!.views)}</strong><span className="text-xs text-slate-500">{post.metrics!.reach === null ? "views" : "reach"}</span></span></button>)}</div></section>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-amber-50 p-2 text-amber-600"><Lightbulb className="h-5 w-5" /></span><div><h2 className="text-lg font-semibold">Ideas to try next</h2><p className="text-sm text-slate-500">Based on your results. Pick an idea, make it yours, then approve it.</p></div></div>
      {!latest ? <div className="py-8 text-center"><p className="text-sm font-semibold text-slate-700">A few results will help us get started.</p><p className="mt-2 text-sm text-slate-500">Publish a post and check back once its numbers come in.</p><Link href="/posts" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-600">See your posts <ArrowUpRight className="h-4 w-4" /></Link></div> : <>
        <p className="my-5 text-sm leading-6 text-slate-600">{latest.summary}</p>
        <p className="mb-4 text-xs text-slate-500">Report snapshot: {new Date(latest.createdAt).toLocaleString()}. Based on {latest.sourcePostIds.length} posts, not necessarily all current results.
          {latest.recommendations.measurementWindow && <> Measurements collected {new Date(latest.recommendations.measurementWindow.from).toLocaleString()} to {new Date(latest.recommendations.measurementWindow.to).toLocaleString()}.</>}
        </p>
        <div className="mb-5 flex flex-wrap gap-2"><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-purple-700">Confidence {Math.round(latest.confidence * 100)}%</span>{latest.insufficientData && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-800">Small sample — treat these as experiments</span>}</div>
        <div className="grid gap-4 lg:grid-cols-2">{latest.recommendations.nextContentBriefs?.map((brief, index) => {
          const decision = latest.decisions?.find((item) => item.briefIndex === index);
          return <article key={`${latest.id}-${index}`} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold text-blue-600">{brief.platform} · {brief.format}</p><h3 className="mt-2 text-lg font-semibold tracking-tight">{brief.topic}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{brief.hook}</p><p className="mt-3 text-xs text-slate-500">Call to action: {brief.callToAction}</p>
            <div className="mt-4 border-t border-slate-100 pt-3"><p className="text-xs font-semibold text-slate-500">Based on these posts</p><div className="mt-2 flex flex-wrap gap-2">{brief.evidencePostIds.map((id) => { const post = posts.find((item) => item.id === id); return post ? <button key={id} onClick={() => openPostEditor(post)} className="max-w-full truncate rounded-lg bg-slate-50 px-2 py-1 text-xs text-blue-600 underline">{post.title}</button> : <span key={id} className="text-xs text-slate-400">{id}</span>; })}</div></div>
            {editing === index && <label className="mt-4 text-xs font-semibold">Edit your brief<textarea value={briefText} maxLength={5000} onChange={(event) => setBriefText(event.target.value)} className="input mt-2 min-h-28" /></label>}
            <div className="mt-auto flex flex-wrap items-center gap-3 pt-5">{decision ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize">{decision.status}</span> : <>
              <button disabled={!!busy || (editing === index && !briefText.trim())} onClick={() => decide(index, true)} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{busy === String(index) ? "Saving…" : "Approve & generate"}</button>
              <button disabled={!!busy} onClick={() => { setEditing(editing === index ? null : index); setBriefText(`Create a ${brief.format} for ${brief.platform} about ${brief.topic}.\nHook: ${brief.hook}\nCall to action: ${brief.callToAction}`); }} className="text-xs font-semibold text-slate-600">{editing === index ? "Cancel edit" : "Edit brief"}</button>
              <button disabled={!!busy} onClick={() => decide(index, false)} className="ml-auto text-xs text-slate-500">Dismiss</button>
            </>}</div>
          </article>;
        })}</div>
      </>}
    </section>
  </div>;
}
