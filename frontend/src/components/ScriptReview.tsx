"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, FilePenLine, Loader2, Save } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSocialixStore } from "@/lib/store";

type Slide = { eyebrow: string; headline: string; body: string };
type Scene = Slide & { narration: string };
type ImagePoint = { title: string; body: string };
type ScriptContent = {
  title: string;
  caption: string;
  hashtags: string[];
  platform: string;
  format: "Single Post" | "Carousel" | "Reel";
  sourceUrls: string[];
  imageHeadline: string;
  imageSummary: string;
  imagePoints: ImagePoint[];
  creativeBrief: { audience: string; angle: string; takeaway: string; visualDirection: string };
  slides: Slide[];
  scenes: Scene[];
  suggestedTimeSlot: string;
  calendarDayOffset: number;
};

export type ContentScript = {
  id: string;
  status: "DRAFT" | "APPROVED" | "GENERATED" | "FAILED";
  version: number;
  content: ScriptContent;
  updatedAt: string;
  generatedPostId?: string | null;
};

export function ScriptReview({ planId, scripts }: { planId: string; scripts: ContentScript[] }) {
  const campaignId = useSocialixStore((state) => state.currentCampaignId);
  const loadCampaign = useSocialixStore((state) => state.loadCampaign);
  const setActiveAgent = useSocialixStore((state) => state.setActiveAgent);
  const [selectedId, setSelectedId] = useState(scripts[0]?.id || "");
  const source = useMemo(() => scripts.find((item) => item.id === selectedId) || scripts[0], [scripts, selectedId]);
  const [draft, setDraft] = useState<ScriptContent | null>(source?.content || null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "approve" | "">("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!source) return;
    setSelectedId(source.id);
    setDraft({ ...structuredClone(source.content), imagePoints: source.content.imagePoints || [] });
    setDirty(false);
  }, [source?.id, source?.version]);

  if (!source || !draft) return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">The Script Agent is waiting for research to finish.</div>;

  const change = <K extends keyof ScriptContent>(key: K, value: ScriptContent[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setDirty(true);
  };
  const updateItem = (key: "slides" | "scenes", index: number, field: string, value: string) => {
    const items = draft[key].map((item, position) => position === index ? { ...item, [field]: value } : item);
    change(key, items as ScriptContent[typeof key]);
  };
  const request = async (path: string, init: RequestInit) => {
    const response = await apiFetch(path, init);
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || data?.detail || `Request failed (${response.status}).`);
    return data;
  };
  const save = async () => {
    setBusy("save"); setError("");
    try {
      await request(`/api/agents/plans/${encodeURIComponent(planId)}/scripts/${encodeURIComponent(source.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: source.version, content: draft }),
      });
      await loadCampaign(campaignId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save the script."); }
    finally { setBusy(""); }
  };
  const approve = async () => {
    setBusy("approve"); setError("");
    try {
      await request(`/api/agents/plans/${encodeURIComponent(planId)}/scripts/${encodeURIComponent(source.id)}/approve`, { method: "POST" });
      await loadCampaign(campaignId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to approve the script."); }
    finally { setBusy(""); }
  };

  return <div className="space-y-4">
    <div className="flex gap-2 overflow-x-auto pb-1">
      {scripts.map((script, index) => <button key={script.id} type="button" onClick={() => setSelectedId(script.id)} className={`shrink-0 rounded-lg border px-3 py-2 text-left text-xs ${script.id === source.id ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600"}`}>
        <span className="block font-semibold">Script {index + 1} · {script.content.platform}</span>
        <span className="mt-0.5 block text-[10px] capitalize opacity-75">{script.content.format} · {script.status.toLowerCase()}</span>
      </button>)}
    </div>

    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div><h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><FilePenLine className="h-4 w-4 text-violet-600" />{draft.format} script</h4><p className="mt-1 text-[11px] text-slate-500">Version {source.version} · {draft.platform}</p></div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${source.status === "DRAFT" ? "bg-amber-50 text-amber-700" : source.status === "APPROVED" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>{source.status === "DRAFT" ? "Needs approval" : source.status}</span>
      </div>

      {source.status === "DRAFT" ? <div className="space-y-4">
        <label className="block space-y-1"><span className="text-xs font-medium text-slate-700">Title / hook</span><input value={draft.title} onChange={(event) => change("title", event.target.value)} className="input" /></label>
        <label className="block space-y-1"><span className="text-xs font-medium text-slate-700">Caption</span><textarea rows={6} value={draft.caption} onChange={(event) => change("caption", event.target.value)} className="input leading-6" /></label>
        <label className="block space-y-1"><span className="text-xs font-medium text-slate-700">Visual direction</span><textarea rows={3} value={draft.creativeBrief.visualDirection} onChange={(event) => change("creativeBrief", { ...draft.creativeBrief, visualDirection: event.target.value })} className="input" /></label>

        {draft.format === "Single Post" && <div className="space-y-3"><h5 className="text-xs font-semibold text-slate-800">Image content</h5><input value={draft.imageHeadline} onChange={(event) => change("imageHeadline", event.target.value)} className="input" aria-label="Image headline" /><textarea rows={2} value={draft.imageSummary} onChange={(event) => change("imageSummary", event.target.value)} className="input" aria-label="Image summary" />{(draft.imagePoints || []).map((point, index) => <div key={index} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:col-span-2">Point {index + 1}</span><input value={point.title} onChange={(event) => change("imagePoints", draft.imagePoints.map((item, position) => position === index ? { ...item, title: event.target.value } : item))} className="input" aria-label={`Point ${index + 1} title`} /><textarea rows={2} value={point.body} onChange={(event) => change("imagePoints", draft.imagePoints.map((item, position) => position === index ? { ...item, body: event.target.value } : item))} className="input" aria-label={`Point ${index + 1} body`} /></div>)}</div>}

        {draft.format === "Carousel" && <div className="space-y-3"><h5 className="text-xs font-semibold text-slate-800">Carousel slides</h5>{draft.slides.map((slide, index) => <div key={index} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:col-span-2">Slide {index + 1}</span><input value={slide.eyebrow} onChange={(event) => updateItem("slides", index, "eyebrow", event.target.value)} className="input" aria-label={`Slide ${index + 1} eyebrow`} /><input value={slide.headline} onChange={(event) => updateItem("slides", index, "headline", event.target.value)} className="input" aria-label={`Slide ${index + 1} headline`} /><textarea rows={2} value={slide.body} onChange={(event) => updateItem("slides", index, "body", event.target.value)} className="input sm:col-span-2" aria-label={`Slide ${index + 1} body`} /></div>)}</div>}

        {draft.format === "Reel" && <div className="space-y-3"><h5 className="text-xs font-semibold text-slate-800">Reel scenes</h5>{draft.scenes.map((scene, index) => <div key={index} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:col-span-2">Scene {index + 1}</span><input value={scene.eyebrow} onChange={(event) => updateItem("scenes", index, "eyebrow", event.target.value)} className="input" aria-label={`Scene ${index + 1} eyebrow`} /><input value={scene.headline} onChange={(event) => updateItem("scenes", index, "headline", event.target.value)} className="input" aria-label={`Scene ${index + 1} headline`} /><textarea rows={2} value={scene.narration} onChange={(event) => change("scenes", draft.scenes.map((item, position) => position === index ? { ...item, narration: event.target.value, body: event.target.value } : item))} className="input sm:col-span-2" aria-label={`Scene ${index + 1} narration`} /></div>)}</div>}

        <details className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600"><summary className="cursor-pointer font-medium">Research sources</summary><div className="mt-2 space-y-1">{draft.sourceUrls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="block truncate text-blue-600 hover:underline">{url}</a>)}</div></details>
        {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={save} disabled={!dirty || !!busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold disabled:opacity-40">{busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Save changes</button><button type="button" onClick={approve} disabled={dirty || !!busy} title={dirty ? "Save your changes before approval" : undefined} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">{busy === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Approve & generate</button></div>
      </div> : <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><p className="font-medium text-slate-800">{source.status === "GENERATED" ? "Content generated from this approved script." : "Approved and queued for generation."}</p>{source.status === "GENERATED" && <button type="button" onClick={() => setActiveAgent("CREATOR")} className="mt-2 text-xs font-semibold text-blue-600">Open Creator Agent →</button>}</div>}
    </div>
  </div>;
}
