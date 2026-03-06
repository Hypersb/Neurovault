"use client";

import Sidebar from "@/components/layout/Sidebar";
import { BrainProvider } from "@/lib/hooks";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <BrainProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </BrainProvider>
  );
}
