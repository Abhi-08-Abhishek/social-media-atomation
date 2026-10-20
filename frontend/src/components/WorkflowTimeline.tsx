"use client";

import { apiFetch } from "@/lib/api-client";
import { useState } from "react";
import Link from "next/link";
import { Check, Clock3, Loader2, RotateCw, ArrowRight, AlertCircle } from "lucide-react";
import { useSocialixStore } from "@/lib/store";
import { currentWorkflowStage } from "@/lib/workflow-progress";

const stageLabels = {
  MASTER: "Planning", RESEARCH: "Research", CREATOR: "Content",
  SCHEDULER: "Scheduling", ANALYTICS: "Analytics", STRATEGIST: "Recommendations",
};
const statusLabels = {
  in_progress: "In progress", awaiting_approval: "Awaiting your approval",
  waiting_for_metrics: "Waiting for results", completed: "Completed", failed: "Needs attention",
};

export function WorkflowTimeline() {
  const { plans, currentCampaignId, loadCampaign } = useSocialixStore();
  const plan = plans[0];
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");
  if (!plan) return null;
  const tasks = [...plan.tasks].sort((a, b) => a.order - b.order);
  const activeIndex = currentWorkflowStage(plan.status, tasks);
  const completed = tasks.filter((task) => task.status === "done").length;
  const retry = async () => {
    setRetrying(true); setError("");
    try {
      const response = await apiFetch("/api/agents/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, retry: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await loadCampaign(currentCampaignId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Retry failed."); }
    finally { setRetrying(false); }
  };
  return <section className="rounded-xl border border-slate-200 bg-white px-3 py-2" aria-label="Campaign workflow">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="flex min-w-0 items-center gap-3"><h2 className="shrink-0 text-xs font-semibold text-slate-800">Your team at work</h2><p title={plan.title} className="hidden max-w-xs truncate text-[11px] text-slate-400 lg:block">{plan.title}</p></div>
      <div className="flex items-center gap-3" role="status">
        <span className="text-[11px] text-slate-500">{completed} of {tasks.length} done</span>
        <span className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium ${plan.status === "in_progress" ? "bg-blue-50 text-blue-700" : plan.status === "failed" ? "bg-rose-50 text-rose-700" : plan.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {plan.status === "in_progress" && <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />}
          {statusLabels[plan.status]}
        </span>
      </div>
    </div>
    <div tabIndex={0} role="region" aria-label="Workflow stages — scroll to see all steps" className="overflow-x-auto">
    <ol className="flex min-w-[660px] items-center gap-2 py-1">
      {tasks.map((task, index) => {
        const done = task.status === "done";
        const failed = task.status === "failed";
        const active = index === activeIndex;
        const running = active && (plan.status === "in_progress" || task.status === "running") && plan.status !== "failed" && !failed;
        const waiting = active && (plan.status === "awaiting_approval" || plan.status === "waiting_for_metrics");
        const label = done ? "Complete" : failed ? "Needs attention" : running ? task.status === "running" ? "In progress" : "Up next" : waiting ? plan.status === "awaiting_approval" ? "Review drafts" : "Awaiting metrics" : "Pending";
        return <li key={task.id} title={`${stageLabels[task.assignedAgent]}: ${label}`} aria-current={active ? "step" : undefined} className="flex min-w-0 flex-1 items-center gap-1.5">
          <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-500 ${done ? "border-emerald-500 bg-emerald-500 text-white" : failed ? "border-rose-300 bg-rose-50 text-rose-600" : running ? "border-blue-500 bg-blue-50 text-blue-600 ring-2 ring-blue-50" : waiting ? "border-amber-400 bg-amber-50 text-amber-600" : "border-slate-200 bg-white text-slate-400"}`}>
            {done ? <Check className="h-4 w-4" strokeWidth={3} /> : failed ? <AlertCircle className="h-4 w-4" /> : running ? <Loader2 className="h-4 w-4 animate-spin" /> : waiting ? <Clock3 className="h-4 w-4" /> : <span className="text-xs font-semibold">{index + 1}</span>}
          </span>
          <span className={`whitespace-nowrap text-[11px] font-medium ${active ? "text-slate-900" : "text-slate-500"}`}>{stageLabels[task.assignedAgent]}<span className="sr-only">: {label}</span></span>
          {index < tasks.length - 1 && <span aria-hidden="true" className={`ml-1 h-px min-w-2 flex-1 ${done ? "bg-emerald-300" : "bg-slate-200"}`} />}
        </li>;
      })}
    </ol>
    </div>
    {plan.status === "awaiting_approval" && <Link href="/posts?status=DRAFT" className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-blue-600">Your drafts are ready to review <ArrowRight className="h-3 w-3" /></Link>}
    {plan.status === "failed" && <div className="mt-2 flex items-start justify-between gap-3 border-t border-slate-100 pt-2"><details className="min-w-0 text-xs text-rose-700"><summary className="cursor-pointer py-1">A step needs a closer look</summary><p className="mt-1 break-words">{plan.errorMessage || "We couldn't finish this step. Try again or review your post."}</p></details><button onClick={retry} disabled={retrying} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold disabled:opacity-50"><RotateCw className="h-3 w-3" />{retrying ? "Trying again…" : "Try again"}</button></div>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
  </section>;
}
