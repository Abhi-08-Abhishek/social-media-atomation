"use client";

import { apiFetch } from "@/lib/api-client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, KeyRound, ShieldCheck, ArrowRight, Loader2 } from "lucide-react";
import { useSocialixStore } from "@/lib/store";
import { BrandGuidance } from "@/components/BrandGuidance";

export default function SettingsPage() {
  const { campaigns, currentCampaignId, loadCampaign } = useSocialixStore();
  const campaign = campaigns.find((item) => item.id === currentCampaignId);
  const [key, setKey] = useState("");
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    void apiFetch("/api/zernio/connection", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setConnected(data.connected);
    }).catch(() => setError("Unable to load your connection. Please refresh.")).finally(() => setChecking(false));
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await apiFetch("/api/zernio/connection", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: key }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setKey(""); setConnected(true);
      setMessage(`Connection verified. ${data.accountCount} active social accounts available.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Connection failed.");
    } finally { setSaving(false); }
  };
  const setApproval = async (approvalMode: "AUTO" | "REVIEW") => {
    if (!campaign) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await apiFetch(`/api/campaigns/${encodeURIComponent(campaign.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approvalMode }),
      });
      if (!response.ok) throw new Error("Could not update campaign approval.");
      await loadCampaign(campaign.id);
      setMessage("Approval preference saved for new runs. Existing runs keep their original approval setting.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Update failed."); }
    finally { setSaving(false); }
  };

  return <div className="mx-auto max-w-4xl space-y-6">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Connections & preferences</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">Connect your social accounts and choose how you’d like to review posts.</p>
    </div>
    <form onSubmit={save} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><span className="rounded-2xl bg-purple-50 p-3 text-purple-600"><KeyRound className="h-5 w-5" /></span><div><h2 className="font-bold text-slate-900">Your Zernio connection</h2><p className="mt-1 text-sm text-slate-500">A private connection for your account.</p></div></div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${connected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{checking ? "Checking…" : connected ? "Key saved" : "Not connected"}</span>
      </div>
      <ol className="my-6 grid gap-3 text-sm sm:grid-cols-3">
        {["Connect social accounts in Zernio", "Copy your Zernio API key", "Verify your connection below"].map((step, index) =>
          <li key={step} className="rounded-2xl bg-slate-50 p-4"><span className="mb-2 block text-xs font-bold text-blue-600">0{index + 1}</span>{step}</li>)}
      </ol>
      <label htmlFor="zernio-key" className="mb-2 block text-sm font-semibold">{connected ? "Replace your API key" : "Zernio API key"}</label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input id="zernio-key" type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} required minLength={10} maxLength={1000} placeholder="Paste your key here" className="input flex-1" />
        <button disabled={saving || checking || key.trim().length < 10} className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{saving ? "Verifying…" : "Verify & save"}</button>
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-600" />Your key is stored encrypted and stays hidden after you save it.</p>
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      <div className="mt-6 flex flex-wrap justify-between gap-4 border-t border-slate-100 pt-5 text-sm font-semibold">
        <a href="https://zernio.com/dashboard/accounts" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-slate-600">Open Zernio <ExternalLink className="h-4 w-4" /></a>
        {connected && <Link href="/accounts" className="flex items-center gap-2 text-blue-600">View connected accounts <ArrowRight className="h-4 w-4" /></Link>}
      </div>
    </form>
    {campaign && <BrandGuidance key={campaign.id} campaign={campaign} />}
    {campaign && <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <h2 className="font-bold">Publishing preferences · {campaign.name}</h2>
      <p className="mt-2 text-sm text-slate-500">Review new drafts yourself, or let the team schedule them automatically. Videos still need your media and approval.</p>
      <div className="mt-4 flex flex-wrap gap-3">{(["REVIEW", "AUTO"] as const).map((mode) => <button key={mode} disabled={saving} aria-pressed={campaign.approvalMode === mode} onClick={() => setApproval(mode)} className={`rounded-xl border px-4 py-3 text-sm font-semibold disabled:opacity-50 ${campaign.approvalMode === mode ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200"}`}>{mode === "REVIEW" ? "Review before scheduling" : "Enable automatic scheduling"}</button>)}</div>
    </section>}
  </div>;
}
