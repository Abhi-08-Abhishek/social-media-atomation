"use client";

import { useState } from "react";
import { CalendarClock, Clock, Edit3, ExternalLink, Hash, Sparkles, X } from "lucide-react";
import { PostItem, useSocialixStore } from "@/lib/store";
import { calendarDateKey } from "@/lib/timezone";

export function PostInspectorCard({ post, onClose }: { post: PostItem; onClose?: () => void }) {
  const { unschedulePost, openPostEditor, movePostToDate, campaigns, currentCampaignId } = useSocialixStore();
  const timezone = campaigns.find((campaign) => campaign.id === currentCampaignId)?.timezone || "UTC";
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [targetDay, setTargetDay] = useState(calendarDateKey(post.scheduledTime ? new Date(post.scheduledTime) : new Date(), timezone));
  const [error, setError] = useState("");

  const reschedule = async () => {
    try {
      setError("");
      await movePostToDate(post.id, targetDay);
      setShowDatePicker(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to reschedule the post.");
    }
  };

  const unschedule = async () => {
    try {
      setError("");
      await unschedulePost(post.id);
      onClose?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to unschedule the post.");
    }
  };

  return (
    <aside className="flex h-full w-full flex-col space-y-4 rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{post.status}</span>
          {post.isAiGenerated && <span className="flex items-center gap-1 rounded-full border border-violet-100 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700"><Sparkles className="h-3 w-3" />AI</span>}
        </div>
        {onClose && <button onClick={onClose} title="Close panel" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>}
      </div>

      <div>
        <h3 className="text-lg font-bold text-slate-900">{post.title}</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{post.caption}</p>
      </div>

      <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <p className="flex items-center gap-2 font-bold text-slate-800"><Clock className="h-4 w-4" />{post.scheduledTime || "No schedule"}</p>
        <p>Platform: <span className="font-semibold">{post.platform}</span></p>
        <p className="flex items-center gap-2"><Hash className="h-3.5 w-3.5" />{post.hashtags.length} tags</p>
        {post.zernioPostId && <p className="break-all">Zernio ID: {post.zernioPostId}</p>}
        <p>Provider status: {post.publishingStatus || post.blotatoStatus}</p>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => { openPostEditor(post); onClose?.(); }} className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-xs font-semibold hover:bg-slate-50"><Edit3 className="h-3.5 w-3.5" />Edit</button>
        {post.status === "SCHEDULED" && post.zernioPostId && <button onClick={() => setShowDatePicker((value) => !value)} className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-xs font-semibold hover:bg-slate-50"><CalendarClock className="h-3.5 w-3.5" />Reschedule</button>}
      </div>

      {showDatePicker && (
        <div className="flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-3">
          <input aria-label="Publishing date" type="date" value={targetDay} onChange={(event) => setTargetDay(event.target.value)} className="min-w-0 rounded-xl border border-slate-300 px-2 py-1.5 text-center text-xs font-bold" />
          <button onClick={reschedule} className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">Move</button>
        </div>
      )}

      {post.status === "SCHEDULED" && post.zernioPostId && <button onClick={unschedule} className="text-xs font-semibold text-slate-600 hover:text-slate-900">Unschedule and keep as draft</button>}
      {post.liveUrl && <a href={post.liveUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold text-blue-600">Open published post <ExternalLink className="h-3 w-3" /></a>}
    </aside>
  );
}
