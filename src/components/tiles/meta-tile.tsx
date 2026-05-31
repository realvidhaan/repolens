"use client";

import {
  Star,
  GitFork,
  Eye,
  CircleDot,
  Scale,
  ExternalLink,
  Clock,
} from "lucide-react";
import type { RepoMeta } from "@/lib/github";
import { Card, CardContent } from "@/components/ui/card";

/** Deterministic palette for language bars. */
const LANG_COLORS = [
  "#8b5cf6",
  "#38bdf8",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#a78bfa",
];

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Star;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border/70 bg-surface-2/50 px-3.5 py-3">
      <Icon className="h-4 w-4 text-accent-2" strokeWidth={2} />
      <span className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
        {value}
      </span>
      <span className="text-[11px] uppercase tracking-wide text-muted-2">
        {label}
      </span>
    </div>
  );
}

export function MetaTile({ meta }: { meta: RepoMeta }) {
  const updated = relativeTime(meta.pushedAt);

  return (
    <Card className="animate-tile-in">
      <CardContent className="space-y-5">
        {/* Heading: name + external link */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <a
              href={meta.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-center gap-1.5 text-base font-semibold text-foreground hover:text-accent-2"
            >
              <span className="truncate">{meta.fullName}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-2 group-hover:text-accent-2" />
            </a>
            {meta.description && (
              <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted">
                {meta.description}
              </p>
            )}
          </div>
        </div>

        {/* Stat grid */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat icon={Star} label="Stars" value={compact(meta.stars)} />
          <Stat icon={GitFork} label="Forks" value={compact(meta.forks)} />
          <Stat icon={Eye} label="Watching" value={compact(meta.watchers)} />
          <Stat
            icon={CircleDot}
            label="Issues"
            value={compact(meta.openIssues)}
          />
        </div>

        {/* Language breakdown */}
        {meta.languages.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2">
              {meta.languages.map((lang, i) => (
                <div
                  key={lang.name}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{
                    width: `${lang.pct}%`,
                    backgroundColor: LANG_COLORS[i % LANG_COLORS.length],
                  }}
                  title={`${lang.name} ${lang.pct}%`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {meta.languages.map((lang, i) => (
                <span
                  key={lang.name}
                  className="inline-flex items-center gap-1.5 text-[12px] text-muted"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: LANG_COLORS[i % LANG_COLORS.length],
                    }}
                  />
                  {lang.name}
                  <span className="tabular-nums text-muted-2">{lang.pct}%</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Footer meta: topics, license, freshness */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4 text-[12px] text-muted">
          {meta.license && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-surface-2/50 px-2.5 py-1">
              <Scale className="h-3 w-3 text-muted-2" />
              {meta.license}
            </span>
          )}
          {updated && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-surface-2/50 px-2.5 py-1">
              <Clock className="h-3 w-3 text-muted-2" />
              Updated {updated}
            </span>
          )}
          {meta.topics.slice(0, 4).map((t) => (
            <span
              key={t}
              className="rounded-full border border-accent/20 bg-accent/[0.08] px-2.5 py-1 text-accent-2"
            >
              {t}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
