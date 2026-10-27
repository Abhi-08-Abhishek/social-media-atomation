"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, ChevronUp, ExternalLink, Image as ImageIcon, LayoutDashboard, Lightbulb, Rows3, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { PostItem, StrategyReportItem, useSocialixStore } from "@/lib/store";

type Range = 7 | 14 | 30 | 60 | 90;
type SortKey = "publishedAt" | "reach" | "views" | "likes" | "comments" | "shares" | "engagement";
const engagementKeys = ["likes", "comments", "shares", "saves"] as const;

function metric(value: number | null | undefined, suffix = "") {
  return value == null ? "—" : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`;
}

function postDate(post: PostItem) { return post.publishedAt || post.scheduledTime || post.createdAt; }
function engagement(post: PostItem) { return engagementKeys.reduce((total, key) => total + (post.metrics?.[key] ?? 0), 0); }
function engagementRate(post: PostItem) { const reach = post.metrics?.reach; return reach && reach > 0 ? engagement(post) / reach * 100 : null; }
function safeUrl(value?: string | null) { return value && /^https?:\/\//i.test(value) ? value : undefined; }
function formatDate(value?: string | null) {
  if (!value) return "Not published";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Unknown date" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
export default function AnalyticsDashboard() {
  const { strategyReports, currentCampaignId, loadCampaign, executeGoal, posts, openPostEditor } = useSocialixStore();
  const [view, setView] = useState<"overview" | "content">("overview");
  const [range, setRange] = useState<Range>(30);
  const [platform, setPlatform] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("publishedAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selectedPost, setSelectedPost] = useState<PostItem | null>(null);
  const [hovered, setHovered] = useState<{ post: PostItem; top: number; left: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [briefText, setBriefText] = useState("");
  const latest = strategyReports[0];
  const platforms = useMemo(() => Array.from(new Set(posts.map((post) => post.platform))), [posts]);

  const scopedPosts = useMemo(() => {
    const from = new Date();
    from.setDate(from.getDate() - range);
    return posts.filter((post) => {
      if (platform !== "ALL" && post.platform !== platform) return false;
      const date = new Date(postDate(post));
      return !Number.isNaN(date.valueOf()) && date >= from;
    });
  }, [posts, platform, range]);

  const published = scopedPosts.filter((post) => post.status === "PUBLISHED");

  const tablePosts = useMemo(() => {
    const value = (post: PostItem) => {
      if (sortKey === "publishedAt") return new Date(postDate(post)).valueOf();
      if (sortKey === "engagement") return engagementRate(post) ?? -1;
      return post.metrics?.[sortKey] ?? -1;
    };
    return [...scopedPosts].sort((left, right) => (value(left) - value(right)) * (sortDirection === "asc" ? 1 : -1));
  }, [scopedPosts, sortKey, sortDirection]);

  const topPosts = [...published].filter((post) => post.metrics)
    .sort((left, right) => (right.metrics?.reach ?? right.metrics?.views ?? 0) - (left.metrics?.reach ?? left.metrics?.views ?? 0)).slice(0, 5);

  const changeSort = (next: SortKey) => {
    if (sortKey === next) setSortDirection((current) => current === "desc" ? "asc" : "desc");
    else { setSortKey(next); setSortDirection("desc"); }
  };

  const decide = async (index: number, approve: boolean) => {
    if (!latest) return;
    setBusy(String(index)); setError(""); setNotice("");
    try {
      if (approve) {
        await executeGoal(editing === index ? briefText : "", { reportId: latest.id, briefIndex: index });
        setNotice("The approved idea was added to your team’s workflow.");
        setEditing(null);
      } else {
        const response = await apiFetch("/api/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportId: latest.id, briefIndex: index }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        await loadCampaign(currentCampaignId);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save the decision."); }
    finally { setBusy(null); }
  };

  return <div className="mx-auto max-w-[1500px] space-y-5 pb-10">
    <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"><div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-xl bg-slate-100 p-1" aria-label="Analytics view"><button onClick={() => setView("overview")} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${view === "overview" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}><LayoutDashboard className="h-4 w-4"/>Overview</button><button onClick={() => setView("content")} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${view === "content" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}><Rows3 className="h-4 w-4"/>Content library</button></div>
      <select aria-label="Platform" value={platform} onChange={(event) => setPlatform(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400"><option value="ALL">All platforms</option>{platforms.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      <div className="ml-auto flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 p-1">{[7, 14, 30, 60, 90].map((days) => <button key={days} onClick={() => setRange(days as Range)} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${range === days ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"}`}>{days}d</button>)}</div>
    </div></section>

    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

    {view === "overview" ? <>
      <ContentTable title="Top-performing content" subtitle="Ranked by reported reach, then views." posts={topPosts} sortKey={sortKey} sortDirection={sortDirection} changeSort={changeSort} onPreview={setSelectedPost} onEdit={openPostEditor} onHover={setHovered} compact/>
      <Recommendations latest={latest} posts={posts} busy={busy} editing={editing} briefText={briefText} setEditing={setEditing} setBriefText={setBriefText} decide={decide} openPostEditor={openPostEditor}/>
    </> : <>
      <ContentTable title="Content performance" subtitle="Sort, preview, and inspect every campaign post." posts={tablePosts} sortKey={sortKey} sortDirection={sortDirection} changeSort={changeSort} onPreview={setSelectedPost} onEdit={openPostEditor} onHover={setHovered}/>
    </>}

    {hovered?.post.imageUrl && <div aria-hidden="true" className="pointer-events-none fixed z-[70] hidden w-64 overflow-hidden rounded-2xl border border-white/80 bg-white p-2 shadow-2xl lg:block" style={{ top: hovered.top, left: hovered.left }}><Media media={hovered.post.imageUrl} title={hovered.post.title} className="h-64 w-full rounded-xl object-cover"/><p className="truncate px-1 pb-1 pt-2 text-xs font-semibold text-slate-800">{hovered.post.title}</p></div>}
    {selectedPost && <PostPreview post={selectedPost} onClose={() => setSelectedPost(null)} onEdit={() => { openPostEditor(selectedPost); setSelectedPost(null); }}/>} 
  </div>;
}

function SortButton({ label, column, current, direction, onClick }: { label: string; column: SortKey; current: SortKey; direction: "asc" | "desc"; onClick: (key: SortKey) => void }) {
  const active = current === column;
  return <button onClick={() => onClick(column)} className={`inline-flex items-center gap-1 whitespace-nowrap ${active ? "text-blue-700" : "text-slate-500"}`}>{label}{active ? direction === "desc" ? <ChevronDown className="h-3 w-3"/> : <ChevronUp className="h-3 w-3"/> : null}</button>;
}

type TableProps = { title: string; subtitle: string; posts: PostItem[]; sortKey: SortKey; sortDirection: "asc" | "desc"; changeSort: (key: SortKey) => void; onPreview: (post: PostItem) => void; onEdit: (post: PostItem) => void; onHover: (value: { post: PostItem; top: number; left: number } | null) => void; compact?: boolean };
function ContentTable({ title, subtitle, posts, sortKey, sortDirection, changeSort, onPreview, onEdit, onHover, compact = false }: TableProps) {
  const rows = compact ? posts.slice(0, 5) : posts;
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-900">{title}</h2><p className="mt-0.5 text-xs text-slate-500">{subtitle}</p></div>{compact && <span className="text-xs font-medium text-slate-400">{rows.length} posts</span>}</header>
    {!rows.length ? <div className="px-5 py-12 text-center"><ImageIcon className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-3 text-sm font-semibold text-slate-700">No posts match this view</p><p className="mt-1 text-xs text-slate-500">Adjust the platform, period, or content filters.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[1050px] border-collapse text-left"><thead className="bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Preview</th><th className="min-w-[300px] px-3 py-3">Post</th><th className="px-3 py-3">Platform</th><th className="px-3 py-3"><SortButton label="Published" column="publishedAt" current={sortKey} direction={sortDirection} onClick={changeSort}/></th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right"><SortButton label="Reach" column="reach" current={sortKey} direction={sortDirection} onClick={changeSort}/></th><th className="px-3 py-3 text-right"><SortButton label="Views" column="views" current={sortKey} direction={sortDirection} onClick={changeSort}/></th><th className="px-3 py-3 text-right"><SortButton label="Likes" column="likes" current={sortKey} direction={sortDirection} onClick={changeSort}/></th><th className="px-3 py-3 text-right"><SortButton label="Comments" column="comments" current={sortKey} direction={sortDirection} onClick={changeSort}/></th><th className="px-3 py-3 text-right"><SortButton label="Shares" column="shares" current={sortKey} direction={sortDirection} onClick={changeSort}/></th><th className="px-3 py-3 text-right"><SortButton label="ER" column="engagement" current={sortKey} direction={sortDirection} onClick={changeSort}/></th><th className="px-4 py-3"><span className="sr-only">Actions</span></th></tr></thead>
      <tbody className="divide-y divide-slate-100">{rows.map((post) => <tr key={post.id} className="group hover:bg-blue-50/30"><td className="px-4 py-3"><button type="button" onClick={() => onPreview(post)} onMouseEnter={(event) => { const box = event.currentTarget.getBoundingClientRect(); onHover({ post, top: Math.max(12, Math.min(box.top - 90, window.innerHeight - 310)), left: Math.min(box.right + 12, window.innerWidth - 275) }); }} onMouseLeave={() => onHover(null)} className="block h-12 w-12 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500">{post.imageUrl ? <Media media={post.imageUrl} title={post.title} className="h-full w-full object-cover"/> : <span className="flex h-full items-center justify-center"><ImageIcon className="h-5 w-5 text-slate-300"/></span>}</button></td>
        <td className="px-3 py-3"><button onClick={() => onPreview(post)} className="block max-w-[420px] text-left"><span className="block truncate text-sm font-semibold text-slate-900 group-hover:text-blue-700">{post.title}</span><span className="mt-1 block truncate text-xs text-slate-500">{post.caption}</span></button><span className="mt-1.5 inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">{post.format || "Post"}</span></td>
        <td className="px-3 py-3 text-xs font-medium text-slate-600">{post.platform}</td><td className="px-3 py-3 text-xs text-slate-500">{formatDate(post.publishedAt || post.scheduledTime)}</td><td className="px-3 py-3 text-xs font-medium capitalize text-slate-600">{post.status === "FAILED" ? "Needs attention" : post.status.toLowerCase()}</td>
        <td className="px-3 py-3 text-right text-sm font-semibold text-slate-700">{metric(post.metrics?.reach)}</td><td className="px-3 py-3 text-right text-sm font-semibold text-slate-700">{metric(post.metrics?.views)}</td><td className="px-3 py-3 text-right text-sm text-slate-600">{metric(post.metrics?.likes)}</td><td className="px-3 py-3 text-right text-sm text-slate-600">{metric(post.metrics?.comments)}</td><td className="px-3 py-3 text-right text-sm text-slate-600">{metric(post.metrics?.shares)}</td><td className="px-3 py-3 text-right text-sm font-semibold text-blue-700">{metric(engagementRate(post), "%")}</td><td className="px-4 py-3"><button onClick={() => post.status === "PUBLISHED" ? onPreview(post) : onEdit(post)} className="whitespace-nowrap text-xs font-semibold text-blue-600 hover:text-blue-800">{post.status === "PUBLISHED" ? "View" : "Review"}</button></td></tr>)}</tbody></table></div>}
  </section>;
}

function Media({ media, title, className }: { media: string; title: string; className: string }) { return /\.(mp4|mov|webm)(\?|$)/i.test(media) ? <video src={media} muted playsInline preload="metadata" aria-label={title} className={className}/> : <img src={media} alt={title} loading="lazy" className={className}/>; }

function PostPreview({ post, onClose, onEdit }: { post: PostItem; onClose: () => void; onEdit: () => void }) {
  const media = post.mediaUrls?.length ? post.mediaUrls : post.imageUrl ? [post.imageUrl] : [];
  return <dialog open aria-labelledby="analytics-preview-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className="fixed inset-0 z-[80] m-0 flex h-dvh max-h-none w-screen max-w-none items-center justify-center border-0 bg-transparent p-3 backdrop:bg-transparent sm:p-6"><article className="flex max-h-[82dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 lg:flex-row"><div className="flex min-h-[220px] flex-1 items-center justify-center bg-transparent p-2">{media.length ? <Media media={media[0]} title={post.title} className="max-h-[66dvh] w-full rounded-xl object-contain"/> : <div className="text-center text-slate-400"><ImageIcon className="mx-auto h-10 w-10"/><p className="mt-2 text-sm">No media preview available</p></div>}</div><div className="flex w-full flex-col overflow-y-auto p-4 lg:max-w-xs"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{post.platform} · {post.format}</p><h2 id="analytics-preview-title" className="mt-1 text-lg font-bold leading-6 text-slate-950">{post.title}</h2></div><button onClick={onClose} aria-label="Close preview" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5"/></button></div><p className="mt-4 text-sm leading-6 text-slate-600">{post.caption}</p><div className="mt-5 grid grid-cols-2 gap-3">{[{ label: "Reach", value: post.metrics?.reach }, { label: "Views", value: post.metrics?.views }, { label: "Likes", value: post.metrics?.likes }, { label: "Engagement", value: engagementRate(post), suffix: "%" }].map((item) => <div key={item.label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{item.label}</p><strong className="mt-1 block text-lg">{metric(item.value, item.suffix)}</strong></div>)}</div><dl className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-xs"><div className="flex justify-between gap-3"><dt className="text-slate-500">Published</dt><dd className="font-medium text-slate-700">{formatDate(post.publishedAt)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Metrics updated</dt><dd className="font-medium text-slate-700">{post.metrics?.observedAt ? new Date(post.metrics.observedAt).toLocaleString() : "Not available"}</dd></div></dl>{media.length > 1 && <div className="mt-5"><p className="mb-2 text-xs font-semibold text-slate-600">{media.length} media items</p><div className="flex gap-2 overflow-x-auto">{media.map((item, index) => <div key={`${item}-${index}`} className="h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-1 ring-slate-200"><Media media={item} title={`${post.title} media ${index + 1}`} className="h-full w-full object-cover"/></div>)}</div></div>}<div className="mt-auto flex flex-wrap gap-2 pt-6"><button onClick={onEdit} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700">Open details</button>{safeUrl(post.liveUrl) && <a href={safeUrl(post.liveUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white">Open live post <ExternalLink className="h-3.5 w-3.5"/></a>}</div></div></article></dialog>;
}

type RecommendationProps = { latest?: StrategyReportItem; posts: PostItem[]; busy: string | null; editing: number | null; briefText: string; setEditing: (value: number | null) => void; setBriefText: (value: string) => void; decide: (index: number, approve: boolean) => Promise<void>; openPostEditor: (post: PostItem) => void };
function Recommendations({ latest, posts, busy, editing, briefText, setEditing, setBriefText, decide, openPostEditor }: RecommendationProps) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><span className="rounded-xl bg-amber-50 p-2 text-amber-600"><Lightbulb className="h-5 w-5"/></span><div><h2 className="font-semibold text-slate-900">Ideas to try next</h2><p className="mt-0.5 text-xs text-slate-500">Recommendations grounded in your measured content.</p></div></div>{!latest ? <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-4"><div><p className="text-sm font-semibold text-slate-700">More published results are needed</p><p className="mt-1 text-xs text-slate-500">Publish at least two posts with metrics to generate useful comparisons.</p></div><Link href="/posts" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600">View posts <ArrowUpRight className="h-4 w-4"/></Link></div> : <><div className="mt-5 flex flex-wrap items-center gap-2"><p className="mr-auto max-w-3xl text-sm leading-6 text-slate-600">{latest.summary}</p><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{Math.round(latest.confidence * 100)}% confidence</span>{latest.insufficientData && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">Small sample</span>}</div><div className="mt-4 grid gap-3 lg:grid-cols-2">{latest.recommendations.nextContentBriefs?.map((brief, index) => { const decision = latest.decisions?.find((item) => item.briefIndex === index); return <article key={`${latest.id}-${index}`} className="flex flex-col rounded-xl border border-slate-200 p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-blue-600">{brief.platform} · {brief.format}</p><h3 className="mt-2 font-semibold text-slate-900">{brief.topic}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{brief.hook}</p><p className="mt-3 text-xs text-slate-500">Call to action: {brief.callToAction}</p><div className="mt-3 flex flex-wrap gap-1.5">{brief.evidencePostIds.map((id) => { const post = posts.find((item) => item.id === id); return post ? <button key={id} onClick={() => openPostEditor(post)} className="max-w-[220px] truncate rounded-md bg-slate-50 px-2 py-1 text-[11px] text-blue-600">{post.title}</button> : null; })}</div>{editing === index && <textarea value={briefText} maxLength={5000} onChange={(event) => setBriefText(event.target.value)} className="input mt-3 min-h-24 text-sm" aria-label="Edit recommendation brief"/>}<div className="mt-auto flex flex-wrap items-center gap-3 pt-4">{decision ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize">{decision.status}</span> : <><button disabled={!!busy || (editing === index && !briefText.trim())} onClick={() => decide(index, true)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy === String(index) ? "Saving…" : "Approve & generate"}</button><button disabled={!!busy} onClick={() => { setEditing(editing === index ? null : index); setBriefText(`Create a ${brief.format} for ${brief.platform} about ${brief.topic}.\nHook: ${brief.hook}\nCall to action: ${brief.callToAction}`); }} className="text-xs font-semibold text-slate-600">{editing === index ? "Cancel edit" : "Edit brief"}</button><button disabled={!!busy} onClick={() => decide(index, false)} className="ml-auto text-xs text-slate-400">Dismiss</button></>}</div></article>; })}</div></>}</section>;
}
