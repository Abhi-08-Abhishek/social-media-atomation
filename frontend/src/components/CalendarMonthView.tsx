"use client";

import React, { useState } from "react";
import { useSocialixStore, PostItem } from "@/lib/store";
import { calendarDateKey, timezoneParts } from "@/lib/timezone";

export function CalendarMonthView() {
  const { posts, campaigns, currentCampaignId, setSelectedCalendarPost, movePostToDate } = useSocialixStore();
  const timezone = campaigns.find((campaign) => campaign.id === currentCampaignId)?.timezone || "UTC";
  const [draggingPostId, setDraggingPostId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  const [justMovedDay, setJustMovedDay] = useState<number | null>(null);
  const [error, setError] = useState("");

  const daysOfWeek = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

  const today = timezoneParts(new Date(), timezone);
  const year = today.year;
  const month = today.month - 1;
  const todayDate = today.day;
  const dateKey = (day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const scheduledDates = new Map(posts.filter((post) => post.scheduledTime).map((post) => [post.id, calendarDateKey(new Date(post.scheduledTime!), timezone)]));

  // First day of current month & total days
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDayIndex = (firstDay.getDay() + 6) % 7; // Monday = 0
  const prevMonthDays = new Date(year, month, 0).getDate();

  const calendarDays: { day: number; isCurrentMonth: boolean; isToday?: boolean }[] = [];

  // Trailing previous month days
  for (let i = startDayIndex - 1; i >= 0; i--) {
    calendarDays.push({ day: prevMonthDays - i, isCurrentMonth: false });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push({ day: d, isCurrentMonth: true, isToday: d === todayDate });
  }

  // Leading next month days to complete 7-column rows
  const remaining = (7 - (calendarDays.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    calendarDays.push({ day: d, isCurrentMonth: false });
  }

  const handleDragStart = (e: React.DragEvent, post: PostItem) => {
    e.dataTransfer.setData("text/plain", post.id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingPostId(post.id);
  };

  const handleDragOver = (e: React.DragEvent, day: number, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverDay !== day) {
      setDragOverDay(day);
    }
  };

  const handleDragLeave = (e: React.DragEvent, day: number) => {
    // Only clear if leaving the cell completely
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (dragOverDay === day) {
      setDragOverDay(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, day: number, isCurrentMonth: boolean) => {
    e.preventDefault();
    if (!isCurrentMonth) return;

    const postId = e.dataTransfer.getData("text/plain") || draggingPostId;
    if (postId) {
      try {
        setError("");
        await movePostToDate(postId, dateKey(day));
        setJustMovedDay(day);
        setTimeout(() => setJustMovedDay(null), 2000);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Failed to reschedule the post.");
      }
    }

    setDraggingPostId(null);
    setDragOverDay(null);
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-soft overflow-hidden select-none h-full flex flex-col justify-between">
      {/* Calendar Grid Header */}
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold text-slate-400 text-center py-2.5">
        {daysOfWeek.map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>

      {/* Calendar 35-Day Grid */}
      <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 flex-1 min-h-[580px]">
        {calendarDays.map((cell, idx) => {
          // Dynamic query: get all posts scheduled on this specific day!
          const dayPosts = cell.isCurrentMonth
            ? posts.filter((p) => p.status === "SCHEDULED" && scheduledDates.get(p.id) === dateKey(cell.day))
            : [];

          const isOver = dragOverDay === cell.day && cell.isCurrentMonth;
          const isRecentlyMoved = justMovedDay === cell.day;

          return (
            <div
              key={idx}
              onDragOver={(e) => handleDragOver(e, cell.day, cell.isCurrentMonth)}
              onDragLeave={(e) => handleDragLeave(e, cell.day)}
              onDrop={(e) => handleDrop(e, cell.day, cell.isCurrentMonth)}
              className={`p-2 relative flex flex-col justify-between transition-all duration-150 ${
                !cell.isCurrentMonth
                  ? "bg-slate-50/40 text-slate-300 pointer-events-none"
                  : isOver
                  ? "bg-blue-50/80 ring-2 ring-blue-500 ring-inset"
                  : isRecentlyMoved
                  ? "bg-emerald-50/50 transition-colors duration-500"
                  : "text-slate-700 hover:bg-slate-50/50"
              }`}
            >
              {/* Day Number Header */}
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-semibold w-6 h-6 rounded-full flex items-center justify-center transition ${
                    cell.isToday
                      ? "bg-blue-600 text-white font-bold shadow-xs"
                      : "text-slate-600"
                  }`}
                >
                  {cell.day}
                </span>

                {isOver && (
                  <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">
                    Release
                  </span>
                )}
              </div>

              {/* Day Content / Post Pills */}
              <div className="space-y-1.5 my-1 min-h-[44px] flex flex-col justify-center">
                {dayPosts.map((post) => {
                  const isBeingDragged = draggingPostId === post.id;

                  return (
                    <button
                      type="button"
                      key={post.id}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, post)}
                      onDragEnd={() => {
                        setDraggingPostId(null);
                        setDragOverDay(null);
                      }}
                      onClick={() => setSelectedCalendarPost(post)}
                      className={`w-full text-left min-w-0 p-1.5 rounded-2xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md hover:border-blue-300 transition-all cursor-grab active:cursor-grabbing flex items-center gap-2 group/pill ${
                        isBeingDragged
                          ? "opacity-40 scale-95 border-dashed border-blue-400 shadow-none"
                          : "opacity-100"
                      }`}
                    >
                      {post.imageUrl && /\.(mp4|mov|webm)(\?|$)/i.test(post.imageUrl) ? <span aria-label="Video post" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500">▶</span> : post.imageUrl && <img
                        src={post.imageUrl}
                        alt={post.title}
                        className="w-7 h-7 rounded-lg object-cover shrink-0 pointer-events-none"
                      />}
                      <div className="overflow-hidden pointer-events-none">
                        <p className="text-[10px] font-bold text-slate-800 truncate">
                          {post.title}
                        </p>
                        <p className="text-[9px] text-slate-400">
                          {post.timeSlot || "Time unavailable"} · {post.platform}
                        </p>
                      </div>
                    </button>
                  );
                })}

                {/* Drop Indicator matching Screenshot 30 */}
                {isOver && dayPosts.length === 0 && (
                  <div className="h-10 rounded-2xl border-2 border-dashed border-blue-400 bg-blue-50/70 flex items-center justify-center text-[10px] text-blue-600 font-bold animate-pulse">
                    Drop to reschedule
                  </div>
                )}
              </div>

              {/* Bottom space / helper */}
              <div className="h-1" />
            </div>
          );
        })}
      </div>
      {error && <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}
