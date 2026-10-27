"use client";

import { apiFetch } from "@/lib/api-client";
import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, Check, ChevronDown, Flame, Globe, Heart, Leaf, Loader2, Megaphone, Rocket, Sparkles, Star, X } from "lucide-react";
import { useSocialixStore } from "@/lib/store";
import { SOCIAL_PLATFORMS, IMAGE_PLATFORMS } from "@/lib/platforms";
import Link from "next/link";

const logos = [
  { id: "rocket", icon: Rocket }, { id: "sparkles", icon: Sparkles },
  { id: "megaphone", icon: Megaphone }, { id: "leaf", icon: Leaf },
  { id: "fire", icon: Flame }, { id: "star", icon: Star },
  { id: "heart", icon: Heart }, { id: "camera", icon: Camera }, { id: "globe", icon: Globe },
];

interface Account {
  id: string;
  platform: string;
  username: string;
  displayName: string;
  isActive: boolean;
}

export function CreateCampaignModal() {
  const isOpen = useSocialixStore((state) => state.isCreateCampaignModalOpen);
  const close = useSocialixStore((state) => state.closeCreateCampaignModal);
  const createCampaign = useSocialixStore((state) => state.createCampaign);
  const [step, setStep] = useState<1 | 2>(1);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [logo, setLogo] = useState("");
  const [officeTheme, setOfficeTheme] = useState<"" | "modern" | "wooden">("");
  const [brandDescription, setBrandDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [postCount, setPostCount] = useState("");
  const [approvalMode, setApprovalMode] = useState<"REVIEW" | "AUTO">("REVIEW");
  const [objective, setObjective] = useState<"REACH" | "ENGAGEMENT" | "VIDEO_VIEWS">("REACH");
  const [optimizationEnabled] = useState(true);
  const [timezone, setTimezone] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setStep(1);
    setAccounts([]);
    setIsLoadingAccounts(true);
    setSelectedAccounts([]);
    setName("");
    setLogo("");
    setOfficeTheme("");
    setBrandDescription("");
    setTargetAudience("");
    setPostCount("");
    setApprovalMode("REVIEW");
    setObjective("REACH");
    setTimezone(detectedTimezone);
    setError("");
    void apiFetch("/api/zernio/accounts", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || "Failed to load publishing accounts.");
        if (!Array.isArray(data?.accounts)) throw new Error("Publishing account response is invalid.");
        setAccounts(data.accounts.filter((account: Account) => account.isActive && SOCIAL_PLATFORMS.includes(account.platform as never)));
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Failed to load publishing accounts."))
      .finally(() => setIsLoadingAccounts(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!logo || !timezone || !postCount || !selectedAccounts.length) {
      setError("Complete the required settings and select at least one publishing account.");
      return;
    }
    if (step === 1) {
      setError("");
      setStep(2);
      return;
    }
    if (!officeTheme) {
      setError("Choose an office theme for this campaign.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      await createCampaign({
        name, logo, officeTheme, brandDescription, targetAudience,
        socialAccountIds: selectedAccounts, timezone,
        postCount: Number(postCount), approvalMode, objective, optimizationEnabled,
      });
      setStep(1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to create campaign.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 sm:p-6">
      <form role="dialog" aria-modal="true" aria-labelledby="create-campaign-title" onSubmit={submit} className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <h2 id="create-campaign-title" className="text-xl font-bold tracking-tight text-slate-950">Create campaign</h2>
            <p className="mt-1 text-xs text-slate-500">Set the essentials, then choose your office.</p>
          </div>
          <button type="button" onClick={close} aria-label="Close campaign form" className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </header>
        <nav aria-label="Campaign setup" className="flex shrink-0 items-center justify-center border-b border-slate-200 px-5 py-3 text-xs sm:px-6 bg-slate-50/50">
          <div className="flex w-full max-w-sm sm:max-w-md items-center justify-center gap-3">
            <div className={`flex items-center gap-2 font-semibold ${step === 1 ? "text-slate-950" : "text-slate-500"}`}>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                {step === 2 ? <Check className="h-3.5 w-3.5" /> : "1"}
              </span>
              <span>Campaign</span>
            </div>
            <span className="h-px flex-1 bg-slate-200 min-w-[60px]" />
            <div className={`flex items-center gap-2 font-semibold ${step === 2 ? "text-slate-950" : "text-slate-400"}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${step === 2 ? "bg-blue-600 text-white" : "border border-slate-300 bg-white"}`}>
                2
              </span>
              <span>Office space</span>
            </div>
          </div>
        </nav>
        <main className="min-h-0 flex-1 overflow-y-auto bg-slate-50">

        {step === 1 ? (
          <div className="space-y-4 p-4 sm:p-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div><h3 className="text-base font-black text-slate-900">Campaign essentials</h3><p className="mt-1 text-xs text-slate-500">A short setup for publishing and scheduling.</p></div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Campaign name"><input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Name your campaign" className="input !bg-white" /></Field>
                <Field label="Posts per request"><input required min="1" max="20" type="number" value={postCount} onChange={(event) => setPostCount(event.target.value)} placeholder="How many posts?" className="input !bg-white" /></Field>
                <Field label="Primary objective" wide><select value={objective} onChange={(event) => setObjective(event.target.value as typeof objective)} className="input !bg-white"><option value="REACH">Reach more people</option><option value="ENGAGEMENT">Increase engagement</option><option value="VIDEO_VIEWS">Increase video views</option></select></Field>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="mb-4"><h3 className="text-sm font-black text-slate-900">Choose a campaign icon</h3><p className="mt-1 text-xs text-slate-500">This helps you spot the campaign across your workspace.</p></div>
              <div className="flex flex-wrap gap-2.5">
                {logos.map(({ id, icon: Icon }) => (
                  <button key={id} type="button" onClick={() => setLogo(id)} aria-label={`Use ${id} campaign icon`} aria-pressed={logo === id} className={`flex h-10 w-10 items-center justify-center rounded-xl border transition ${logo === id ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-700"}`}><Icon className="h-4 w-4" /></button>
                ))}
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div><h3 className="text-sm font-black text-slate-900">Publishing accounts</h3><p className="mt-1 text-xs text-slate-500">Select where this campaign is allowed to publish.</p></div>
                {!!selectedAccounts.length && <span className="text-[11px] font-semibold text-slate-500">{selectedAccounts.length} selected</span>}
              </div>
              {isLoadingAccounts ? (
                <div className="grid gap-3 sm:grid-cols-2"><div className="h-16 animate-pulse rounded-2xl bg-slate-100" /><div className="h-16 animate-pulse rounded-2xl bg-slate-100" /></div>
              ) : accounts.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {accounts.map((account) => {
                    const isSelected = selectedAccounts.includes(account.id);
                    return (
                      <label key={account.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3.5 transition ${isSelected ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-blue-300"}`}>
                        <input type="checkbox" checked={isSelected} onChange={(event) => setSelectedAccounts((current) => event.target.checked ? [...current, account.id] : current.filter((id) => id !== account.id))} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-[10px] font-black text-white">{account.platform.slice(0, 2).toUpperCase()}</span>
                        <span className="min-w-0 text-xs"><strong className="block truncate text-slate-900">{account.displayName || account.username}</strong><span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">{account.platform}</span></span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">No active publishing accounts found. <Link href="/settings" onClick={close} className="font-semibold text-blue-600 underline">Connect your Zernio key</Link> before creating a campaign.</p>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h3 className="text-sm font-bold">Publishing approval</h3>
              <p className="mt-1 text-xs text-slate-500">Your prompt cannot override this setting.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(["REVIEW", "AUTO"] as const).map((mode) => <label key={mode} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${approvalMode === mode ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}><input type="radio" name="approvalMode" value={mode} checked={approvalMode === mode} onChange={() => setApprovalMode(mode)} className="mt-1" /><span className="text-sm font-semibold">{mode === "REVIEW" ? "Review first" : "Automatic scheduling"}<span className="mt-1 block text-xs font-normal text-slate-500">{mode === "REVIEW" ? "Approve each draft before it is scheduled." : "Allow generated image posts to be scheduled without another approval."}</span></span></label>)}
              </div>
              {accounts.some((account) => selectedAccounts.includes(account.id) && !IMAGE_PLATFORMS.includes(account.platform as never)) && <p className="mt-3 text-xs text-amber-700">TikTok and YouTube need your video asset. These campaigns always stop for review.</p>}
              <label className="mt-4 block text-xs font-semibold">Publishing timezone<input value={timezone} onChange={(event) => setTimezone(event.target.value)} required className="input mt-2" /></label>
            </section>
            <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 marker:hidden sm:p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Sparkles className="h-4 w-4" /></span>
                  <div><h3 className="text-sm font-semibold text-slate-900">A little about your brand</h3><p className="mt-0.5 text-xs text-slate-500">Optional. You can share more when you write your brief.</p></div>
                </div>
                <ChevronDown className="h-5 w-5 text-slate-400 transition group-open:rotate-180" />
              </summary>
              <div className="grid gap-4 border-t border-slate-100 bg-slate-50/60 p-5 md:grid-cols-2 sm:p-6">
                <Field label="Brand context" hint="Optional" wide><textarea rows={3} maxLength={4000} value={brandDescription} onChange={(event) => setBrandDescription(event.target.value)} placeholder="What should the agents know about your brand?" className="input !bg-white" /></Field>
                <Field label="Target audience" hint="Optional" wide><textarea rows={2} maxLength={2000} value={targetAudience} onChange={(event) => setTargetAudience(event.target.value)} placeholder="Who are you creating for?" className="input !bg-white" /></Field>
              </div>
            </details>
          </div>
        ) : (
          <div className="p-4 sm:p-5">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div><h3 className="text-xl font-bold tracking-tight text-slate-950">Choose an office space</h3><p className="mt-1 text-xs text-slate-500">Pick where your AI agents will work.</p></div>
              <span className="hidden max-w-44 truncate text-xs font-semibold text-slate-500 sm:block">{name}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                { id: "modern", label: "Modern Office", description: "Bright, focused and minimal", image: "/modern-office.png" },
                { id: "wooden", label: "Wooden Office", description: "Warm, creative and welcoming", image: "/wooden-office.png" },
              ] as const).map((theme) => {
                const isSelected = officeTheme === theme.id;
                return (
                  <button key={theme.id} type="button" aria-pressed={isSelected} onClick={() => { setOfficeTheme(theme.id); setError(""); }} className={`overflow-hidden rounded-2xl border bg-white p-1.5 text-left transition ${isSelected ? "border-blue-600 ring-1 ring-blue-600" : "border-slate-200 hover:border-slate-400"}`}>
                    <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-slate-100">
                      <Image src={theme.image} alt={`${theme.label} preview`} fill sizes="(min-width: 640px) 340px, 90vw" className="object-cover" />
                      {isSelected && <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white"><Check className="h-4 w-4" /></span>}
                    </div>
                    <span className="flex items-center justify-between gap-3 px-2.5 py-2.5">
                      <span><strong className="block text-sm text-slate-900">{theme.label}</strong><span className="mt-0.5 block text-xs text-slate-500">{theme.description}</span></span>
                      <span className={`h-3 w-3 shrink-0 rounded-full border-2 ${isSelected ? "border-blue-600 bg-blue-600" : "border-slate-300"}`} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
          {error && <p role="alert" className="mx-4 mb-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 sm:mx-7">{error}</p>}
        </main>
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
          {step === 2 ? (
            <button type="button" onClick={() => { setError(""); setStep(1); }} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100"><ArrowLeft className="h-4 w-4" /> Back</button>
          ) : (
            <span className="hidden text-xs font-medium text-slate-400 sm:block">Step 1 of 2</span>
          )}
          <div className="ml-auto flex gap-2.5">
            <button type="button" onClick={close} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={isSubmitting || isLoadingAccounts || !accounts.length} className="inline-flex min-w-32 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
              {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</> : step === 1 ? <>Continue <ArrowRight className="h-4 w-4" /></> : <><Sparkles className="h-4 w-4" /> Create campaign</>}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`space-y-1.5 ${wide ? "md:col-span-2" : ""}`}><span className="flex items-center justify-between gap-3 text-xs font-bold text-slate-700">{label}{hint && <span className="font-medium text-slate-400">{hint}</span>}</span>{children}</label>;
}
