"use client";

import { apiFetch } from "@/lib/api-client";
import { useEffect, useRef, useState } from "react";
import { RotateCcw, Loader2, Undo2, X } from "lucide-react";
import type { ImageKitTransformType } from "@/lib/imagekit";
import { useSocialixStore } from "@/lib/store";

const OPERATIONS: { type: ImageKitTransformType; label: string }[] = [
  { type: "remove_bg", label: "Remove background" },
  { type: "cutout_shadow", label: "Cutout + shadow" },
  { type: "upscale", label: "Upscale" },
  { type: "retouch", label: "Retouch" },
  { type: "variation", label: "Create variation" },
];

export function ImageKitModal() {
  const {
    isImageKitModalOpen, closeImageKitModal, imageEditorSource: selectedPostForEdit, applyEditedImage,
    currentCampaignId, loadCampaign,
  } = useSocialixStore();
  const [history, setHistory] = useState<string[]>([]);
  const [currentImage, setCurrentImage] = useState("");
  const [prompt, setPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [showOriginal, setShowOriginal] = useState(false);
  const [failedImage, setFailedImage] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (isImageKitModalOpen) dialogRef.current?.showModal();
  }, [isImageKitModalOpen]);

  useEffect(() => {
    if (selectedPostForEdit?.imageUrl) {
      setCurrentImage(selectedPostForEdit.imageUrl);
      setHistory([selectedPostForEdit.imageUrl]);
      setPrompt("");
      setError("");
      setShowOriginal(false);
      setFailedImage("");
    }
  }, [selectedPostForEdit]);

  if (!isImageKitModalOpen || !selectedPostForEdit) return null;

  const applyTransform = async (transformation: ImageKitTransformType) => {
    if ((transformation === "prompt_edit" || transformation === "change_bg") && !prompt.trim()) {
      setError("Enter an edit prompt first.");
      return;
    }
    setIsProcessing(true);
    setError("");
    try {
      const response = await apiFetch("/api/imagekit/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          srcUrl: currentImage,
          transformation,
          ...(transformation === "prompt_edit" ? { prompt: prompt.trim() } : {}),
          ...(transformation === "change_bg" ? { bgPrompt: prompt.trim() } : {}),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.transformedUrl) throw new Error(data?.error || "ImageKit transform failed.");
      setCurrentImage(data.transformedUrl);
      setHistory((items) => [...items, data.transformedUrl]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ImageKit transform failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const undo = () => {
    if (history.length <= 1) return;
    const next = history.slice(0, -1);
    setHistory(next);
    setCurrentImage(next[next.length - 1]);
  };

  const save = async () => {
    if (!currentImage || failedImage === currentImage) {
      setError("This image could not be loaded. Undo the edit or try again before saving.");
      return;
    }
    if (applyEditedImage) {
      applyEditedImage(currentImage);
      closeImageKitModal();
      return;
    }
    if (!selectedPostForEdit.id || selectedPostForEdit.zernioPostId) {
      setError("Move this post back to drafts before changing its image.");
      return;
    }
    setIsProcessing(true);
    setError("");
    try {
      const response = await apiFetch(`/api/posts/${encodeURIComponent(selectedPostForEdit.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaUrl: currentImage }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Failed to save transformed media.");
      await loadCampaign(currentCampaignId);
      closeImageKitModal();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to save transformed media.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <dialog ref={dialogRef} aria-labelledby="image-editor-title" onCancel={(event) => { event.preventDefault(); if (!isProcessing) closeImageKitModal(); }} className="fixed inset-0 m-0 flex h-dvh max-h-none w-screen max-w-none items-center justify-center border-0 bg-slate-900/40 p-2 backdrop:bg-transparent sm:p-6">
      <div className="flex max-h-[90dvh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-7">
          <div><h3 id="image-editor-title" className="text-lg font-semibold tracking-tight text-slate-900">Edit image</h3><p className="mt-0.5 text-xs text-slate-500">Make a small adjustment, or try a different direction.</p></div>
          <button disabled={isProcessing} onClick={closeImageKitModal} aria-label="Close image editor" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X className="h-5 w-5" /></button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[1fr_320px]">
          <div className="flex min-h-[260px] flex-col bg-[#f5f6f8] p-4 sm:min-h-[480px] sm:p-6">
            <div className="mb-4 flex gap-4 text-xs font-medium text-slate-600">
              <button onClick={undo} disabled={history.length <= 1 || isProcessing} className="flex items-center gap-1 disabled:opacity-30"><Undo2 className="h-3.5 w-3.5" />Undo</button>
              <button onClick={() => { const original = history[0]; setCurrentImage(original); setHistory([original]); }} disabled={history.length <= 1 || isProcessing} className="flex items-center gap-1 disabled:opacity-30"><RotateCcw className="h-3.5 w-3.5" />Reset</button>
              <button aria-pressed={showOriginal} onClick={() => setShowOriginal(!showOriginal)} className="ml-auto rounded border border-slate-300 bg-white px-2 py-1">{showOriginal ? "Show edited" : "View original"}</button>
            </div>
            <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
              {failedImage === (showOriginal ? history[0] : currentImage) ? <p role="alert" className="max-w-xs p-6 text-center text-sm leading-6 text-slate-500">This image couldn’t load. Check the image link in your post, or try another image.</p> : <img src={showOriginal ? history[0] : currentImage} onError={() => setFailedImage(showOriginal ? history[0] : currentImage)} alt={showOriginal ? "Original image" : "Edited image preview"} className="max-h-[55dvh] w-full object-contain" />}
              {isProcessing && <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 bg-white/80 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Working on your image…</div>}
            </div>
            <p className="mt-3 text-center text-xs text-slate-400">{showOriginal ? "Original" : history.length > 1 ? "Edited version" : "Your image"} · You can undo changes before saving.</p>
          </div>

          <div className="space-y-5 border-l border-slate-100 p-6">
            <div><h4 className="text-sm font-medium text-slate-800">Quick adjustments</h4><p className="mt-1 text-xs leading-5 text-slate-500">Choose a tool to apply it to the current image.</p></div>
            <div className="grid grid-cols-2 gap-2">
              {OPERATIONS.map((operation) => <button key={operation.type} onClick={() => { setShowOriginal(false); void applyTransform(operation.type); }} disabled={isProcessing || !!selectedPostForEdit.zernioPostId} className="rounded-lg border border-slate-200 px-3 py-2.5 text-left text-xs font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50">{operation.label}</button>)}
            </div>
            <div className="space-y-2">
              <label htmlFor="image-edit-prompt" className="text-sm font-medium text-slate-800">Have something specific in mind?</label>
              <textarea id="image-edit-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="For example: Replace the background with a warm, off-white wall. Keep the subject unchanged." className="input h-32 leading-relaxed" />
              <div className="grid grid-cols-2 gap-2"><button onClick={() => { setShowOriginal(false); void applyTransform("prompt_edit"); }} disabled={isProcessing || !prompt.trim() || !!selectedPostForEdit.zernioPostId} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Apply instruction</button><button onClick={() => { setShowOriginal(false); void applyTransform("change_bg"); }} disabled={isProcessing || !prompt.trim() || !!selectedPostForEdit.zernioPostId} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Change background</button></div>
              <p className="text-xs leading-5 text-slate-400">AI edits can change details. Check faces, lettering, and your product before using the result.</p>
            </div>
            {selectedPostForEdit.zernioPostId && <p className="text-xs leading-5 text-amber-800">This post is scheduled. Move it back to drafts before editing the image.</p>}
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3.5"><span className="mr-auto hidden text-xs text-slate-400 sm:block">{applyEditedImage ? "Returned to your post. Save the post when you’re ready." : "Your post won’t change until you save."}</span><button disabled={isProcessing} onClick={closeImageKitModal} className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 disabled:opacity-40">Cancel</button><button onClick={save} disabled={isProcessing || !!selectedPostForEdit.zernioPostId || currentImage === selectedPostForEdit.imageUrl} className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40">{applyEditedImage ? "Use image" : "Save image"}</button></footer>
      </div>
    </dialog>
  );
}
