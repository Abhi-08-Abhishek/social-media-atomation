"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session";
import { useSocialixStore } from "@/lib/store";
import { Sparkles, ArrowRight, Flame, Calendar, ChevronRight, FileText } from "lucide-react";
import { VirtualOffice } from "@/components/VirtualOffice";
import { WorkspaceActions } from "@/components/WorkspaceActions";

export default function OverviewPage() {
  const { data: session } = useSession();
  const { campaigns, currentCampaignId, posts, plans, loadCampaign, openPostEditor } = useSocialixStore();

  const currentCampaign = campaigns.find((c) => c.id === currentCampaignId);
  const userName = session?.user?.name?.split(" ")[0] || session?.user?.email;

  // Auto-sync active campaign data whenever the overview page is visible
  useEffect(() => {
    if (currentCampaignId) {
      void loadCampaign(currentCampaignId);
    }
  }, [currentCampaignId, loadCampaign]);

  const targetCount = Math.max(1, posts.length, currentCampaign?.postCount || 0);
  const publishedPosts = posts.filter((p) => p.status === "PUBLISHED");
  const scheduledPosts = posts.filter((p) => p.status === "SCHEDULED");
  const draftPosts = posts.filter((p) => p.status === "DRAFT");
  const activePlan = plans[0];

  const displayProgress = Math.round(publishedPosts.length / targetCount * 100);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <WorkspaceActions />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Greeting, Master Agent CTA, Progress, Upcoming Posts */}
        <div className="lg:col-span-6 space-y-5">
          {/* Greeting */}
          <div className="space-y-1">
            <div className="text-slate-500 font-medium text-sm">
              <span>Welcome back{userName ? `, ${userName}` : ""}.</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 leading-tight">
              Let’s work on your next post.
            </h1>
            <p className="text-xs text-slate-500 leading-relaxed max-w-md">
              Pick up a draft, check your schedule, or start with a new idea.
            </p>
          </div>

          {/* Master Agent Banner Card */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-500/20 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1">
                  <span>Have something in mind?</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                  Tell your team what you’d like to post about.
                </p>
              </div>
            </div>

            <Link
              href="/agents"
              className="flex items-center gap-1 px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm shadow-blue-500/20 transition shrink-0"
            >
              <span>Share an idea</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Active Campaign Progress Card */}
          <div className="px-4 py-3 rounded-2xl bg-white border border-slate-200/80 shadow-soft space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-500/10 text-orange-600 flex items-center justify-center shrink-0">
                  <Flame className="w-5 h-5 fill-orange-500" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-bold text-slate-900 text-sm">
                      {currentCampaign?.name || "No active campaign"}
                    </h4>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        activePlan?.status === "failed"
                          ? "text-rose-700 bg-rose-50 border-rose-200"
                          : publishedPosts.length > 0
                          ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                          : scheduledPosts.length > 0
                          ? "text-blue-700 bg-blue-50 border-blue-200"
                          : draftPosts.length > 0
                          ? "text-amber-700 bg-amber-50 border-amber-200"
                          : activePlan?.status === "in_progress"
                          ? "text-violet-700 bg-violet-50 border-violet-200"
                          : "text-slate-600 bg-slate-50 border-slate-200"
                      }`}
                    >
                      ●{" "}
                      {activePlan?.status === "failed"
                        ? "Needs attention"
                        : publishedPosts.length > 0
                        ? "Published"
                        : scheduledPosts.length > 0
                        ? "Scheduled"
                        : draftPosts.length > 0
                        ? "Drafts in review"
                        : activePlan?.status === "in_progress"
                        ? "AI working"
                        : currentCampaign
                        ? "In progress"
                        : "Ready"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {currentCampaign
                      ? `${draftPosts.length} drafts · ${scheduledPosts.length} scheduled · ${publishedPosts.length} published`
                      : "Create a campaign to get started."}
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-2xl font-black text-slate-900 leading-none">
                  {currentCampaign ? `${displayProgress}%` : "—"}
                </span>
                <p className="text-[10px] text-slate-400 font-medium">Published</p>
              </div>
            </div>

            {/* Gradient Progress Bar */}
            <div className="space-y-1.5">
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 to-purple-600 transition-all duration-500"
                  style={{ width: `${displayProgress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>
                  {publishedPosts.length > 0
                    ? `${publishedPosts.length} of ${targetCount} posts published`
                    : scheduledPosts.length > 0
                    ? `${scheduledPosts.length} of ${targetCount} posts scheduled`
                    : draftPosts.length > 0
                    ? `${draftPosts.length} of ${targetCount} posts drafted (review required)`
                    : activePlan?.status === "failed"
                    ? "Workflow paused — a step needs attention"
                    : activePlan
                    ? `AI agents creating content (${activePlan.progressPercent}%)`
                    : `0 of ${targetCount} posts created`}
                </span>
                <span className="font-semibold text-slate-500">
                  {scheduledPosts.length > 0 && `${scheduledPosts.length} scheduled`}
                  {draftPosts.length > 0 && !scheduledPosts.length && `${draftPosts.length} in review`}
                </span>
              </div>
            </div>
          </div>

          {/* Upcoming Posts Card */}
          <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-soft space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 text-sm">Upcoming posts</h4>
              <Link
                href="/calendar"
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <span>View calendar</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {scheduledPosts.length > 0 ? (
              scheduledPosts.slice(0, 3).map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => openPostEditor(post)}
                  className="w-full text-left flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-slate-100/60 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex flex-col items-center justify-center shrink-0">
                      <span className="text-[9px] uppercase font-bold text-slate-400">DAY</span>
                      <span className="text-sm font-black text-slate-800 leading-none">
                        {post.calendarDay || 1}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800 truncate max-w-[200px]">
                        {post.title}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        <span className="text-pink-600 font-semibold">{post.platform}</span> •{" "}
                        {post.scheduledTime || "Scheduled"}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              ))
            ) : draftPosts.length > 0 ? (
              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/70 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 line-clamp-1">{draftPosts[0].title}</p>
                    <p className="text-[11px] text-amber-700 font-medium">Draft created • Ready for your review & schedule</p>
                  </div>
                </div>
                <Link
                  href="/posts?status=DRAFT"
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition shrink-0"
                >
                  Approve & Schedule &rarr;
                </Link>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-center">
                <p className="text-xs font-semibold text-slate-700">No upcoming posts scheduled</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Your scheduled posts will appear here.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: 2.5D Isometric Virtual Office */}
        <div className="lg:col-span-6 space-y-2">
          <VirtualOffice />
          <p className="text-[11px] text-slate-400 text-center">
            Meet the AI team behind your posts. Select a teammate to see their work.
          </p>
        </div>
      </div>
    </div>
  );
}
