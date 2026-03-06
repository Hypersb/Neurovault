"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

export function PageError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[300px]">
      <div className="text-center space-y-3 max-w-sm px-6">
        <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
        <p className="text-sm font-medium">Something went wrong</p>
        <p className="text-xs text-muted-foreground">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        )}
      </div>
    </div>
  );
}
