"use client";

import { Sparkles, AlertCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";

interface AnalysisTileProps {
  text: string;
  streaming: boolean;
  error: string | null;
  partial: boolean;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 py-1">
      <Skeleton className="h-3.5 w-32" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-[92%]" />
      <Skeleton className="h-3 w-[78%]" />
      <div className="h-2" />
      <Skeleton className="h-3.5 w-40" />
      <Skeleton className="h-3 w-[88%]" />
      <Skeleton className="h-3 w-[95%]" />
    </div>
  );
}

export function AnalysisTile({
  text,
  streaming,
  error,
  partial,
}: AnalysisTileProps) {
  const showSkeleton = streaming && text.length === 0;

  return (
    <Card className="flex h-full flex-col animate-tile-in [animation-delay:60ms]">
      <CardHeader className="justify-between">
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 text-accent-2" strokeWidth={2} />
          <CardTitle>AI Architecture Analysis</CardTitle>
        </div>
        {partial && (
          <span className="rounded-full border border-warning/30 bg-warning/[0.08] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning">
            Subset analyzed
          </span>
        )}
      </CardHeader>
      <CardContent className="min-h-0 flex-1 p-0">
        <ScrollArea className="h-full px-5 py-4">
          {error ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/[0.06] p-4 text-[13px] text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : showSkeleton ? (
            <LoadingSkeleton />
          ) : (
            <Markdown className={cn(streaming && "stream-caret")}>
              {text}
            </Markdown>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
