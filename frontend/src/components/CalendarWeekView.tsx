"use client";

import React, { useState } from "react";
import { useSocialixStore, PostItem } from "@/lib/store";
import { calendarDateKey, timezoneParts } from "@/lib/timezone";

export function CalendarWeekView() {
  const { posts, campaigns, currentCampaignId, selectedCalendarPost, setSelectedCalendarPost, movePostToDate } =
    useSocialixStore();
  const timezone = campaigns.find((campaign) => campaign.id === currentCampaignId)?.timezone || "UTC";
  const [draggingPostId, setDraggingPostId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  const hours = Array.from({ length: 24 }, (_, hour) => `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`);
  const scheduledDates = new Map(posts.filter((post) => post.scheduledTime).map((post) => {
    const date = new Date(post.scheduledTime!);
    return [post.id, { key: calendarDateKey(date, timezone), hour: timezoneParts(date, timezone).hour }];
  }));

  const today = timezoneParts(new Date(), timezone);
  const now = new Date(today.year, today.month - 1, today.day, today.hour);
  const currentDayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(now);
  monday.setDate(now.getDate() - currentDayOfWeek);

  const dayLabels = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const days = dayLabels.map((label, idx) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + idx);
    const dateNum = d.getDate();
    const isToday = d.toDateString() === now.toDateString();
    return {
      label,
      date: dateNum,
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      isToday,
    };
  });

  const handleDragStart = (e: React.DragEvent, post: PostItem) => {
    e.dataTransfer.setData("text/plain", post.id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingPostId(post.id);
  };

  const handleDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverKey !== key) {
      setDragOverKey(key);
    }
  };

  const handleDrop = async (e: React.DragEvent, date: string, hour: string) => {
    e.preventDefault();
    const postId = e.dataTransfer.getData("text/plain") || draggingPostId;
    if (postId) {
      try {
        setError("");
        await movePostToDate(postId, date, hour);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Failed to reschedule the post.");
      }
    }
    setDraggingPostId(null);
    setDragOverKey(null);
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-soft overflow-hidden select-none h-full flex flex-col justify-between">
      {/* Week Header Days matching Image 1 */}
      <div className="grid grid-cols-8 border-b border-slate-100 bg-slate-50/40 py-3 text-center text-xs font-semibold">
        <div className="text-slate-400 font-normal">Time</div>
        {days.map((d) => {
          const dayPostsCount = posts.filter(
            (p) => p.status === "SCHEDULED" && scheduledDates.get(p.id)?.key === d.key
          ).length;

          return (
            <div key={d.date} className="flex flex-col items-center">
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-700 font-bold">
                  {d.date}
                </span>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">
                  {d.label}
                </span>
              </div>
              {d.isToday ? (
                <span className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs mt-1 shadow-xs">
                  {d.date}
                </span>
              ) : (
                <div className="h-4 mt-0.5">
                  {dayPostsCount > 0 && (
                    <span className="text-[10px] text-slate-400 font-medium">
                      {dayPostsCount} {dayPostsCount === 1 ? "post" : "posts"}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Hourly Timeline Grid */}
      <div className="relative divide-y divide-slate-100 flex-1 max-h-[640px] overflow-y-auto">
        {hours.map((hour, hourIndex) => (
          <div
            key={hour}
            className="grid grid-cols-8 h-20 divide-x divide-slate-100 relative group"
          >
            {/* Hour Label */}
            <div className="px-3 py-2 text-[11px] text-slate-400 font-medium">
              {hour}
            </div>

            {/* 7 Day Slots for this Hour */}
            {days.map((d) => {
              const slotKey = `${d.date}_${hour}`;
              const isOver = dragOverKey === slotKey;

              // Find posts scheduled for this day and hour
              const slotPosts = posts.filter((p) => {
                if (p.status !== "SCHEDULED") return false;
                const scheduled = scheduledDates.get(p.id);
                return scheduled?.key === d.key && scheduled.hour === hourIndex;
              });

              return (
                <div
                  key={slotKey}
                  onDragOver={(e) => handleDragOver(e, slotKey)}
                  onDragLeave={() => {
                    if (dragOverKey === slotKey) setDragOverKey(null);
                  }}
                  onDrop={(e) => handleDrop(e, d.key, hour)}
                  className={`p-1.5 relative transition-colors ${
                    "bg-white"
                  } ${
                    isOver
                      ? "bg-blue-50/80 ring-2 ring-blue-500 ring-inset"
                      : "hover:bg-slate-50/60"
                  }`}
                >
                  {d.isToday && hour === now.toLocaleTimeString("en-US", { hour: "numeric" }) && (
                    <div className="absolute top-1/2 left-0 right-0 flex items-center z-20 pointer-events-none">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-xs -ml-1" />
                      <div className="h-[2px] bg-red-500/80 flex-1" />
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {slotPosts.map((post) => {
                      const isBeingDragged = draggingPostId === post.id;
                      const isSelected = selectedCalendarPost?.id === post.id;

                      return (
                        <button
                          type="button"
                          key={post.id}
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, post)}
                          onDragEnd={() => {
                            setDraggingPostId(null);
                            setDragOverKey(null);
                          }}
                          onClick={() => setSelectedCalendarPost(post)}
                          className={`p-1 rounded-xl bg-white border transition-all cursor-pointer flex items-center gap-1.5 z-10 ${
                            isSelected
                              ? "border-blue-500 ring-2 ring-blue-500 shadow-sm"
                              : "border-slate-200/90 hover:border-blue-300 hover:shadow-xs"
                          } ${
                            isBeingDragged
                              ? "opacity-40 scale-95 border-dashed border-blue-400"
                              : "opacity-100"
                          }`}
                        >
                          {post.imageUrl && /\.(mp4|mov|webm)(\?|$)/i.test(post.imageUrl) ? <span aria-label="Video post" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500">▶</span> : post.imageUrl && <img
                            src={post.imageUrl}
                            alt={post.title}
                            className="w-7 h-7 rounded-lg object-cover shrink-0 pointer-events-none"
                          />}
                          <div className="overflow-hidden pointer-events-none pr-1">
                            <p className="text-[10px] font-bold text-slate-800 truncate max-w-[40px]">
                              {post.title.slice(0, 3)}...
                            </p>
                            <p className="text-[9px] text-slate-400">
                              {hour.slice(0, 1)}...
                            </p>
                          </div>
                          <span className="text-[8px] font-bold text-slate-500">{post.platform.slice(0, 2)}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Drop Placeholder */}
                  {isOver && slotPosts.length === 0 && (
                    <div className="h-full rounded-xl border-2 border-dashed border-blue-400 bg-blue-50/70 flex items-center justify-center text-[9px] text-blue-600 font-bold animate-pulse">
                      Drop here
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {error && <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}
