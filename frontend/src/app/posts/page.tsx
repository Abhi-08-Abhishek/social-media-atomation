"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSocialixStore } from "@/lib/store";
import { PostCard } from "@/components/PostCard";
import { Plus } from "lucide-react";
import { SOCIAL_PLATFORMS } from "@/lib/platforms";

function PostsPageContent() {
  const { posts, openPostEditor } = useSocialixStore();
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = (searchParams.get("q") || "").trim().toLowerCase();
  const requestedStatus = searchParams.get("status") || "ALL";
  const statusFilter = ["SCHEDULED", "DRAFT", "PUBLISHED", "FAILED"].includes(requestedStatus) ? requestedStatus : "ALL";
  const setStatusFilter = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status === "ALL") params.delete("status");
    else params.set("status", status);
    router.replace(`/posts${params.size ? `?${params}` : ""}`, { scroll: false });
  };
  const [platformFilter, setPlatformFilter] = useState<string>("ALL");

  const filteredPosts = posts.filter((post) => {
    const matchesStatus =
      statusFilter === "ALL" || post.status === statusFilter;
    const matchesPlatform =
      platformFilter === "ALL" || post.platform === platformFilter;
    const matchesQuery =
      !query ||
      post.title.toLowerCase().includes(query) ||
      post.caption.toLowerCase().includes(query) ||
      post.hashtags.some((hashtag) => hashtag.toLowerCase().includes(query));
    return matchesStatus && matchesPlatform && matchesQuery;
  });

  const scheduledCount = posts.filter((p) => p.status === "SCHEDULED").length;
  const draftCount = posts.filter((p) => p.status === "DRAFT").length;
  const publishedCount = posts.filter((p) => p.status === "PUBLISHED").length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header matching First Image */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Posts</h2>
          <p className="text-xs text-slate-400">
            Drafts, scheduled and published content
          </p>
        </div>

        {/* Top-Right Platform Actions matching First Image */}
        <div className="flex items-center gap-3">
          {/* Platform Quick Badges */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPlatformFilter(platformFilter === "INSTAGRAM" ? "ALL" : "INSTAGRAM")}
              title="Instagram"
              className={`w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 flex items-center justify-center shadow-xs transition hover:scale-105 ${
                platformFilter === "INSTAGRAM" ? "ring-2 ring-pink-500 ring-offset-2" : "opacity-90 hover:opacity-100"
              }`}
            >
              <svg className="w-4 h-4 text-white fill-none stroke-current stroke-2" viewBox="0 0 24 24">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
            </button>

            <button
              onClick={() => setPlatformFilter(platformFilter === "TIKTOK" ? "ALL" : "TIKTOK")}
              title="TikTok"
              className={`w-8 h-8 rounded-full bg-black flex items-center justify-center shadow-xs transition hover:scale-105 ${
                platformFilter === "TIKTOK" ? "ring-2 ring-black ring-offset-2" : "opacity-90 hover:opacity-100"
              }`}
            >
              <svg className="w-3.5 h-3.5 text-white fill-current" viewBox="0 0 24 24">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.86.12V9.42a6.34 6.34 0 0 0-.86-.06 6.34 6.34 0 1 0 6.34 6.34V9.05a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.48z" />
              </svg>
            </button>

            <button
              onClick={() => setPlatformFilter(platformFilter === "YOUTUBE" ? "ALL" : "YOUTUBE")}
              title="YouTube"
              className={`w-8 h-8 rounded-full bg-[#ff0000] flex items-center justify-center shadow-xs transition hover:scale-105 ${
                platformFilter === "YOUTUBE" ? "ring-2 ring-red-600 ring-offset-2" : "opacity-90 hover:opacity-100"
              }`}
            >
              <svg className="w-4 h-4 text-white fill-current" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
            </button>
          </div>

          <button
            onClick={() => openPostEditor(null)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs matching First Image */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-200/80">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`px-3.5 py-1.5 rounded-full transition ${
              statusFilter === "ALL" ? "bg-slate-900 text-white shadow-xs" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            All <span className="opacity-70 ml-1">{posts.length}</span>
          </button>
          <button
            onClick={() => setStatusFilter("SCHEDULED")}
            className={`px-3.5 py-1.5 rounded-full transition ${
              statusFilter === "SCHEDULED" ? "bg-slate-900 text-white shadow-xs" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Scheduled <span className="opacity-70 ml-1">{scheduledCount}</span>
          </button>
          <button
            onClick={() => setStatusFilter("DRAFT")}
            className={`px-3.5 py-1.5 rounded-full transition ${
              statusFilter === "DRAFT" ? "bg-slate-900 text-white shadow-xs" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Drafts <span className="opacity-70 ml-1">{draftCount}</span>
          </button>
          <button
            onClick={() => setStatusFilter("PUBLISHED")}
            className={`px-3.5 py-1.5 rounded-full transition ${
              statusFilter === "PUBLISHED" ? "bg-slate-900 text-white shadow-xs" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Published <span className="opacity-70 ml-1">{publishedCount}</span>
          </button>
          <button onClick={() => setStatusFilter("FAILED")} className={`rounded-full px-3.5 py-1.5 ${statusFilter === "FAILED" ? "bg-rose-600 text-white" : "text-rose-600"}`}>Needs attention <span className="ml-1">{posts.filter((post) => post.status === "FAILED").length}</span></button>
        </div>

        <select aria-label="Filter posts by platform" value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"><option value="ALL">All platforms</option>{SOCIAL_PLATFORMS.map((platform) => <option key={platform} value={platform}>{platform}</option>)}</select>
        {/* Platform Indicator */}
        {platformFilter !== "ALL" && (
          <button
            onClick={() => setPlatformFilter("ALL")}
            className="text-xs text-blue-600 hover:underline font-semibold"
          >
            Showing {platformFilter.toLowerCase()} only • Clear filter
          </button>
        )}
      </div>

      {/* Post Cards Grid with uniform card heights */}
      {filteredPosts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <div className="p-12 text-center rounded-3xl bg-white border border-slate-200/80 shadow-soft">
          <p className="text-sm font-bold text-slate-800">No posts found</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Try another filter, or create a post to get started.
          </p>
        </div>
      )}
    </div>
  );
}

export default function PostsPage() {
  return (
    <Suspense fallback={null}>
      <PostsPageContent />
    </Suspense>
  );
}
