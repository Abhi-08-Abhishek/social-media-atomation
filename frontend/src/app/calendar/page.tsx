"use client";

import React from "react";
import { useSocialixStore } from "@/lib/store";
import { CalendarMonthView } from "@/components/CalendarMonthView";
import { CalendarWeekView } from "@/components/CalendarWeekView";
import { PostInspectorCard } from "@/components/PostDrawer";
import {
  Plus,
  Calendar as CalendarIcon,
  Clock,
  Globe,
} from "lucide-react";

export default function CalendarPage() {
  const {
    calendarView,
    setCalendarView,
    openPostEditor,
    posts,
    selectedCalendarPost,
    setSelectedCalendarPost,
    campaigns,
    currentCampaignId,
  } = useSocialixStore();

  const scheduledCount = posts.filter((p) => p.status === "SCHEDULED").length;
  const campaignTimezone = campaigns.find((campaign) => campaign.id === currentCampaignId)?.timezone;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header Bar: Scheduled count + View Switcher + Channels + Timezone */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: • 2 scheduled this week + View Switcher */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-200/60">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
              {scheduledCount} scheduled
            </span>
            <span className="text-xs text-slate-400 font-medium">total</span>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setCalendarView("week")}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg transition ${
                calendarView === "week"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Week view</span>
            </button>
            <button
              onClick={() => setCalendarView("month")}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg transition ${
                calendarView === "month"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Month view</span>
            </button>
          </div>
        </div>

        {/* Right: Social Channels Circle Icons + Timezone pill */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-700 bg-white border border-slate-200/90 shadow-2xs px-3 py-1.5 rounded-xl">
            <Globe className="w-3.5 h-3.5 text-slate-400" />
            <span>{campaignTimezone || "No campaign timezone"}</span>
          </div>

          {/* Create Post Button */}
          <button
            onClick={() => openPostEditor(null)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Create post</span>
          </button>
        </div>
      </div>

      {/* Main Calendar + Right Sidebar Layout: Exact Same Height Top & Bottom */}
      <div className="flex flex-col lg:flex-row gap-6 items-stretch">
        {/* Left: Calendar View */}
        <div className="flex-1 min-w-0 w-full h-full flex flex-col">
          {calendarView === "month" ? (
            <CalendarMonthView />
          ) : (
            <CalendarWeekView />
          )}
        </div>

        {/* Right: Dedicated Rounded Post Inspector Sidebar: Aligned Height with Calendar */}
        {selectedCalendarPost && (
          <div className="w-full lg:w-[380px] xl:w-[410px] shrink-0 animate-in fade-in duration-150 h-full flex flex-col">
            <PostInspectorCard
              key={`${selectedCalendarPost.id}-${selectedCalendarPost.scheduledTime}`}
              post={selectedCalendarPost}
              onClose={() => setSelectedCalendarPost(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
