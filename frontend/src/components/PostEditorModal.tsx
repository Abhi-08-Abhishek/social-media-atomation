"use client";

import { apiFetch } from "@/lib/api-client";
import { useEffect, useRef, useState } from "react";
import {
  Calendar,
  Wand2,
  X,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { useSession } from "@/lib/session";
import { useSocialixStore, SocialPlatform } from "@/lib/store";
import { InstagramPreview } from "./InstagramPreview";
import { qualityReviewSchema, type QualityReview } from "@/lib/content-policy";

type PostFormat = "" | "Reel" | "Carousel" | "Single Post";

function fieldsForSchedule(value: string | null, timezone: string) {
  if (!value) return { date: "", time: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

export function PostEditorModal() {
  const { data: session } = useSession();
  const {
    isPostEditorOpen,
    closePostEditor,
    selectedPostForEdit,
    unschedulePost,
    openImageKitModal,
    campaigns,
    currentCampaignId,
    loadCampaign,
  } = useSocialixStore();

  const campaign = campaigns.find((item) => item.id === currentCampaignId);
  const [platform, setPlatform] = useState<SocialPlatform | "">("");

  const userHandle = (session?.user?.name || session?.user?.email?.split("@")[0] || "")
    .toLowerCase()
    .replace(/\s+/g, "_");

  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [format, setFormat] = useState<PostFormat>("");
  const [imageUrl, setImageUrl] = useState("");
  const [extraImages, setExtraImages] = useState("");
  const [requestId, setRequestId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [customCaptionPrompt, setCustomCaptionPrompt] = useState("");
  const [showCaptionAiMenu, setShowCaptionAiMenu] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isRecreatingCaption, setIsRecreatingCaption] = useState(false);
  const [isRegeneratingImage, setIsRegeneratingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [quality, setQuality] = useState<QualityReview | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [visualHeadline, setVisualHeadline] = useState("");
  const [visualSummary, setVisualSummary] = useState("");
  const [mobileView, setMobileView] = useState<"write" | "preview">("write");
  const [previewSlide, setPreviewSlide] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const busy = isSaving || isGenerating || isRecreatingCaption || isRegeneratingImage || feedbackBusy;

  useEffect(() => {
    if (isPostEditorOpen) dialogRef.current?.showModal();
  }, [isPostEditorOpen]);

  useEffect(() => {
    if (!isPostEditorOpen) return;
    setRequestId(crypto.randomUUID());
    setMobileView("write");
    setPreviewSlide(0);
    setPlatform(selectedPostForEdit?.platform || campaign?.platforms[0] || "");
    setTitle(selectedPostForEdit?.title || "");
    setCaption(selectedPostForEdit?.caption || "");
    setHashtags(selectedPostForEdit?.hashtags.join(", ") || "");
    setFormat(selectedPostForEdit?.format || "Single Post");
    setImageUrl(selectedPostForEdit?.imageUrl || "");
    setQuality(qualityReviewSchema.safeParse(selectedPostForEdit?.qualityReview).data || null);
    setVisualHeadline((selectedPostForEdit?.title || "").slice(0, 80));
    setVisualSummary("");
    setFeedbackMessage("");
    setExtraImages(selectedPostForEdit?.mediaUrls?.slice(1).join("\n") || "");

    const tz = campaign?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const schedule = fieldsForSchedule(selectedPostForEdit?.scheduledTime || null, tz);

    let initialDate = schedule.date;
    if (!initialDate) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(tomorrow);
      const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
      initialDate = `${part("year")}-${part("month")}-${part("day")}`;
    }

    let initialTime = schedule.time;
    if (!initialTime) {
      const slot = selectedPostForEdit?.timeSlot || "10:00 AM";
      const match = slot.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
      if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = match[2] || "00";
        const ampm = match[3]?.toUpperCase();
        if (ampm === "PM" && hours < 12) hours += 12;
        if (ampm === "AM" && hours === 12) hours = 0;
        initialTime = `${String(hours).padStart(2, "0")}:${minutes}`;
      } else {
        initialTime = "10:00";
      }
    }

    setScheduledDate(initialDate);
    setScheduledTime(initialTime);
    setAiPrompt("");
    setCustomCaptionPrompt("");
    setShowCaptionAiMenu(false);
    setError("");
  }, [campaign?.timezone, isPostEditorOpen, selectedPostForEdit]);

  if (!isPostEditorOpen) return null;
  const tags = hashtags.split(",").map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean);
  const previewImages = [imageUrl, ...(format === "Carousel" ? extraImages.split("\n").map((url) => url.trim()).filter(Boolean) : [])].filter(Boolean);
  const visibleSlide = Math.min(previewSlide, Math.max(0, previewImages.length - 1));

  /** Recreate caption using SenseNova LLM */
  const recreateCaption = async (instruction?: string) => {
    if (!title.trim() && !caption.trim()) {
      setError("Please ensure there is a title or caption draft to recreate.");
      return;
    }
    setIsRecreatingCaption(true);
    setError("");
    try {
      const response = await apiFetch("/api/ai/recreate-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: currentCampaignId,
          title: title.trim() || "Social Media Post",
          currentCaption: caption,
          platform: platform || "INSTAGRAM",
          instruction:
            instruction ||
            customCaptionPrompt ||
            "Make this clearer and more specific. Preserve sources, facts and uncertainty. Avoid hype and engagement bait.",
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Couldn't rewrite the caption. Please try again.");
      if (data.caption) setCaption(data.caption);
      if (Array.isArray(data.hashtags)) {
        setHashtags(data.hashtags.join(", "));
      }
      setCustomCaptionPrompt("");
      setShowCaptionAiMenu(false);
      setQuality({ status: "needs_review", issues: ["The caption was rewritten. Review its facts and sources before scheduling."], sourceUrls: quality?.sourceUrls || [], checkedAt: new Date().toISOString(), revisions: 0 });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Caption recreation failed.");
    } finally {
      setIsRecreatingCaption(false);
    }
  };

  /** Render the campaign's branded image template. */
  const regenerateImage = async () => {
    setIsRegeneratingImage(true);
    setError("");
    try {
      const response = await apiFetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: currentCampaignId,
          title: visualHeadline.trim(),
          caption: visualSummary.trim(),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.imageUrl) throw new Error(data?.error || "Failed to generate image.");
      setImageUrl(data.imageUrl);
      setQuality({ status: "needs_review", issues: ["Review the new image and its text before scheduling."], sourceUrls: quality?.sourceUrls || [], checkedAt: new Date().toISOString(), revisions: 0 });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Image generation failed.");
    } finally {
      setIsRegeneratingImage(false);
    }
  };

  /** Generate whole post from prompt (ONLY for Create Post, not Edit Post) */
  const generateWholePost = async () => {
    if (!aiPrompt.trim()) {
      setError("Enter your content prompt.");
      return;
    }
    if (!platform) {
      setError("A new post requires a campaign with one publishing platform.");
      return;
    }
    setIsGenerating(true);
    setError("");
    try {
      const response = await apiFetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: currentCampaignId, prompt: aiPrompt, platform, format: format || undefined }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "AI generation failed.");
      setTitle(data.title);
      setCaption(data.caption);
      setHashtags(data.hashtags.join(", "));
      setImageUrl(data.imageUrl || "");
      setFormat(data.format || "Single Post");
      setExtraImages(data.mediaUrls?.slice(1).join("\n") || "");
      setVisualHeadline(data.visualHeadline || data.title.slice(0, 80));
      setVisualSummary(data.visualSummary || "");
      setQuality(qualityReviewSchema.safeParse(data.qualityReview).data || null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "AI generation failed.");
    } finally {
      setIsGenerating(false);
    }
  };


  const sendFeedback = async (reason: string) => {
    if (!selectedPostForEdit) return;
    setFeedbackBusy(true); setFeedbackMessage(""); setError("");
    try {
      const response = await apiFetch(`/api/posts/${encodeURIComponent(selectedPostForEdit.id)}/feedback`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setFeedbackMessage("Saved. Future drafts will use this feedback; this draft stays in review.");
      setQuality({ status: "needs_review", issues: [reason], sourceUrls: quality?.sourceUrls || [], checkedAt: new Date().toISOString(), revisions: 0 });
      await loadCampaign(currentCampaignId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save feedback."); }
    finally { setFeedbackBusy(false); }
  };

  const save = async (draft: boolean) => {
    if (isGenerating || isRecreatingCaption || isRegeneratingImage || feedbackBusy) return setError("Wait for the current edit to finish before saving.");
    if (!campaign) return setError("Select an active campaign first.");
    if (!title.trim() || !caption.trim() || !format) {
      return setError("Title, caption, and format are required.");
    }
    if (!platform) return setError("A new post requires a campaign with one publishing platform.");
    if (!draft && selectedPostForEdit?.zernioPostId &&
      (imageUrl !== (selectedPostForEdit.imageUrl || "") || format !== selectedPostForEdit.format ||
       extraImages !== (selectedPostForEdit.mediaUrls?.slice(1).join("\n") || ""))) {
      return setError("Unschedule this post before changing its media or format.");
    }
    if (!draft && (!scheduledDate || !scheduledTime)) return setError("Choose a date and time.");
    if (previewImages.some((url) => !/^https?:\/\//i.test(url))) {
      return setError("Media must use a public HTTP or HTTPS URL, including saved drafts.");
    }

    setIsSaving(true);
    setError("");
    try {
      if (draft && selectedPostForEdit?.zernioPostId) await unschedulePost(selectedPostForEdit.id);
      const body = {
        campaignId: campaign.id,
        postId: selectedPostForEdit?.id,
        title: title.trim(),
        caption: caption.trim(),
        hashtags: tags,
        platform,
        format,
        mediaUrls: imageUrl ? [imageUrl, ...(format === "Carousel" ? extraImages.split("\n").map((url) => url.trim()).filter(Boolean) : [])] : [],
        isAiGenerated: Boolean(aiPrompt || selectedPostForEdit?.isAiGenerated),
        ...(quality ? { qualityReview: quality } : {}),
        ...(!draft ? {
          requestId,
          localPostId: selectedPostForEdit?.id,
          scheduledAt: `${scheduledDate}T${scheduledTime}:00`,
          timezone: campaign.timezone,
        } : {}),
      };
      const response = await apiFetch(draft ? "/api/posts" : "/api/zernio/schedule", {
        method: !draft && selectedPostForEdit?.zernioPostId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          !draft && selectedPostForEdit?.zernioPostId
            ? {
                postId: selectedPostForEdit.zernioPostId,
                title: body.title,
                caption: body.caption,
                hashtags: body.hashtags,
                scheduledFor: body.scheduledAt,
                timezone: body.timezone,
              }
            : body
        ),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || (draft ? "Failed to save draft." : "Failed to schedule post."));
      await loadCampaign(campaign.id);
      closePostEditor();
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : "Failed to save post.";
      if (msg.includes("Failed to validate Instagram image") || msg.includes("bad status code: 400")) {
        setError(
          "Instagram couldn't read this image. Create a new branded image or attach a public image URL before scheduling."
        );
      } else {
        setError(msg);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <dialog ref={dialogRef} aria-labelledby="post-editor-title" onCancel={(event) => { event.preventDefault(); if (!busy) closePostEditor(); }} className="fixed inset-0 m-0 flex h-dvh max-h-none w-screen max-w-none items-center justify-center border-0 bg-slate-900/40 p-2 backdrop:bg-transparent sm:p-6">
      <div className="flex h-[90dvh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-7">
          <div>
            <h3 id="post-editor-title" className="text-lg font-semibold tracking-tight text-slate-900">{selectedPostForEdit ? "Edit post" : "Create post"}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{campaign?.name || "Your campaign"} · Make it sound like you.</p>
          </div>
          <button disabled={busy} onClick={closePostEditor} aria-label="Close post editor" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex border-b border-slate-200 px-5 md:hidden" aria-label="Editor view">
          {(["write", "preview"] as const).map((view) => <button key={view} type="button" aria-pressed={mobileView === view} onClick={() => setMobileView(view)} className={`px-4 py-3 text-sm font-medium ${mobileView === view ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500"}`}>{view === "write" ? "Write" : "Preview"}</button>)}
        </div>
        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_380px] lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className={`${mobileView === "write" ? "block" : "hidden"} space-y-6 overflow-y-auto p-5 md:block sm:p-7`}>
            {quality && <details open={quality.status !== "passed"} className={`rounded-lg border p-3 text-xs ${quality.status === "passed" ? "border-slate-200 text-slate-600" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
              <summary className="cursor-pointer font-medium">{quality.status === "passed" ? "Editorial checks passed · View sources" : "A few things to check before publishing"}</summary>
              <p className="mt-1">Checks apply to the generated or saved version, not unsaved edits. They do not guarantee factual accuracy.</p>
              {!!quality.issues.length && <ul className="mt-2 list-disc space-y-1 pl-4">{quality.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
              {!!quality.sourceUrls.length && <div className="mt-2 flex flex-wrap gap-2">{quality.sourceUrls.map((url) => <a key={url} href={/^https?:\/\//i.test(url) ? url : undefined} target="_blank" rel="noreferrer" className="underline">{new URL(url).hostname}</a>)}</div>}
            </details>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1"><span className="text-xs font-medium text-slate-700">Publish to</span><select value={platform} disabled={!!selectedPostForEdit?.zernioPostId} onChange={(event) => setPlatform(event.target.value as SocialPlatform)} className="input">{campaign?.platforms.map((value) => <option key={value} value={value}>{value === "YOUTUBE" ? "YouTube" : value === "LINKEDIN" ? "LinkedIn" : value === "TIKTOK" ? "TikTok" : value.charAt(0) + value.slice(1).toLowerCase()}</option>)}</select></label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-700">Format</span>
                <select value={format} onChange={(e) => setFormat(e.target.value as PostFormat)} className="input">
                  <option value="">Choose format</option>
                  <option value="Reel">Reel / video</option>
                  <option value="Carousel">Carousel</option>
                  <option value="Single Post">Single post</option>
                </select>
              </label>
            </div>
            {!selectedPostForEdit && (
              <details className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <summary className="cursor-pointer text-sm font-medium text-slate-800">Start with an idea</summary>
                <p className="mt-2 text-xs leading-5 text-slate-500">Tell us the topic, audience, and takeaway. We’ll research it and prepare the selected format in English. Reels use local narration and designed text scenes; review the result before publishing.</p>
                <label className="mt-3 block"><span className="sr-only">Your post idea</span><textarea rows={3} value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder="For example: Explain this week’s most useful AI update for small business owners, with one practical example." className="input" /></label>
                <button type="button" onClick={generateWholePost} disabled={isGenerating || isSaving} className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">{isGenerating ? "Researching and writing…" : title || caption ? "Replace with a new draft" : "Prepare a draft"}</button>
              </details>
            )}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-800">Post heading</span>
              <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Give readers a reason to stop scrolling" className="input" />
              <span className="block text-xs text-slate-500">Published above your caption.</span>
            </label>
            {format === "Carousel" && <label className="block space-y-1"><span className="text-xs font-bold text-slate-700">Additional image URLs, one per line</span><textarea value={extraImages} onChange={(event) => setExtraImages(event.target.value)} rows={3} className="input" /></label>}

            {/* Caption with LLM Assistant */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="post-caption" className="text-sm font-medium text-slate-800">Caption</label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowCaptionAiMenu(!showCaptionAiMenu)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium"
                    aria-expanded={showCaptionAiMenu}
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>{isRecreatingCaption ? "Rewriting…" : "Writing help"}</span>
                  </button>
                </div>
              </div>

              {/* Quick LLM Caption Presets */}
              {showCaptionAiMenu && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                  <p className="font-medium text-slate-700">What would you like to change?</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={isRecreatingCaption}
                      onClick={() => recreateCaption("Make the caption shorter and more specific. Preserve factual meaning, qualifications and source links.")}
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700"
                    >
                      <span>Shorter & clearer</span>
                    </button>
                    <button
                      type="button"
                      disabled={isRecreatingCaption}
                      onClick={() => recreateCaption("Add one practical next step only if it helps this audience. No engagement bait.")}
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700"
                    >
                      <span>Add a useful next step</span>
                    </button>
                    <button
                      type="button"
                      disabled={isRecreatingCaption}
                      onClick={() => recreateCaption("Use the campaign's voice and approved examples. Do not invent expertise or personal experience.")}
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700"
                    >
                      <span>Match our voice</span>
                    </button>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <input
                      value={customCaptionPrompt}
                      onChange={(e) => setCustomCaptionPrompt(e.target.value)}
                      placeholder="What would you change? Try “make it shorter” or “add a little humour”"
                      className="input text-xs py-1.5 flex-1 bg-white"
                      onKeyDown={(e) => e.key === "Enter" && recreateCaption()}
                    />
                    <button
                      type="button"
                      disabled={isRecreatingCaption}
                      onClick={() => recreateCaption()}
                      className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-medium hover:bg-slate-900 shrink-0"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}

              <textarea
                id="post-caption"
                rows={7}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="input leading-relaxed"
                placeholder="What’s worth sharing? Start with the useful part."
              />
              <p className="text-right text-xs tabular-nums text-slate-400">{caption.length.toLocaleString()} characters</p>
            </div>
            <label className="block space-y-1.5"><span className="text-xs font-medium text-slate-700">Hashtags <span className="font-normal text-slate-400">(optional)</span></span><input value={hashtags} onChange={(event) => setHashtags(event.target.value)} placeholder="Separate with commas" className="input" /></label>

            {/* Media URL and Safe AI Image Generation */}
            <section className="space-y-3 border-t border-slate-200 pt-5">
              <h4 className="text-sm font-medium text-slate-800">Media</h4>
              <p className="text-xs leading-5 text-slate-500">{selectedPostForEdit?.zernioPostId ? "To change the media, move this post back to drafts first." : format === "Reel" ? "Prepare an editorial Reel from your idea above, or add a public video URL. Local narration requires the Windows render host." : "Add an image link, or create an image using your brand’s colours and layout."}</p>
              <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-semibold">Branded image text</summary>
                <label className="mt-3 block text-xs">Image headline<input maxLength={80} className="input mt-1" value={visualHeadline} onChange={(event) => setVisualHeadline(event.target.value)} /></label>
                <label className="mt-3 block text-xs">Short supporting text<textarea maxLength={160} rows={2} className="input mt-1" value={visualSummary} onChange={(event) => setVisualSummary(event.target.value)} /></label>
                <p className="mt-2 text-xs text-slate-500">Uses the colour and layout in Settings → Content & brand guidance.</p>
              </details>
              <div className="block space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="post-media-url" className="text-xs font-medium text-slate-700">Public media URL</label>
                  <button
                    type="button"
                    onClick={() => regenerateImage()}
                    disabled={busy || !!selectedPostForEdit?.zernioPostId}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRegeneratingImage ? "animate-spin" : ""}`} />
                    <span>{isRegeneratingImage ? "Preparing…" : "Create branded image"}</span>
                  </button>
                </div>
                <input
                  id="post-media-url"
                  type="url"
                  value={/^https?:\/\//i.test(imageUrl) ? imageUrl : ""}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="input"
                />
              </div>

              {imageUrl && !selectedPostForEdit?.zernioPostId && !/\.(mp4|mov|webm)(\?|$)/i.test(imageUrl) && (
                <button
                  type="button"
                  onClick={() => openImageKitModal({ imageUrl }, (url) => setImageUrl(url))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <span>Edit image</span>
                </button>
              )}
            </section>

            {/* Date and Time Scheduling */}
            <section className="border-t border-slate-200 pt-5">
            <h4 className="mb-1 text-sm font-medium text-slate-800">When should it go out?</h4>
            <p className="mb-3 text-xs text-slate-500">Only scheduled when you choose Schedule post. Drafts stay private.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-700">Date</span>
                <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="input" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-700">Time</span>
                <input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} className="input" />
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-500">Timezone: {campaign?.timezone || "UTC"}</p>
            </section>

            {/* Error Display */}
            {selectedPostForEdit && !selectedPostForEdit.zernioPostId && <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-semibold">Help improve future drafts</summary><p className="my-2 text-xs text-slate-500">What needs work? This saves feedback and pauses automatic scheduling for this run.</p><div className="flex flex-wrap gap-2">{["Too generic", "Wrong tone", "Facts need checking", "Image needs work"].map((reason) => <button key={reason} type="button" disabled={feedbackBusy} onClick={() => sendFeedback(reason)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-50">{reason}</button>)}</div>{feedbackMessage && <p role="status" className="mt-2 text-xs text-emerald-700">{feedbackMessage}</p>}</details>}
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 p-3.5 text-xs font-medium text-red-700 border border-red-200">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Instagram Feed Live Preview */}
          <div className={`${mobileView === "preview" ? "block" : "hidden"} overflow-y-auto border-l border-slate-200 bg-[#f5f6f8] p-5 md:block sm:p-7`}>
            <div className="mb-5 flex items-center justify-between"><h4 className="text-sm font-medium text-slate-700">Post preview</h4><span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-500">{platform || "Choose a channel"}</span></div>
            {/\.(mp4|mov|webm)(\?|$)/i.test(imageUrl) ? <><video controls preload="metadata" src={imageUrl} className="w-full rounded-lg" aria-label="Post video preview" /><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{title}{"\n\n"}{caption}</p></> : <InstagramPreview imageUrl={previewImages[visibleSlide] || ""} caption={[title, caption].filter(Boolean).join("\n\n")} hashtags={tags} handle={userHandle} />}
            {format === "Carousel" && previewImages.length > 1 && <div className="mt-3 flex items-center justify-between text-xs"><button type="button" onClick={() => setPreviewSlide(visibleSlide - 1)} disabled={visibleSlide === 0} className="rounded-lg border border-slate-200 bg-white px-3 py-2 disabled:opacity-40">Previous slide</button><span aria-live="polite">{visibleSlide + 1} / {previewImages.length}</span><button type="button" onClick={() => setPreviewSlide(visibleSlide + 1)} disabled={visibleSlide === previewImages.length - 1} className="rounded-lg border border-slate-200 bg-white px-3 py-2 disabled:opacity-40">Next slide</button></div>}
            <p className="mx-auto mt-4 max-w-xs text-center text-xs leading-5 text-slate-400">A guide to your content, not an exact platform preview. Final cropping and layout may differ.</p>
          </div>
        </div>

        {/* Modal Footer */}
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3 sm:px-7">
          <span className="mr-auto hidden text-xs text-slate-400 sm:block">Changes aren’t saved until you’re ready.</span>
          <button
            type="button"
            disabled={isSaving || isGenerating || isRecreatingCaption || isRegeneratingImage || feedbackBusy}
            onClick={() => save(true)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-40"
          >
            {selectedPostForEdit?.zernioPostId ? "Move to drafts" : "Save draft"}
          </button>
          <button
            type="button"
            disabled={isSaving || isGenerating || isRecreatingCaption || isRegeneratingImage || feedbackBusy}
            onClick={() => save(false)}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40 shadow-xs"
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>{isSaving ? "Saving…" : selectedPostForEdit?.zernioPostId ? "Save schedule" : "Schedule post"}</span>
          </button>
        </footer>
      </div>
    </dialog>
  );
}
