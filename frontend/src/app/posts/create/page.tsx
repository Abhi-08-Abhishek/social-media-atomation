"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSocialixStore } from "@/lib/store";

export default function CreatePostPage() {
  const router = useRouter();
  const openPostEditor = useSocialixStore((state) => state.openPostEditor);

  useEffect(() => {
    openPostEditor(null);
    router.replace("/posts");
  }, [openPostEditor, router]);

  return <p className="text-sm text-slate-500">Opening the post editor...</p>;
}
