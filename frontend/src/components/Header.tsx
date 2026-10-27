"use client";

import React, { FormEvent, useEffect, useRef, useState } from "react";
import { useSession, signIn, signOut } from "@/lib/session";
import { usePathname, useRouter } from "next/navigation";
import { Search, Plus, LogOut, UserRound } from "lucide-react";
import { useSocialixStore } from "@/lib/store";

export function Header() {
  const { data: session, status } = useSession();
  const { openPostEditor } = useSocialixStore();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [logoutError, setLogoutError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const isMetaAds = pathname.startsWith("/ads");

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    router.push(query.trim() ? `/posts?q=${encodeURIComponent(query.trim())}` : "/posts");
  };

  const getPageInfo = () => {
    if (pathname.startsWith("/posts")) {
      return {
        title: "Posts",
        subtitle: "Drafts, scheduled and published content",
      };
    }
    if (pathname.startsWith("/agents")) {
      return {
        title: "Your team",
        subtitle: "Share an idea and follow its progress",
      };
    }
    if (pathname.startsWith("/campaigns")) {
      return {
        title: "Campaigns",
        subtitle: "Keep your ideas and posts organised",
      };
    }
    if (pathname.startsWith("/accounts")) {
      return {
        title: "Accounts",
        subtitle: "The social channels you publish to",
      };
    }
    if (pathname.startsWith("/calendar")) {
      return {
        title: "Calendar",
        subtitle: "See what's going out and when",
      };
    }
    if (pathname.startsWith("/settings")) {
      return {
        title: "Settings",
        subtitle: "Connections and publishing preferences",
      };
    }
    if (pathname.startsWith("/analytics")) {
      return {
        title: "Analytics",
        subtitle: "See how your posts are doing",
      };
    }
    if (isMetaAds) {
      return {
        title: "Meta Ads",
        subtitle: "Create, monitor and safely optimize paid campaigns",
      };
    }
    if (pathname === "/") {
      return {
        title: "Overview",
        subtitle: "Your campaign, at a glance",
      };
    }
    return {
      title: "Posts",
      subtitle: "Drafts, scheduled and published content",
    };
  };

  const { title, subtitle } = getPageInfo();

  return (
    <header className="h-16 gap-3 px-4 lg:px-8 border-b border-slate-200/80 bg-white/95 backdrop-blur-md flex items-center justify-between sticky top-0 z-40">
      {/* Left Title & Icon matching Screenshot 1 */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-base font-bold text-slate-900 leading-tight">
            {title}
          </h1>
          <p className="hidden xl:block text-xs text-slate-400 leading-none mt-0.5">
            {subtitle}
          </p>
        </div>
      </div>

      {/* Right Actions matching Screenshot 1 */}
      {logoutError && <p role="alert" className="text-xs text-rose-700">{logoutError}</p>}
      <div className="flex items-center gap-3">
        {/* Search Bar */}
        {!isMetaAds && <form onSubmit={submitSearch} className="relative hidden w-56 lg:block">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search posts"
            aria-label="Search posts"
            className="w-full bg-slate-100/90 text-xs text-slate-800 placeholder-slate-400 pl-9 pr-10 py-2 rounded-xl border border-transparent focus:border-blue-500 focus:bg-white focus:outline-none transition"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-2xs">
            Ctrl K
          </kbd>
        </form>}

        {/* Create Post Button matching Screenshot 1 */}
        <button
          onClick={() => isMetaAds ? document.getElementById("meta-campaign-builder")?.scrollIntoView({ behavior: "smooth" }) : openPostEditor(null)}
          aria-label={isMetaAds ? "Create paid campaign" : "Create post"}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{isMetaAds ? "New campaign" : "Create post"}</span>
        </button>

        {/* Profile Avatar Badge matching Screenshot 1 */}
        {status === "authenticated" && session?.user ? (
          <div className="relative">
            <button
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center gap-2 p-0.5 rounded-full hover:ring-2 hover:ring-blue-500/20 transition"
            >
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || session.user.email || "Signed-in user"}
                  className="w-9 h-9 rounded-full object-cover border border-slate-200"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-[#1b4d3e] text-white font-semibold flex items-center justify-center text-sm shadow-sm">
                  {session.user.name?.charAt(0) || session.user.email?.charAt(0) || <UserRound className="h-4 w-4" />}
                </div>
              )}
            </button>

            {/* Profile Dropdown */}
            {isProfileMenuOpen && (
              <>
                {/* Backdrop to dismiss when clicking anywhere */}
                <div
                  className="fixed inset-0 z-40 bg-transparent"
                  onClick={() => setIsProfileMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-60 bg-white rounded-2xl shadow-2xl border border-slate-200/90 p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-3 py-2.5 border-b border-slate-100">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {session.user.name}
                    </p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {session.user.email}
                    </p>
                    <span className="inline-block mt-2 text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200/60">
                      Google Account Active
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      void signOut().catch((error) => setLogoutError(error instanceof Error ? error.message : "Unable to sign out."));
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-xl transition mt-1"
                  >
                    <LogOut className="w-4 h-4 shrink-0" />
                    <span>Sign out</span>
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => signIn("google")}
              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
            >
              Sign in
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
