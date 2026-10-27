"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BarChart3, CheckCircle2, Loader2, Pause, Play, RefreshCw, Search, Sparkles, Trash2 } from "lucide-react";

import { apiFetch } from "@/lib/api-client";
import { useSocialixStore } from "@/lib/store";

type Connection = { connected: boolean; scopes: string[]; expiresAt?: string | null };
type AdAccount = { id: string; localId: string; name: string; currency: string; timezoneName: string; status: string };
type PageAsset = { id: string; name: string; instagram?: { id: string; username?: string } | null };
type Pixel = { id: string; name: string };
type Interest = { id: string; name: string };
type CustomAudience = { id: string; name: string; subtype?: string | null; sizeLower?: number | null; sizeUpper?: number | null };
type GuidedIntent = "FIND_NEW_CUSTOMERS" | "RETARGET_CUSTOMERS" | "CREATE_PROMOTION" | "GET_STARTED";
type GuidedProposal = {
  name: string; objective: string; specialAdCategory?: string | null; budgetMode: "CAMPAIGN" | "AD_SET";
  budgetType: "DAILY" | "LIFETIME"; budget?: string | number | null; countries: string[]; ageMin: number; ageMax: number;
  gender: "ALL" | "MALE" | "FEMALE"; automaticPlacements: boolean; durationDays?: number | null;
  primaryText: string; headline: string; description: string; destinationUrl?: string | null; mediaUrl?: string | null;
  callToAction: string; assumptions: string[]; rationale: string;
};
type GuidedResult = { ready: boolean; questions: string[]; proposal: GuidedProposal; interests: Interest[] };
type MetaCampaign = {
  id: string; name: string; objective: string; status: string; effectiveStatus?: string | null; errorMessage?: string | null;
  remoteId?: string | null; accountName?: string; currency?: string; dailyBudget?: number | null; lifetimeBudget?: number | null;
  sourceCampaignId?: string | null; sourceCampaignName?: string | null; automationMode?: "ASSIST" | "GUARDED"; maxTotalSpend?: number | null;
};
type Insight = { entityType: string; entityId: string; spend?: string | number | null; impressions?: number | null; clicks?: number | null; ctr?: string | number | null; cpc?: string | number | null; cpm?: string | number | null; dateStart: string; dateStop: string };
type Recommendation = { id: string; kind: string; rationale: string; evidence: Record<string, unknown>; status: string };
type CampaignValidation = { ready: boolean; blockingIssues: string[]; warnings: string[]; maximumPlannedSpend?: number | null; maxTotalSpend?: number | null };
type CampaignDetail = MetaCampaign & { insights: Insight[]; recommendations: Recommendation[]; adSets: unknown[]; ads: unknown[]; validation?: CampaignValidation };

async function json(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
  return data;
}

function metric(value: string | number | null | undefined, suffix = "") {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;
}

export default function MetaAdsPage() {
  const { campaigns: organicCampaigns, currentCampaignId } = useSocialixStore();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [campaigns, setCampaigns] = useState<MetaCampaign[]>([]);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [pages, setPages] = useState<PageAsset[]>([]);
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [customAudiences, setCustomAudiences] = useState<CustomAudience[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [accountId, setAccountId] = useState("");
  const [pageId, setPageId] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("OUTCOME_TRAFFIC");
  const [specialCategory, setSpecialCategory] = useState("");
  const [budgetMode, setBudgetMode] = useState<"CAMPAIGN" | "AD_SET">("AD_SET");
  const [budgetType, setBudgetType] = useState<"DAILY" | "LIFETIME">("DAILY");
  const [budget, setBudget] = useState("10");
  const [country, setCountry] = useState("IN");
  const [ageMin, setAgeMin] = useState("18");
  const [ageMax, setAgeMax] = useState("65");
  const [gender, setGender] = useState("ALL");
  const [automaticPlacements, setAutomaticPlacements] = useState(true);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [primaryText, setPrimaryText] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [callToAction, setCallToAction] = useState("LEARN_MORE");
  const [interestQuery, setInterestQuery] = useState("");
  const [interestResults, setInterestResults] = useState<Interest[]>([]);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [customAudienceId, setCustomAudienceId] = useState("");
  const [setupMode, setSetupMode] = useState<"AI" | "MANUAL">("AI");
  const [guidedIntent, setGuidedIntent] = useState<GuidedIntent>("GET_STARTED");
  const [guidedPrompt, setGuidedPrompt] = useState("");
  const [guidedResult, setGuidedResult] = useState<GuidedResult | null>(null);
  const [sourceCampaignId, setSourceCampaignId] = useState("");
  const [automationMode, setAutomationMode] = useState<"ASSIST" | "GUARDED">("ASSIST");
  const [maxTotalSpend, setMaxTotalSpend] = useState("");

  const selectedAccount = accounts.find((account) => account.id === accountId);
  const selectedPage = pages.find((page) => page.id === pageId);
  const selectedCustomAudience = customAudiences.find((audience) => audience.id === customAudienceId);
  const currencyDigits = useMemo(() => selectedAccount
    ? new Intl.NumberFormat(undefined, { style: "currency", currency: selectedAccount.currency }).resolvedOptions().maximumFractionDigits ?? 2
    : 2, [selectedAccount]);
  const estimatedSpend = useMemo(() => {
    const amount = Number(budget);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    if (budgetType === "LIFETIME") return amount;
    if (!endTime) return null;
    const start = startTime ? new Date(startTime) : new Date();
    const end = new Date(endTime);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
    return end > start ? amount * days : null;
  }, [budget, budgetType, endTime, startTime]);

  const loadCampaigns = useCallback(async () => {
    const data = await json(await apiFetch("/api/meta/campaigns", { cache: "no-store" }));
    setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
  }, []);

  const load = useCallback(async () => {
    setBusy("load"); setError("");
    try {
      const connected = await json(await apiFetch("/api/meta/connection", { cache: "no-store" }));
      setConnection(connected);
      if (connected.connected) {
        const accountData = await json(await apiFetch("/api/meta/ad-accounts", { cache: "no-store" }));
        setAccounts(accountData.accounts || []);
        setAccountId((current) => current || accountData.accounts?.[0]?.id || "");
        await loadCampaigns();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Meta Ads.");
    } finally { setBusy(""); }
  }, [loadCampaigns]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!sourceCampaignId && currentCampaignId) setSourceCampaignId(currentCampaignId); }, [currentCampaignId, sourceCampaignId]);

  useEffect(() => {
    if (!accountId) { setPages([]); setPixels([]); setCustomAudiences([]); return; }
    let disposed = false;
    void (async () => {
      try {
        const data = await json(await apiFetch(`/api/meta/assets?adAccountId=${encodeURIComponent(accountId)}`, { cache: "no-store" }));
        if (disposed) return;
        setPages(data.pages || []); setPixels(data.pixels || []); setPageId(data.pages?.[0]?.id || "");
        try {
          const audiences = await json(await apiFetch(`/api/meta/custom-audiences?adAccountId=${encodeURIComponent(accountId)}`, { cache: "no-store" }));
          if (!disposed) setCustomAudiences(audiences.audiences || []);
        } catch { if (!disposed) setCustomAudiences([]); }
      } catch (caught) {
        if (!disposed) setError(caught instanceof Error ? caught.message : "Unable to load Meta assets.");
      }
    })();
    return () => { disposed = true; };
  }, [accountId]);

  function applyGuidedProposal(result: GuidedResult) {
    const plan = result.proposal;
    setName(plan.name); setObjective(plan.objective); setSpecialCategory(plan.specialAdCategory || "");
    setBudgetMode(plan.budgetMode); setBudgetType(plan.budgetType);
    if (plan.budget !== null && plan.budget !== undefined) setBudget(String(plan.budget));
    if (plan.countries[0]) setCountry(plan.countries[0]);
    setAgeMin(String(plan.ageMin)); setAgeMax(String(plan.ageMax)); setGender(plan.gender);
    setAutomaticPlacements(plan.automaticPlacements); setInterests(result.interests || []);
    setPrimaryText(plan.primaryText); setHeadline(plan.headline); setDescription(plan.description || "");
    if (plan.destinationUrl) setDestinationUrl(plan.destinationUrl);
    if (plan.mediaUrl) setMediaUrl(plan.mediaUrl);
    setCallToAction(plan.callToAction);
    if (plan.durationDays) {
      const date = new Date(Date.now() + plan.durationDays * 86400000);
      date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
      setEndTime(date.toISOString().slice(0, 16));
    }
  }

  async function generateGuidedCampaign() {
    if (!selectedAccount) { setError("Choose a Meta ad account first."); return; }
    setBusy("guide"); setError(""); setNotice(""); setGuidedResult(null);
    try {
      const data = await json(await apiFetch("/api/meta/campaigns/generate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          adAccountId: selectedAccount.id, prompt: guidedPrompt, intent: guidedIntent,
          sourceCampaignId: sourceCampaignId || undefined,
          pageId: pageId || undefined, pixelId: pixelId || undefined, customAudienceId: customAudienceId || undefined,
        }),
      })) as GuidedResult;
      setGuidedResult(data); applyGuidedProposal(data);
      setNotice(data.ready ? "AI campaign plan is ready. Review every field before saving." : "The draft was filled where possible. Complete the requested fields below.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to generate a campaign plan."); }
    finally { setBusy(""); }
  }

  async function loadDetail(id: string) {
    setBusy(`detail:${id}`); setError("");
    try {
      const data = await json(await apiFetch(`/api/meta/campaigns/${encodeURIComponent(id)}`, { cache: "no-store" }));
      setDetail(data.campaign);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load campaign."); }
    finally { setBusy(""); }
  }

  async function searchInterests() {
    if (interestQuery.trim().length < 2) return;
    setBusy("interests"); setError("");
    try {
      const data = await json(await apiFetch(`/api/meta/targeting-search?q=${encodeURIComponent(interestQuery.trim())}`));
      setInterestResults(data.interests || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to search interests."); }
    finally { setBusy(""); }
  }

  async function createCampaign(event: FormEvent) {
    event.preventDefault(); setBusy("create"); setError(""); setNotice("");
    try {
      if (!selectedAccount || !selectedPage) throw new Error("Choose an ad account and Facebook Page.");
      const numericBudget = Number(budget);
      if (!Number.isFinite(numericBudget) || numericBudget <= 0) throw new Error("Enter a positive budget.");
      if (budgetType === "LIFETIME" && !endTime) throw new Error("Choose an end time for a lifetime budget.");
      const budgetMinor = Math.round(numericBudget * 10 ** currencyDigits);
      const limitMajor = maxTotalSpend ? Number(maxTotalSpend) : estimatedSpend;
      if (limitMajor !== null && (!Number.isFinite(limitMajor) || limitMajor <= 0)) throw new Error("Enter a positive maximum spend.");
      const campaignBudget = budgetMode === "CAMPAIGN" ? budgetMinor : undefined;
      const adSetBudget = budgetMode === "AD_SET" ? budgetMinor : undefined;
      const optimizationGoal = objective === "OUTCOME_AWARENESS" ? "REACH"
        : objective === "OUTCOME_LEADS" || objective === "OUTCOME_SALES" ? "OFFSITE_CONVERSIONS" : "LANDING_PAGE_VIEWS";
      const payload = {
        adAccountRemoteId: selectedAccount.id, sourceCampaignId: sourceCampaignId || undefined, name, objective,
        automationMode, maxTotalSpend: limitMajor === null ? undefined : Math.round(limitMajor * 10 ** currencyDigits),
        specialAdCategories: specialCategory ? [specialCategory] : [], budgetMode,
        dailyBudget: budgetType === "DAILY" ? campaignBudget : undefined,
        lifetimeBudget: budgetType === "LIFETIME" ? campaignBudget : undefined,
        adSets: [{
          name: `${name} Audience`, targeting: { countries: [country.toUpperCase()], ageMin: Number(ageMin), ageMax: Number(ageMax),
            genders: gender === "ALL" ? [] : [gender === "MALE" ? 1 : 2], interests: selectedCustomAudience ? [] : interests,
            customAudiences: selectedCustomAudience ? [{ id: selectedCustomAudience.id, name: selectedCustomAudience.name }] : [] },
          placements: { automatic: automaticPlacements, publisherPlatforms: automaticPlacements ? [] : ["facebook", ...(selectedPage.instagram ? ["instagram"] : [])] },
          optimizationGoal, billingEvent: "IMPRESSIONS", bidStrategy: "LOWEST_COST_WITHOUT_CAP",
          pixelId: objective === "OUTCOME_LEADS" || objective === "OUTCOME_SALES" ? pixelId || undefined : undefined,
          conversionEvent: objective === "OUTCOME_LEADS" ? "LEAD" : objective === "OUTCOME_SALES" ? "PURCHASE" : undefined,
          dailyBudget: budgetType === "DAILY" ? adSetBudget : undefined,
          lifetimeBudget: budgetType === "LIFETIME" ? adSetBudget : undefined,
          startTime: startTime ? new Date(startTime).toISOString() : undefined,
          endTime: endTime ? new Date(endTime).toISOString() : undefined,
          ads: [{ name: `${name} Ad`, creative: { name: `${name} Creative`, pageId: selectedPage.id,
            instagramActorId: selectedPage.instagram?.id || undefined, format: "SINGLE_IMAGE", mediaUrl,
            primaryText, headline, description, destinationUrl, callToAction } }]
        }]
      };
      const data = await json(await apiFetch("/api/meta/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
      setNotice("Meta campaign draft saved. Review it before creating the paused remote campaign.");
      await loadCampaigns(); await loadDetail(data.campaign.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to create campaign draft."); }
    finally { setBusy(""); }
  }

  async function deleteCampaign(campaign: MetaCampaign) {
    if (!window.confirm(`Delete the local draft "${campaign.name}"?`)) return;
    setBusy(`delete:${campaign.id}`); setError(""); setNotice("");
    try {
      await json(await apiFetch(`/api/meta/campaigns/${encodeURIComponent(campaign.id)}`, { method: "DELETE" }));
      if (detail?.id === campaign.id) setDetail(null);
      setNotice("Campaign draft deleted."); await loadCampaigns();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to delete campaign draft."); }
    finally { setBusy(""); }
  }

  async function action(campaign: MetaCampaign, command: "publish" | "reconcile" | "activate" | "pause" | "sync") {
    if (command === "activate" && !window.confirm(`Activate “${campaign.name}”? This can begin spending its configured budget.`)) return;
    if (command === "pause" && !window.confirm(`Pause “${campaign.name}” in Meta?`)) return;
    setBusy(`${command}:${campaign.id}`); setError(""); setNotice("");
    try {
      await json(await apiFetch(`/api/meta/campaigns/${encodeURIComponent(campaign.id)}/${command}`, {
        method: "POST", headers: command === "activate" ? { "Content-Type": "application/json" } : undefined,
        body: command === "activate" ? JSON.stringify({ confirmed: true }) : undefined,
      }));
      setNotice(command === "publish" ? "Campaign created in Meta as paused." : `Campaign ${command} completed.`);
      await loadCampaigns(); await loadDetail(campaign.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : `Unable to ${command} campaign.`); }
    finally { setBusy(""); }
  }

  async function decide(id: string, decision: "APPROVED" | "DISMISSED") {
    setBusy(`decision:${id}`); setError("");
    try {
      await json(await apiFetch(`/api/meta/recommendations/${encodeURIComponent(id)}`, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) }));
      if (detail) await loadDetail(detail.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save recommendation decision."); }
    finally { setBusy(""); }
  }

  if (busy === "load" && !connection) return <div role="status" className="p-8 text-sm text-slate-500">Loading Meta Ads…</div>;

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div><h1 className="text-2xl font-semibold tracking-tight text-slate-900">Meta Ads</h1><p className="mt-1 text-sm text-slate-500">Paid campaigns are isolated from Zernio and organic posts.</p></div>
      {connection?.connected ? <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Meta connected</span>
        : <Link href="/settings" className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Connect Meta Ads in Settings</Link>}
    </div>

    {error && <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {notice && <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}

    {connection?.connected && <>
      <details id="meta-campaign-builder" className="scroll-mt-20 rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
        <summary className="cursor-pointer text-lg font-semibold">Create paid campaign draft</summary>
        <div className="mt-5 grid gap-3 md:grid-cols-2" role="group" aria-label="Campaign setup method">
          <button type="button" aria-pressed={setupMode === "AI"} onClick={() => setSetupMode("AI")} className={`rounded-2xl border p-4 text-left ${setupMode === "AI" ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
            <span className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-blue-600" />AI-guided setup</span>
            <span className="mt-1 block text-xs text-slate-500">Describe the result you want and receive an editable campaign plan.</span>
          </button>
          <button type="button" aria-pressed={setupMode === "MANUAL"} onClick={() => setSetupMode("MANUAL")} className={`rounded-2xl border p-4 text-left ${setupMode === "MANUAL" ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
            <span className="font-semibold">Manual campaign setup</span>
            <span className="mt-1 block text-xs text-slate-500">Configure every campaign, audience and creative field yourself.</span>
          </button>
        </div>
        {setupMode === "AI" && <section className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/50 p-4" aria-labelledby="guided-campaign-title">
          <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-blue-600" /><h2 id="guided-campaign-title" className="font-semibold">Describe your campaign</h2></div>
          <textarea className="input mt-3 min-h-28 bg-white" minLength={10} maxLength={5000} value={guidedPrompt} onChange={(event) => setGuidedPrompt(event.target.value)} placeholder="Example: Promote my digital marketing course in India with a daily budget of INR 500 for 10 days. Send customers to https://example.com/course and use https://example.com/ad.jpg" />
          <div className="mt-3 flex flex-wrap gap-2">{([
            ["FIND_NEW_CUSTOMERS", "Find new customers"], ["RETARGET_CUSTOMERS", "Retarget customers"],
            ["CREATE_PROMOTION", "Create a promotion"], ["GET_STARTED", "Help me get started"],
          ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={guidedIntent === value} onClick={() => setGuidedIntent(value)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${guidedIntent === value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{label}</button>)}</div>
          {guidedIntent === "RETARGET_CUSTOMERS" && !customAudiences.length && <p className="mt-3 text-xs text-amber-700">No accessible Custom Audience was found. Create one in Meta or grant this token Custom Audience access.</p>}
          <button type="button" onClick={generateGuidedCampaign} disabled={!!busy || guidedPrompt.trim().length < 10} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy === "guide" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Generate and fill campaign</button>
          {guidedResult && <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-white p-3"><p className="text-xs font-bold uppercase text-slate-500">AI rationale</p><p className="mt-1 text-sm text-slate-700">{guidedResult.proposal.rationale || "The proposal follows your campaign description."}</p></div>
            <div className="rounded-xl bg-white p-3"><p className="text-xs font-bold uppercase text-slate-500">Review before saving</p>{guidedResult.questions.length ? <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-amber-800">{guidedResult.questions.map((question) => <li key={question}>{question}</li>)}</ul> : <p className="mt-1 text-sm text-emerald-700">Required planning information is present.</p>}</div>
            {!!guidedResult.proposal.assumptions.length && <div className="rounded-xl bg-white p-3 md:col-span-2"><p className="text-xs font-bold uppercase text-slate-500">Assumptions</p><ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-slate-600">{guidedResult.proposal.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></div>}
          </div>}
        </section>}
        <p className="mt-5 text-sm font-semibold text-slate-700">Review and edit campaign settings</p>
        <form onSubmit={createCampaign} className="mt-5 grid gap-5 lg:grid-cols-2">
          <label className="text-sm font-semibold">Ad account<select className="input mt-2" value={accountId} onChange={(e) => setAccountId(e.target.value)} required><option value="">Choose account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select></label>
          <label className="text-sm font-semibold">Facebook Page<select className="input mt-2" value={pageId} onChange={(e) => setPageId(e.target.value)} required><option value="">Choose Page</option>{pages.map((p) => <option key={p.id} value={p.id}>{p.name}{p.instagram?.username ? ` · @${p.instagram.username}` : ""}</option>)}</select></label>
          <label className="text-sm font-semibold">Brand campaign<select className="input mt-2" value={sourceCampaignId} onChange={(event) => setSourceCampaignId(event.target.value)}><option value="">No linked brand campaign</option>{organicCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-500">Supplies brand voice, audience and approved guidance to the Ads Planner.</span></label>
          <label className="text-sm font-semibold">Automation<select className="input mt-2" value={automationMode} onChange={(event) => setAutomationMode(event.target.value as "ASSIST" | "GUARDED")}><option value="ASSIST">Assist — recommendations only</option><option value="GUARDED">Guarded — prepare safe actions for approval</option></select></label>
          <label className="text-sm font-semibold">Campaign name<input className="input mt-2" value={name} onChange={(e) => setName(e.target.value)} minLength={1} maxLength={150} required /></label>
          <label className="text-sm font-semibold">Objective<select className="input mt-2" value={objective} onChange={(e) => setObjective(e.target.value)}><option value="OUTCOME_TRAFFIC">Website traffic</option><option value="OUTCOME_AWARENESS">Awareness</option><option value="OUTCOME_LEADS">Website leads</option><option value="OUTCOME_SALES">Website sales</option></select></label>
          <label className="text-sm font-semibold">Special ad category<select className="input mt-2" value={specialCategory} onChange={(e) => setSpecialCategory(e.target.value)}><option value="">None</option><option value="CREDIT">Credit</option><option value="EMPLOYMENT">Employment</option><option value="HOUSING">Housing</option><option value="ISSUES_ELECTIONS_POLITICS">Issues, elections or politics</option></select></label>
          <label className="text-sm font-semibold">Budget location<select className="input mt-2" value={budgetMode} onChange={(e) => setBudgetMode(e.target.value as "CAMPAIGN" | "AD_SET")}><option value="AD_SET">Ad Set budget</option><option value="CAMPAIGN">Campaign budget</option></select></label>
          <label className="text-sm font-semibold">Budget type<select className="input mt-2" value={budgetType} onChange={(e) => setBudgetType(e.target.value as "DAILY" | "LIFETIME")}><option value="DAILY">Daily</option><option value="LIFETIME">Lifetime</option></select></label>
          <label className="text-sm font-semibold">Budget ({selectedAccount?.currency || "currency"})<input className="input mt-2" type="number" min="0.01" step={1 / 10 ** currencyDigits} value={budget} onChange={(e) => setBudget(e.target.value)} required /></label>
          <label className="text-sm font-semibold">Maximum total spend ({selectedAccount?.currency || "currency"})<input className="input mt-2" type="number" min="0.01" step={1 / 10 ** currencyDigits} value={maxTotalSpend} onChange={(event) => setMaxTotalSpend(event.target.value)} placeholder={estimatedSpend === null ? "Add an end date or set a limit" : String(estimatedSpend)} /><span className="mt-1 block text-xs font-normal text-slate-500">Defaults to the calculated plan total when the schedule has an end date.</span></label>
          {(objective === "OUTCOME_LEADS" || objective === "OUTCOME_SALES") && <label className="text-sm font-semibold">Meta Pixel<select className="input mt-2" value={pixelId} onChange={(e) => setPixelId(e.target.value)} required><option value="">Choose Pixel</option>{pixels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
          <div className="grid grid-cols-3 gap-3"><label className="text-sm font-semibold">Country<input className="input mt-2 uppercase" value={country} onChange={(e) => setCountry(e.target.value)} minLength={2} maxLength={2} required /></label><label className="text-sm font-semibold">Min age<input className="input mt-2" type="number" min="18" max="65" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} required /></label><label className="text-sm font-semibold">Max age<input className="input mt-2" type="number" min="18" max="65" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} required /></label></div>
          <label className="text-sm font-semibold">Gender<select className="input mt-2" value={gender} onChange={(e) => setGender(e.target.value)}><option value="ALL">All</option><option value="MALE">Men</option><option value="FEMALE">Women</option></select></label>
          <label className="text-sm font-semibold lg:col-span-2">Custom Audience for retargeting<select className="input mt-2" value={customAudienceId} onChange={(event) => setCustomAudienceId(event.target.value)}><option value="">Do not use a Custom Audience</option>{customAudiences.map((audience) => <option key={audience.id} value={audience.id}>{audience.name}{audience.subtype ? ` · ${audience.subtype}` : ""}</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-500">Selecting an audience removes interest targeting from this Ad Set.</span></label>
          <div className="lg:col-span-2"><label className="text-sm font-semibold">Interests</label><div className="mt-2 flex gap-2"><input className="input" value={interestQuery} onChange={(e) => setInterestQuery(e.target.value)} placeholder="Search Meta interests" /><button type="button" onClick={searchInterests} className="rounded-xl border border-slate-200 px-4" aria-label="Search interests"><Search className="h-4 w-4" /></button></div>{interestResults.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{interestResults.map((item) => <button type="button" key={item.id} onClick={() => setInterests((current) => current.some((i) => i.id === item.id) ? current : [...current, item])} className="rounded-full border px-3 py-1 text-xs">{item.name}</button>)}</div>}<div className="mt-2 flex flex-wrap gap-2">{interests.map((item) => <button type="button" key={item.id} onClick={() => setInterests((current) => current.filter((i) => i.id !== item.id))} className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">{item.name} ×</button>)}</div></div>
          <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={automaticPlacements} onChange={(e) => setAutomaticPlacements(e.target.checked)} />Use Advantage+ automatic placements</label>
          <div />
          <label className="text-sm font-semibold">Start time (optional)<input className="input mt-2" type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label>
          <label className="text-sm font-semibold">End time {budgetType === "LIFETIME" ? "(required)" : "(optional)"}<input className="input mt-2" type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} required={budgetType === "LIFETIME"} /></label>
          <label className="text-sm font-semibold lg:col-span-2">Public image URL<input className="input mt-2" type="url" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://..." required /></label>
          <label className="text-sm font-semibold lg:col-span-2">Primary text<textarea className="input mt-2 min-h-24" value={primaryText} onChange={(e) => setPrimaryText(e.target.value)} maxLength={2200} required /></label>
          <label className="text-sm font-semibold">Headline<input className="input mt-2" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={255} required /></label>
          <label className="text-sm font-semibold">Description<input className="input mt-2" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={255} /></label>
          <label className="text-sm font-semibold">Destination URL<input className="input mt-2" type="url" value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} required /></label>
          <label className="text-sm font-semibold">Call to action<select className="input mt-2" value={callToAction} onChange={(e) => setCallToAction(e.target.value)}><option value="LEARN_MORE">Learn more</option><option value="SHOP_NOW">Shop now</option><option value="SIGN_UP">Sign up</option><option value="CONTACT_US">Contact us</option><option value="GET_OFFER">Get offer</option></select></label>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm lg:col-span-2"><p className="font-semibold text-blue-950">Review before saving</p><div className="mt-2 grid gap-2 text-xs text-blue-900 sm:grid-cols-3"><span>Mode: {automationMode === "GUARDED" ? "Guarded" : "Assist"}</span><span>Initial Meta status: Paused</span><span>Planned maximum: {estimatedSpend === null ? "Set an end date or limit" : `${estimatedSpend.toLocaleString()} ${selectedAccount?.currency || ""}`}</span></div></div>
          <button disabled={!!busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 lg:col-span-2">{busy === "create" && <Loader2 className="h-4 w-4 animate-spin" />}Save draft only</button>
        </form>
      </details>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Paid campaigns</h2><p className="mt-1 text-xs text-slate-500">Remote campaigns are created paused and require explicit activation.</p></div><button onClick={() => void load()} className="rounded-xl border border-slate-200 p-2" aria-label="Refresh Meta campaigns"><RefreshCw className="h-4 w-4" /></button></div>
        <div className="mt-4 divide-y divide-slate-100">{campaigns.length ? campaigns.map((campaign) => <div key={campaign.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center"><button onClick={() => loadDetail(campaign.id)} className="min-w-0 flex-1 text-left"><p className="truncate font-semibold">{campaign.name}</p><p className="mt-1 text-xs text-slate-500">{campaign.accountName} · {campaign.objective.replace("OUTCOME_", "")} · <span className="font-semibold">{campaign.status}</span>{campaign.effectiveStatus ? ` / ${campaign.effectiveStatus}` : ""}</p>{campaign.sourceCampaignName && <p className="mt-1 text-xs text-blue-600">Brand campaign: {campaign.sourceCampaignName}</p>}{campaign.errorMessage && <p className="mt-1 text-xs text-rose-600">{campaign.errorMessage}</p>}</button><div className="flex flex-wrap gap-2">{["DRAFT", "FAILED"].includes(campaign.status) && <button onClick={() => action(campaign, "publish")} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Create paused</button>}{campaign.status === "NEEDS_RECONCILIATION" && <button onClick={() => action(campaign, "reconcile")} className="rounded-lg border px-3 py-2 text-xs font-semibold">Reconcile</button>}{["REMOTE_PAUSED", "PAUSED"].includes(campaign.status) && <button onClick={() => action(campaign, "activate")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"><Play className="h-3 w-3" />Activate</button>}{campaign.status === "ACTIVE" && <button onClick={() => action(campaign, "pause")} className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white"><Pause className="h-3 w-3" />Pause</button>}{campaign.remoteId && <button onClick={() => action(campaign, "sync")} className="rounded-lg border px-3 py-2 text-xs font-semibold">Sync</button>}{!campaign.remoteId && ["DRAFT", "FAILED"].includes(campaign.status) && <button onClick={() => deleteCampaign(campaign)} aria-label={`Delete ${campaign.name}`} className="rounded-lg border border-rose-200 p-2 text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}</div></div>) : <p className="py-8 text-center text-sm text-slate-500">No paid campaigns yet.</p>}</div>
      </section>

      {detail && <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-soft"><div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-blue-600" /><div><h2 className="font-semibold">{detail.name} performance</h2><p className="text-xs text-slate-500">Paid Ads Analyst uses synchronized Meta Insights only.</p></div></div>
        {detail.validation && <div className={`rounded-2xl border p-4 text-sm ${detail.validation.ready ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}><p className="font-semibold">{detail.validation.ready ? "Ready for paused creation" : "Resolve before creation"}</p>{[...detail.validation.blockingIssues, ...detail.validation.warnings].map((issue) => <p key={issue} className="mt-1 text-xs">{issue}</p>)}</div>}
        <div className="grid gap-3 md:grid-cols-4">{detail.insights.filter((item) => item.entityType === "CAMPAIGN").slice(0, 1).map((item) => <div key={item.entityId} className="contents"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Spend</p><strong>{metric(item.spend)} {campaigns.find((campaign) => campaign.id === detail.id)?.currency || ""}</strong></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Impressions</p><strong>{metric(item.impressions)}</strong></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">CTR</p><strong>{metric(item.ctr, "%")}</strong></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">CPC</p><strong>{metric(item.cpc)}</strong></div></div>)}</div>
        <div><h3 className="text-sm font-semibold">Paid Ads Analyst</h3><div className="mt-2 space-y-2">{detail.recommendations.length ? detail.recommendations.map((recommendation) => <div key={recommendation.id} className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-bold text-blue-600">{recommendation.kind.replaceAll("_", " ")}</p><p className="mt-1 text-sm text-slate-700">{recommendation.rationale}</p><p className="mt-2 text-xs text-slate-500">Evidence: {JSON.stringify(recommendation.evidence)}</p>{recommendation.status === "PENDING" ? <div className="mt-3 flex gap-2"><button onClick={() => decide(recommendation.id, "APPROVED")} className="rounded-lg border px-3 py-1.5 text-xs font-semibold">Approve proposal</button><button onClick={() => decide(recommendation.id, "DISMISSED")} className="px-3 py-1.5 text-xs text-slate-500">Dismiss</button></div> : <p className="mt-2 text-xs font-semibold">{recommendation.status}</p>}</div>) : <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No recommendation yet. Sync after Meta has delivered measurable results.</p>}</div></div>
      </section>}
    </>}
  </div>;
}
