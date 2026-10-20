"use client";

import React, { useState } from "react";
import { PostItem, useSocialixStore } from "@/lib/store";
import { MoreHorizontal, Clock, Sparkles, ExternalLink, Edit3, Trash2, Image as ImageIcon, Calendar } from "lucide-react";

export function PostCard({ post }: { post: PostItem }) {
  const { openPostEditor, openImageKitModal, unschedulePost, campaigns, currentCampaignId } = useSocialixStore();
  const timezone = campaigns.find((campaign) => campaign.id === currentCampaignId)?.timezone;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [error, setError] = useState("");
  const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(post.imageUrl || "");

  const getStatusBadge = () => {
    switch (post.status) {
      case "FAILED":
        return <span className="rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white">Needs attention</span>;
      case "SCHEDULED":
        return (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full bg-blue-600 text-white shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            Scheduled
          </span>
        );
      case "PUBLISHED":
        return (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full bg-emerald-600 text-white shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            Published
          </span>
        );
      case "DRAFT":
        return (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full bg-slate-600 text-white shadow-xs">
            {post.qualityReview?.status === "needs_review" ? "Quality review needed" : "Draft"}
          </span>
        );
    }
  };

  return (
    <div className="w-full bg-white rounded-3xl border border-slate-200/90 shadow-soft overflow-hidden flex flex-col justify-between h-[410px] hover:shadow-card transition duration-200 group">
      <div>
        {/* Fixed landscape thumbnail height matching First Image */}
        <div
          className="relative w-full h-[212px] bg-slate-100 overflow-hidden cursor-pointer shrink-0"
          onClick={() => post.imageUrl && (isVideo || post.format === "Carousel" ? openPostEditor(post) : openImageKitModal(post))}
        >
          {post.imageUrl && isVideo ? <video src={post.imageUrl} muted playsInline preload="metadata" aria-label={post.title} className="h-full w-full object-contain" /> : post.imageUrl ? (
            <img
              src={post.imageUrl}
              alt={post.title}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-102 transition duration-300"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-300 gap-2">
              <ImageIcon className="w-8 h-8 stroke-[1.5]" />
              <span className="text-[11px] font-medium text-slate-400">No media asset</span>
            </div>
          )}

          {/* Top-Left Status Badge */}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            {getStatusBadge()}
          </div>

          <div className="absolute right-3 top-3 rounded-full bg-slate-900/85 px-2 py-1 text-[9px] font-bold text-white shadow-md">
            {post.platform}
          </div>

          {/* Hover hint */}
          {post.imageUrl && (
            <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-semibold gap-1.5">
              <Sparkles className="w-4 h-4 text-purple-300" />
              <span>{isVideo ? "Review video" : post.format === "Carousel" ? "Review slides" : "Edit image"}</span>
            </div>
          )}
        </div>

        {/* Content details */}
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between relative">
            <h4
              onClick={() => openPostEditor(post)}
              className="font-bold text-slate-900 text-sm truncate pr-2 cursor-pointer hover:text-blue-600 transition"
              title={post.title}
            >
              {post.title}
            </h4>

            {/* Context menu button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label={`Actions for ${post.title}`}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {/* Context Menu Dropdown */}
            {isMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 z-30">
                <button
                  onClick={() => {
                    openPostEditor(post);
                    setIsMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-xl"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{post.status === "DRAFT" ? "Approve & Schedule" : "Edit & reschedule"}</span>
                </button>
                <button
                  onClick={() => {
                    openPostEditor(post);
                    setIsMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-xl"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit details</span>
                </button>
                {post.status === "SCHEDULED" && post.zernioPostId && (
                  <button
                    onClick={async () => {
                      setIsMenuOpen(false);
                      setError("");
                      try {
                        await unschedulePost(post.id);
                      } catch (reason) {
                        setError(reason instanceof Error ? reason.message : "Failed to unschedule the post.");
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-xl"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Unschedule</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <p
            onClick={() => openPostEditor(post)}
            className="text-xs text-slate-500 line-clamp-2 leading-relaxed cursor-pointer hover:text-slate-700"
          >
            {post.caption}
          </p>

          {error && <p className="text-[11px] font-medium text-red-600">{error}</p>}

          {/* Zernio publishing status with Instagram gradient dot */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium pt-0.5">
            <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 shrink-0 inline-block" />
            <span>{post.publishingStatus || post.blotatoStatus || (post.status === "DRAFT" ? "Ready for review" : "Queued")}</span>
          </div>
        </div>
      </div>

      {/* Footer bar */}
      <div className="px-4 py-3 bg-white border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 shrink-0">
        {post.status === "DRAFT" || post.status === "FAILED" ? (
          <button
            type="button"
            onClick={() => openPostEditor(post)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{post.status === "FAILED" ? "Review issue" : "Approve & Schedule"}</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 font-medium text-slate-600">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{post.scheduledTime ? new Date(post.scheduledTime).toLocaleString(undefined, { timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : post.timeSlot || "Scheduled"}{timezone && <span className="block text-[10px] text-slate-400">{timezone}</span>}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          {post.liveUrl && (
            <a
              href={post.liveUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline flex items-center gap-1 font-semibold"
            >
              <span>Live</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {post.isAiGenerated && (
            <span className="px-2 py-0.5 rounded-full bg-[#f5f3ff] text-[#7c3aed] font-bold text-[11px] border border-[#ede9fe] flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              AI
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
