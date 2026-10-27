"use client";

import React from "react";
import { AgentChat } from "@/components/AgentChat";
import { VirtualOffice } from "@/components/VirtualOffice";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import Link from "next/link";

export default function AgentsPage() {
  return (
    <div className="space-y-3 max-w-7xl mx-auto">
      <WorkflowTimeline />
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left Column: Agent Chat & Task Delegation */}
        <div className="min-w-0 xl:col-span-8">
          <AgentChat />
        </div>

        {/* Right Column: Live Isometric Office */}
        <aside aria-label="Your team and guidance" tabIndex={0} className="min-w-0 space-y-4 rounded-xl xl:col-span-4 xl:h-[calc(100dvh-210px)] xl:min-h-[560px] xl:overflow-y-auto xl:overscroll-contain xl:px-1 xl:pb-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
          <section className="rounded-xl border border-slate-200 bg-white p-3" aria-labelledby="meet-your-team">
            <h3 id="meet-your-team" className="mb-3 px-1 text-sm font-semibold text-slate-800">Meet your team</h3>
            <VirtualOffice />
          </section>
          <div className="rounded-xl border border-white bg-gradient-to-br from-white via-white to-blue-50/70 p-5 shadow-[0_4px_24px_-12px_rgba(30,64,175,0.2)] ring-1 ring-slate-200/80">
            <h4 className="text-sm font-semibold text-slate-800">A little context goes a long way</h4>
            <p className="mt-2 text-xs leading-6 text-slate-500">Tell your team who you’re speaking to, what matters to them, and what the post should achieve.</p>
            <div className="my-4 border-l-2 border-blue-200 pl-3 text-xs leading-6 text-slate-600">“Explain this week’s biggest AI update to small business owners. Keep it practical, with one useful example.”</div>
            <Link href="/settings" className="text-xs font-medium text-blue-600 hover:underline">Set your brand voice →</Link>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5"><h4 className="text-sm font-medium text-slate-800">You set the pace</h4><p className="mt-2 text-xs leading-6 text-slate-500">Scheduling follows your campaign’s approval settings. Check the sources and make the drafts your own before they go out.</p><Link href="/calendar" className="mt-3 inline-block text-xs font-medium text-blue-600 hover:underline">Open your calendar →</Link></div>
        </aside>
      </div>
    </div>
  );
}
