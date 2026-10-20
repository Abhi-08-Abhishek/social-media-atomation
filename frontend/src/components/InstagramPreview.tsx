"use client";

import React, { useState } from "react";
import { MoreHorizontal, Image as ImageIcon } from "lucide-react";

interface InstagramPreviewProps {
  handle?: string;
  imageUrl: string;
  caption: string;
  hashtags: string[];
}

export function InstagramPreview({
  handle = "",
  imageUrl,
  caption,
  hashtags,
}: InstagramPreviewProps) {
  const cleanHandle = handle.replace(/^@/, "");
  const [failedImage, setFailedImage] = useState("");
  const initials = cleanHandle ? cleanHandle.slice(0, 2).toUpperCase() : "—";

  return (
    <div className="w-full max-w-sm mx-auto bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden text-slate-900">
      {/* IG Header */}
      <div className="p-3.5 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-medium text-xs shrink-0">
            {initials}
          </div>
          <div>
            <p className="text-xs font-bold leading-tight">{cleanHandle ? `@${cleanHandle}` : "Account preview"}</p>
            <p className="text-[10px] text-slate-400 flex items-center gap-1">
              <span>Content preview</span>
            </p>
          </div>
        </div>
        <span className="text-slate-400" aria-hidden="true">
          <MoreHorizontal className="w-4 h-4" />
        </span>
      </div>

      {/* IG Media Photo */}
      <div className="relative aspect-square w-full bg-slate-50 border-y border-slate-100 overflow-hidden flex items-center justify-center">
        {imageUrl && failedImage !== imageUrl ? (
          <img
            src={imageUrl}
            onError={() => setFailedImage(imageUrl)}
            alt="Post image preview"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-300 gap-2 p-6 text-center select-none">
            <ImageIcon className="w-12 h-12 stroke-[1.2] text-slate-300" />
            <p className="text-xs font-medium text-slate-400">{imageUrl ? "This image couldn’t load. Check its link." : "Media preview will appear here"}</p>
          </div>
        )}
      </div>

      {/* IG Action Icons */}
      <div className="p-3.5 space-y-2">
        {/* Caption & Hashtags */}
        <div className="whitespace-pre-wrap break-words text-sm text-slate-700 leading-relaxed">
          <span>{caption || <span className="text-slate-400 italic">No caption yet...</span>}</span>
          {hashtags && hashtags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1 text-blue-600 font-medium">
              {hashtags.map((tag, i) => (
                <span key={i}>{tag.startsWith("#") ? tag : `#${tag}`}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
