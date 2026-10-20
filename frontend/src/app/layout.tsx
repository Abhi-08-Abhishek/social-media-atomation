import type { Metadata } from "next";
import "@/styles/globals.css";
import { Providers } from "@/components/Providers";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Socialix — Your social workspace",
  description: "Plan, create and schedule social posts with help from AI. Review your drafts, manage your accounts and see what's working.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#f8fafc] text-slate-800 antialiased min-h-screen">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
