"use client";

import { apiFetch } from "@/lib/api-client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ExternalLink, KeyRound, Loader2, Megaphone, ShieldCheck } from "lucide-react";
import { useSocialixStore } from "@/lib/store";
import { BrandGuidance } from "@/components/BrandGuidance";

export default function SettingsPage() {
  const { campaigns, currentCampaignId, loadCampaign } = useSocialixStore();
  const campaign = campaigns.find((item) => item.id === currentCampaignId);
  const [key, setKey] = useState("");
  const [zernioConnected, setZernioConnected] = useState(false);
  const [zernioChecking, setZernioChecking] = useState(true);
  const [metaConnected, setMetaConnected] = useState(false);
  const [metaAccountId, setMetaAccountId] = useState("");
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [metaChecking, setMetaChecking] = useState(true);
  const [metaBusy, setMetaBusy] = useState(false);
  const [metaMessage, setMetaMessage] = useState("");
  const [metaError, setMetaError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch("/api/zernio/connection", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setZernioConnected(data.connected);
    }).catch(() => setError("Unable to load your Zernio connection. Please refresh."))
      .finally(() => setZernioChecking(false));

    void apiFetch("/api/meta/connection", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMetaConnected(data.connected);
      setMetaAccountId(data.adAccountId || "");
    }).catch(() => setMetaError("Unable to load your Meta connection. Please refresh."))
      .finally(() => setMetaChecking(false));
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
      setKey(""); setZernioConnected(true);
      setMessage(`Connection verified. ${data.accountCount} active social accounts available.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Connection failed.");
    } finally { setSaving(false); }
  };

  const saveMeta = async (event: FormEvent) => {
    event.preventDefault();
    setMetaBusy(true); setMetaError(""); setMetaMessage("");
    try {
      const response = await apiFetch("/api/meta/connection", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId: metaAccountId, accessToken: metaAccessToken }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMetaAccountId(data.adAccountId); setMetaAccessToken(""); setMetaConnected(true);
      setMetaMessage(`Connected to ${data.account?.name || "your Meta ad account"}.`);
    } catch (reason) {
      setMetaError(reason instanceof Error ? reason.message : "Unable to verify your Meta access token.");
    } finally { setMetaBusy(false); }
  };

  const disconnectMeta = async () => {
    if (!window.confirm("Disconnect your Meta Ads account? Existing campaigns will remain in Meta.")) return;
    setMetaBusy(true); setMetaError(""); setMetaMessage("");
    try {
      const response = await apiFetch("/api/meta/connection", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMetaConnected(false);
      setMetaMessage("Meta Ads disconnected.");
    } catch (reason) {
      setMetaError(reason instanceof Error ? reason.message : "Unable to disconnect Meta Ads.");
    } finally { setMetaBusy(false); }
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
      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">Connect your publishing and paid-ad accounts after signing in with Google.</p>
    </div>

    <form onSubmit={save} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><span className="rounded-2xl bg-purple-50 p-3 text-purple-600"><KeyRound className="h-5 w-5" /></span><div><h2 className="font-bold text-slate-900">Your Zernio connection</h2><p className="mt-1 text-sm text-slate-500">A private connection for your account.</p></div></div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${zernioConnected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{zernioChecking ? "Checking…" : zernioConnected ? "Key saved" : "Not connected"}</span>
      </div>
      <ol className="my-6 grid gap-3 text-sm sm:grid-cols-3">
        {["Connect social accounts in Zernio", "Copy your Zernio API key", "Verify your connection below"].map((step, index) =>
          <li key={step} className="rounded-2xl bg-slate-50 p-4"><span className="mb-2 block text-xs font-bold text-blue-600">0{index + 1}</span>{step}</li>)}
      </ol>
      <label htmlFor="zernio-key" className="mb-2 block text-sm font-semibold">{zernioConnected ? "Replace your API key" : "Zernio API key"}</label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input id="zernio-key" type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} required minLength={10} maxLength={1000} placeholder="Paste your key here" className="input flex-1" />
        <button disabled={saving || zernioChecking || key.trim().length < 10} className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{saving ? "Verifying…" : "Verify & save"}</button>
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-600" />Your key is stored encrypted and stays hidden after you save it.</p>
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      <div className="mt-6 flex flex-wrap justify-between gap-4 border-t border-slate-100 pt-5 text-sm font-semibold">
        <a href="https://zernio.com/dashboard/accounts" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-slate-600">Open Zernio <ExternalLink className="h-4 w-4" /></a>
        {zernioConnected && <Link href="/accounts" className="flex items-center gap-2 text-blue-600">View connected accounts <ArrowRight className="h-4 w-4" /></Link>}
      </div>
    </form>

    <form onSubmit={saveMeta} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><span className="rounded-2xl bg-blue-50 p-3 text-blue-600"><Megaphone className="h-5 w-5" /></span><div><h2 className="font-bold text-slate-900">Your Meta Ads connection</h2><p className="mt-1 text-sm text-slate-500">A private Meta authorization for your signed-in account.</p></div></div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${metaConnected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{metaChecking ? "Checking…" : metaConnected ? "Connected" : "Not connected"}</span>
      </div>
      <ol className="my-6 grid gap-3 text-sm sm:grid-cols-3">
        {["Copy your Meta Ad Account ID", "Generate an access token", "Verify and connect here"].map((step, index) =>
          <li key={step} className="rounded-2xl bg-slate-50 p-4"><span className="mb-2 block text-xs font-bold text-blue-600">0{index + 1}</span>{step}</li>)}
      </ol>
      <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">The token must have <code className="font-semibold">ads_read</code> and <code className="font-semibold">ads_management</code>, and access to this ad account.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="meta-account-id" className="mb-2 block text-sm font-semibold">Meta Ad Account ID</label><input id="meta-account-id" value={metaAccountId} onChange={(event) => setMetaAccountId(event.target.value)} required minLength={5} maxLength={34} placeholder="1234567890 or act_1234567890" className="input w-full" /></div>
        <div><label htmlFor="meta-access-token" className="mb-2 block text-sm font-semibold">{metaConnected ? "Access Token (enter to replace)" : "Meta Access Token"}</label><input id="meta-access-token" type="password" autoComplete="new-password" value={metaAccessToken} onChange={(event) => setMetaAccessToken(event.target.value)} required minLength={20} maxLength={4096} placeholder="Paste your access token" className="input w-full" /></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button disabled={metaBusy || metaChecking || metaAccountId.length < 5 || metaAccessToken.length < 20} className="inline-flex items-center gap-2 rounded-xl border border-blue-600 px-5 py-3 text-sm font-semibold text-blue-700 disabled:opacity-50">{metaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{metaConnected ? "Verify & replace connection" : "Verify & connect"}</button>
        {metaConnected && <><Link href="/ads" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">Open Meta Ads <ArrowRight className="h-4 w-4" /></Link><button type="button" disabled={metaBusy} onClick={disconnectMeta} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 disabled:opacity-50">{metaBusy ? "Disconnecting…" : "Disconnect"}</button></>}
      </div>
      {metaError && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{metaError}</p>}
      {metaMessage && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{metaMessage}</p>}
      <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Your access token is encrypted for your user and never returned after saving. Use HTTPS in production.</p>
    </form>

    {campaign && <BrandGuidance key={campaign.id} campaign={campaign} />}
    {campaign && <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <h2 className="font-bold">Publishing preferences · {campaign.name}</h2>
      <p className="mt-2 text-sm text-slate-500">Review new drafts yourself, or let the team schedule them automatically. Videos still need your media and approval.</p>
      <div className="mt-4 flex flex-wrap gap-3">{(["REVIEW", "AUTO"] as const).map((mode) => <button key={mode} disabled={saving} aria-pressed={campaign.approvalMode === mode} onClick={() => setApproval(mode)} className={`rounded-xl border px-4 py-3 text-sm font-semibold disabled:opacity-50 ${campaign.approvalMode === mode ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200"}`}>{mode === "REVIEW" ? "Review before scheduling" : "Enable automatic scheduling"}</button>)}</div>
    </section>}
  </div>;
}
