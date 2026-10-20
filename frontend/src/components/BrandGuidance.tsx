"use client";

import { apiFetch } from "@/lib/api-client";
import { useState } from "react";
import { readBrandProfile } from "@/lib/content-policy";
import { useSocialixStore, type CampaignItem } from "@/lib/store";

export function BrandGuidance({ campaign }: { campaign: CampaignItem }) {
  const [profile, setProfile] = useState(() => readBrandProfile(campaign.brandProfile));
  const [description, setDescription] = useState(campaign.brandDescription);
  const [audience, setAudience] = useState(campaign.targetAudience);
  const [examples, setExamples] = useState(() => [...profile.approvedExamples, "", "", ""].slice(0, 3));
  const [avoid, setAvoid] = useState(profile.avoid.join(", "));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const loadCampaign = useSocialixStore((state) => state.loadCampaign);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await apiFetch(`/api/campaigns/${encodeURIComponent(campaign.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandDescription: description, targetAudience: audience,
          brandProfile: { ...profile, approvedExamples: examples.map((text) => text.trim()).filter(Boolean),
            avoid: avoid.split(",").map((text) => text.trim()).filter(Boolean) },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save brand guidance.");
      await loadCampaign(campaign.id);
      setMessage("Saved. New drafts, rewrites and images will use this guidance.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Save failed."); }
    finally { setBusy(false); }
  };
  return <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
    <div><h2 className="font-semibold">Content & brand guidance</h2><p className="mt-1 text-sm text-slate-500">Teach the team what sounds like you. Applies to {campaign.name}.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium">About your brand<textarea className="input mt-1" maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <label className="text-sm font-medium">Who you're helping<textarea className="input mt-1" maxLength={2000} value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Who are they, and what do they need?" /></label>
      <label className="text-sm font-medium">What you offer<textarea className="input mt-1" maxLength={2000} value={profile.offer} onChange={(event) => setProfile({ ...profile, offer: event.target.value })} /></label>
      <label className="text-sm font-medium">Voice & tone<textarea className="input mt-1" maxLength={1200} value={profile.voice} onChange={(event) => setProfile({ ...profile, voice: event.target.value })} placeholder="Practical, friendly, no jargon" /></label>
      <label className="text-sm font-medium">Language<input className="input mt-1" maxLength={80} value={profile.language} onChange={(event) => setProfile({ ...profile, language: event.target.value })} /></label>
      <label className="text-sm font-medium">Avoid these words or claims<input className="input mt-1" maxLength={3000} value={avoid} onChange={(event) => setAvoid(event.target.value)} placeholder="Comma-separated, e.g. game-changing, guaranteed" /></label>
      <label className="text-sm font-medium">Brand colour<input type="color" className="mt-2 block h-10 w-20 rounded border border-slate-200" value={profile.accentColor} onChange={(event) => setProfile({ ...profile, accentColor: event.target.value })} /></label>
      <label className="text-sm font-medium">Preferred image layout<select className="input mt-1" value={profile.template} onChange={(event) => setProfile({ ...profile, template: event.target.value as typeof profile.template })}><option value="takeaway">Key takeaway</option><option value="news">News update</option><option value="comparison">In perspective</option><option value="tip">Practical tip</option></select></label>
    </div>
    <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-medium">Up to 3 examples that sound like you</summary><p className="my-2 text-xs text-slate-500">Use posts you own or have permission to use. Examples guide style, not factual claims.</p>{examples.map((example, index) => <label key={index} className="mt-3 block text-xs">Example {index + 1}<textarea className="input mt-1" rows={3} maxLength={2200} value={example} onChange={(event) => setExamples(examples.map((text, i) => i === index ? event.target.value : text))} /></label>)}</details>
    <p className="text-xs text-slate-500">Your colour and layout are used for generated images. You can also attach your own media.</p>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
    <button disabled={busy} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save brand guidance"}</button>
  </form>;
}
