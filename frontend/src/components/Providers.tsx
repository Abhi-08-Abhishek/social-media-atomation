"use client";

import { SessionProvider } from "@/lib/session";
import React from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>{children}</SessionProvider>
  );
}
