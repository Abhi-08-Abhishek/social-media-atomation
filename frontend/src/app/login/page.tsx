"use client";

import React, { useEffect } from "react";
import { signIn, useSession } from "@/lib/session";
import { useRouter } from "next/navigation";
import { Sparkles, ShieldCheck, Zap, Bot, Calendar, Image as ImageIcon } from "lucide-react";

export default function LoginPage() {
  const { data: session, status, error } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [router, status]);
  if (status === "authenticated") return null;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/50 p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200/80 p-8 space-y-8 relative overflow-hidden">
        {/* Glow backdrop accent */}
        <div className="absolute -top-16 -right-16 w-40 h-40 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Brand header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto shadow-md shadow-blue-500/20">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Socialix
          </h1>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            A little help with your next great post.
          </p>
        </div>

        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        {/* Feature Highlights */}
        <div className="space-y-2.5 p-4 rounded-2xl bg-slate-50 border border-slate-100 text-xs text-slate-700">
          <div className="flex items-center gap-2.5">
            <Bot className="w-4 h-4 text-purple-600 shrink-0" />
            <span>Turn your ideas into drafts with help from AI</span>
          </div>
          <div className="flex items-center gap-2.5">
            <ImageIcon className="w-4 h-4 text-pink-600 shrink-0" />
            <span>Edit your images and captions in one place</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Plan and schedule posts across your social accounts</span>
          </div>
        </div>

        {/* Google Authentication Button */}
        <div className="space-y-3">
          <button
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl bg-white hover:bg-slate-50 text-slate-800 text-sm font-bold border border-slate-300 shadow-sm hover:shadow transition duration-150 active:scale-98"
          >
            {/* Google Vector Icon */}
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <p className="text-[11px] text-center text-slate-400">
            Sign in to open your workspace. Connect your social accounts when you're ready.
          </p>
        </div>
      </div>
    </div>
  );
}
