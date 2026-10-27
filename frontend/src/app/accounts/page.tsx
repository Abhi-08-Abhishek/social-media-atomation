"use client";

import { apiFetch } from "@/lib/api-client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Link2, Megaphone, RefreshCw, ShieldCheck } from "lucide-react";

interface ConnectedAccount {
  id: string;
  platform: string;
  username: string;
  displayName: string;
  isActive: boolean;
  profilePicture?: string;
  profileUrl?: string;
  followersCount?: number;
}

interface MetaAdAccount {
  id: string;
  localId: string;
  name: string;
  currency: string;
  timezoneName: string;
  status: string;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [metaAccounts, setMetaAccounts] = useState<MetaAdAccount[]>([]);
  const [metaConnected, setMetaConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [metaError, setMetaError] = useState("");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchLiveAccounts = useCallback(async () => {
    setIsLoading(true);
    setError("");
    setMetaError("");
    await Promise.all([
      (async () => {
        try {
          const response = await apiFetch("/api/zernio/accounts", { cache: "no-store" });
          const data = await response.json().catch(() => null);
          if (!response.ok) throw new Error(data?.error || "Failed to load Zernio accounts.");
          if (!Array.isArray(data?.accounts)) throw new Error("Zernio returned an invalid accounts response.");
          setAccounts(data.accounts);
        } catch (caught: any) {
          setAccounts([]);
          setError(caught?.message || "Failed to load Zernio accounts.");
        }
      })(),
      (async () => {
        try {
          const connectionResponse = await apiFetch("/api/meta/connection", { cache: "no-store" });
          const connection = await connectionResponse.json().catch(() => null);
          if (!connectionResponse.ok) throw new Error(connection?.error || "Failed to load your Meta connection.");
          setMetaConnected(Boolean(connection?.connected));
          if (!connection?.connected) {
            setMetaAccounts([]);
            return;
          }
          const response = await apiFetch("/api/meta/ad-accounts", { cache: "no-store" });
          const data = await response.json().catch(() => null);
          if (!response.ok) throw new Error(data?.error || "Failed to load Meta ad accounts.");
          if (!Array.isArray(data?.accounts)) throw new Error("Meta returned an invalid accounts response.");
          setMetaAccounts(data.accounts);
        } catch (caught: any) {
          setMetaAccounts([]);
          setMetaError(caught?.message || "Failed to load Meta ad accounts.");
        }
      })(),
    ]);
    setLastChecked(new Date());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void fetchLiveAccounts();
  }, [fetchLiveAccounts]);

  const connectedAccounts = accounts.filter((account) => account.isActive);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Your social accounts</h2>
          <p className="text-xs text-slate-400">
            {isLoading
              ? "Checking Zernio and Meta Ads..."
              : lastChecked
              ? `${connectedAccounts.length} social account${connectedAccounts.length === 1 ? "" : "s"} · ${metaAccounts.length} Meta ad account${metaAccounts.length === 1 ? "" : "s"} · Checked ${lastChecked.toLocaleTimeString()}`
              : "Connect your accounts in Settings to bring them here."}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="https://zernio.com/dashboard/accounts"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-xs transition"
          >
            <span>Manage in Zernio</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>
          <button
            onClick={() => void fetchLiveAccounts()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-xs font-semibold text-white shadow-xs transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>{isLoading ? "Syncing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      <div
        className={`p-4 rounded-2xl border flex items-center gap-3 ${
          error
            ? "bg-red-50 border-red-200"
            : connectedAccounts.length
            ? "bg-emerald-50 border-emerald-200"
            : "bg-amber-50 border-amber-200"
        }`}
      >
        <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow-xs">
          {error ? <Link2 className="w-5 h-5 text-red-600" /> : <ShieldCheck className="w-5 h-5 text-emerald-600" />}
        </div>
        <div>
          <p className="text-xs font-bold text-slate-900">
            {error ? "Zernio unavailable" : connectedAccounts.length ? "Zernio connected" : "No active social accounts"}
          </p>
          <p className="text-[11px] text-slate-600">
            {error ||
              (connectedAccounts.length
                ? "These accounts are ready to use in your campaigns."
                : "Connect a social account in Zernio, then refresh this page.")}
          </p>
        </div>
      </div>

      {connectedAccounts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {connectedAccounts.map((account) => (
            <div key={account.id} className="p-5 rounded-3xl bg-white border border-blue-200/90 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {account.profilePicture ? (
                    <img
                      src={account.profilePicture}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-11 h-11 rounded-2xl object-cover border border-slate-200"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center text-sm font-black text-slate-600">
                      {account.platform.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-900 text-sm capitalize truncate">{account.platform}</h4>
                    <p className="text-[11px] text-slate-400 truncate">{account.displayName || account.username}</p>
                  </div>
                </div>
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Active
                </span>
              </div>

              <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  {account.profileUrl ? (
                    <a
                      href={account.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 hover:underline font-semibold truncate block"
                    >
                      {account.username || "Open profile"}
                    </a>
                  ) : (
                    <p className="text-xs font-semibold text-slate-700 truncate">{account.username}</p>
                  )}
                  {typeof account.followersCount === "number" && (
                    <p className="text-[11px] text-slate-400">{account.followersCount.toLocaleString()} followers</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : !isLoading ? (
        <div className="p-10 rounded-3xl bg-white border border-slate-200 text-center">
          <p className="text-sm font-bold text-slate-800">No connected accounts to display</p>
          <p className="text-xs text-slate-400 mt-1">The app will not invent account data when Zernio is unavailable.</p>
        </div>
      ) : null}

      <section className="space-y-4 border-t border-slate-200 pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Your Meta Ads account</h3>
            <p className="text-xs text-slate-400">The ad account used to create campaigns and monitor performance.</p>
          </div>
          {metaConnected ? (
            <a href="https://adsmanager.facebook.com/adsmanager/manage/campaigns" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50">
              Manage in Meta Ads <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
            </a>
          ) : (
            <Link href="/settings" className="inline-flex self-start rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700">Connect in Settings</Link>
          )}
        </div>

        <div className={`flex items-center gap-3 rounded-2xl border p-4 ${metaError ? "border-red-200 bg-red-50" : metaConnected ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-xs">
            <Megaphone className={`h-5 w-5 ${metaError ? "text-red-600" : metaConnected ? "text-emerald-600" : "text-amber-600"}`} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-900">{metaError ? "Meta Ads unavailable" : metaConnected ? "Meta Ads connected" : "Meta Ads not connected"}</p>
            <p className="text-[11px] text-slate-600">{metaError || (metaConnected ? "This account is ready to use for paid campaigns." : "Add your ad account ID and access token in Settings.")}</p>
          </div>
        </div>

        {metaAccounts.length > 0 && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {metaAccounts.map((account) => {
              const active = account.status === "1";
              return (
                <div key={account.localId || account.id} className="rounded-3xl border border-blue-200/90 bg-white p-5 shadow-soft">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-xs font-black text-blue-700">META</div>
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-bold text-slate-900">Meta Ads</h4>
                        <p className="truncate text-[11px] text-slate-400">{account.name}</p>
                      </div>
                    </div>
                    <span className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${active ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> {active ? "Active" : `Status ${account.status}`}
                    </span>
                  </div>
                  <div className="mt-4 border-t border-slate-100 pt-3.5">
                    <a href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(account.id)}`} target="_blank" rel="noreferrer" className="block truncate text-xs font-semibold text-blue-600 hover:underline">act_{account.id}</a>
                    <p className="mt-1 text-[11px] text-slate-400">{account.currency} · {account.timezoneName}</p>
                    <Link href="/ads" className="mt-3 inline-flex text-xs font-semibold text-blue-600 hover:underline">Open Meta campaigns</Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
