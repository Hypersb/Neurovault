"use client";

import Sidebar from "@/components/layout/Sidebar";
import { BrainProvider, useBrainContext } from "@/lib/hooks";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Component, type ReactNode } from "react";

// Error boundary to catch rendering errors
interface EBProps { children: ReactNode }
interface EBState { hasError: boolean; message: string }

class DashboardErrorBoundary extends Component<EBProps, EBState> {
  constructor(props: EBProps) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || "Something went wrong" };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-background">
          <div className="text-center space-y-4 max-w-md px-6">
            <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">{this.state.message}</p>
            <button
              onClick={() => { this.setState({ hasError: false, message: "" }); window.location.reload(); }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function DashboardInner({ children }: { children: ReactNode }) {
  const { isLoading, error } = useBrainContext();

  if (error) {
    return (
      <div className="flex h-screen bg-background">
        <div className="flex items-center justify-center flex-1">
          <div className="text-center space-y-4 max-w-md px-6">
            <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold">Connection Error</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
            <p className="text-xs text-muted-foreground">
              Make sure you have run the <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">supabase-schema.sql</code> migration in your Supabase SQL Editor and your environment variables are set correctly.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-screen bg-background">
        <div className="flex items-center justify-center flex-1">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardErrorBoundary>
      <BrainProvider>
        <DashboardInner>{children}</DashboardInner>
      </BrainProvider>
    </DashboardErrorBoundary>
  );
}
