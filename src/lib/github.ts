/**
 * GitHub utility — fetches a public repository's metadata, file tree, and a
 * filtered slice of source file contents for AI analysis.
 *
 * The hard guardrail here is token control: we never send a whole repo to the
 * model. We strip lockfiles / binaries / generated output, prioritise the files
 * that actually explain a project (entry points, config, README, top-level
 * source), cap the count, and truncate anything oversized.
 */

const GITHUB_API = "https://api.github.com";

// ---- Tunable budget constants ---------------------------------------------
// Sized for local models (Mistral 7B, ~32k context) running on consumer hardware.
// Smaller = faster inference + less memory pressure.
const MAX_FILES = 12;         // hard cap on source files sent to the model
const MAX_FILE_BYTES = 4_000; // per-file truncation ceiling (~1k tokens)
const MAX_TOTAL_BYTES = 32_000; // overall content budget (~8k tokens)
const MAX_TREE_ENTRIES = 120;   // paths shown in the structural map
const PARALLEL_FETCH = 6;       // concurrent file fetches

// ---------------------------------------------------------------------------

export interface RepoMeta {
  owner: string;
  repo: string;
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  defaultBranch: string;
  htmlUrl: string;
  homepage: string | null;
  license: string | null;
  topics: string[];
  pushedAt: string | null;
  primaryLanguage: string | null;
  languages: { name: string; bytes: number; pct: number }[];
}

export interface RepoFile {
  path: string;
  content: string;
  truncated: boolean;
}

export interface RepoContext {
  meta: RepoMeta;
  /** Compact directory map (paths only), already capped. */
  tree: string[];
  totalTreeCount: number;
  /** Filtered, truncated source file contents. */
  files: RepoFile[];
  /** True when the repo exceeded budgets and we analyzed a subset. */
  partial: boolean;
}

export class GitHubError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
  }
}

// --- URL parsing ------------------------------------------------------------

export function parseRepoUrl(
  input: string,
): { owner: string; repo: string } | null {
  if (!input) return null;
  let s = input.trim();

  // Accept "owner/repo" shorthand.
  const shorthand = /^([\w.-]+)\/([\w.-]+)$/;
  if (shorthand.test(s) && !s.includes(" ")) {
    const m = s.match(shorthand)!;
    return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
  }

  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const url = new URL(s);
    if (!/(^|\.)github\.com$/i.test(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

// --- Filtering heuristics ---------------------------------------------------

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  "vendor",
  "venv",
  ".venv",
  "__pycache__",
  ".git",
  "coverage",
  "target",
  ".turbo",
  ".cache",
  "bin",
  "obj",
  "Pods",
  "DerivedData",
]);

const SKIP_EXT = new Set([
  // images / media
  "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "tiff",
  "mp4", "mov", "webm", "avi", "mp3", "wav", "ogg", "flac",
  // fonts
  "woff", "woff2", "ttf", "otf", "eot",
  // archives / binaries
  "zip", "gz", "tar", "rar", "7z", "exe", "dll", "so", "dylib", "bin",
  "pdf", "psd", "sketch", "fig",
  // data dumps
  "csv", "tsv", "parquet", "sqlite", "db",
  // maps / minified markers handled separately
  "map",
]);

const SKIP_FILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "composer.lock",
  "gemfile.lock",
  "poetry.lock",
  "cargo.lock",
  "go.sum",
  ".ds_store",
]);

/** Files that disproportionately explain a project — analyzed first. */
const PRIORITY_FILES = [
  "readme.md",
  "readme",
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "gemfile",
  "composer.json",
  "next.config.js",
  "next.config.ts",
  "next.config.mjs",
  "vite.config.ts",
  "vite.config.js",
  "tsconfig.json",
  "dockerfile",
  "docker-compose.yml",
  "schema.prisma",
];

const ENTRY_HINTS = [
  "index.",
  "main.",
  "app.",
  "server.",
  "cli.",
  "__init__.py",
  "mod.rs",
  "lib.rs",
];

function basename(path: string): string {
  return path.split("/").pop()!.toLowerCase();
}

function ext(path: string): string {
  const b = basename(path);
  const i = b.lastIndexOf(".");
  return i === -1 ? "" : b.slice(i + 1);
}

function inSkippedDir(path: string): boolean {
  return path.split("/").some((seg) => SKIP_DIRS.has(seg));
}

function isMinified(path: string): boolean {
  return /\.min\.(js|css)$/.test(path) || /\.bundle\./.test(path);
}

function shouldSkip(path: string): boolean {
  const b = basename(path);
  if (inSkippedDir(path)) return true;
  if (SKIP_FILES.has(b)) return true;
  if (SKIP_EXT.has(ext(path))) return true;
  if (isMinified(path)) return true;
  if (b.startsWith(".") && b !== ".env.example") return true; // dotfiles noise
  return false;
}

/** Lower score = analyzed earlier. Drives which files survive the cap. */
function priorityScore(path: string): number {
  const b = basename(path);
  const depth = path.split("/").length;

  if (PRIORITY_FILES.includes(b)) return 0;
  if (ENTRY_HINTS.some((h) => b.startsWith(h))) return 1 + depth * 0.1;

  const topLevelSrc = /^(src|app|lib|pkg|internal|cmd)\//.test(path);
  if (topLevelSrc) return 3 + depth * 0.5;

  return 6 + depth; // deeper / peripheral files rank last
}

// --- GitHub REST calls ------------------------------------------------------

function headers(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "RepoLens",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  // Optional token lifts the 60 req/hr unauthenticated limit to 5000/hr.
  if (process.env.GITHUB_TOKEN) {
    h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return h;
}

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: headers(),
    // Cache repo structure briefly at the edge to spare the rate limit.
    next: { revalidate: 600 },
  });

  if (res.status === 404) {
    throw new GitHubError("Repository not found or is private.", 404);
  }
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (remaining === "0") {
      throw new GitHubError(
        "GitHub API rate limit reached. Add a GITHUB_TOKEN to raise the limit.",
        429,
      );
    }
    throw new GitHubError("GitHub denied the request.", 403);
  }
  if (!res.ok) {
    throw new GitHubError(`GitHub request failed (${res.status}).`, res.status);
  }
  return res.json() as Promise<T>;
}

async function fetchMeta(owner: string, repo: string): Promise<RepoMeta> {
  type RepoResp = {
    full_name: string;
    description: string | null;
    stargazers_count: number;
    forks_count: number;
    subscribers_count: number;
    open_issues_count: number;
    default_branch: string;
    html_url: string;
    homepage: string | null;
    language: string | null;
    license: { spdx_id: string | null } | null;
    topics?: string[];
    pushed_at: string | null;
  };

  const [data, langs] = await Promise.all([
    gh<RepoResp>(`/repos/${owner}/${repo}`),
    gh<Record<string, number>>(`/repos/${owner}/${repo}/languages`).catch(
      () => ({}) as Record<string, number>,
    ),
  ]);

  const totalBytes = Object.values(langs).reduce((a, b) => a + b, 0) || 1;
  const languages = Object.entries(langs)
    .map(([name, bytes]) => ({
      name,
      bytes,
      pct: Math.round((bytes / totalBytes) * 1000) / 10,
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 6);

  return {
    owner,
    repo,
    fullName: data.full_name,
    description: data.description,
    stars: data.stargazers_count,
    forks: data.forks_count,
    watchers: data.subscribers_count ?? 0,
    openIssues: data.open_issues_count,
    defaultBranch: data.default_branch,
    htmlUrl: data.html_url,
    homepage: data.homepage || null,
    license: data.license?.spdx_id && data.license.spdx_id !== "NOASSERTION"
      ? data.license.spdx_id
      : null,
    topics: data.topics ?? [],
    pushedAt: data.pushed_at,
    primaryLanguage: data.language,
    languages,
  };
}

interface TreeEntry {
  path: string;
  type: string;
  size?: number;
  sha: string;
}

async function fetchTree(
  owner: string,
  repo: string,
  branch: string,
): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
  const data = await gh<{ tree: TreeEntry[]; truncated: boolean }>(
    `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
  );
  return {
    entries: data.tree.filter((e) => e.type === "blob"),
    truncated: data.truncated,
  };
}

async function fetchFileContent(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<string | null> {
  // Raw endpoint avoids base64 round-trips and the contents-API size cap.
  const res = await fetch(
    `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`,
    { headers: { "User-Agent": "RepoLens" }, next: { revalidate: 600 } },
  );
  if (!res.ok) return null;
  return res.text();
}

// --- Public entry point -----------------------------------------------------

export async function fetchRepoContext(rawUrl: string): Promise<RepoContext> {
  const parsed = parseRepoUrl(rawUrl);
  if (!parsed) {
    throw new GitHubError("That doesn't look like a GitHub repository URL.", 400);
  }
  const { owner, repo } = parsed;

  const meta = await fetchMeta(owner, repo);
  const { entries, truncated } = await fetchTree(
    owner,
    repo,
    meta.defaultBranch,
  );

  // Build the compact structural map from analyzable paths.
  const analyzable = entries
    .filter((e) => !shouldSkip(e.path))
    .sort((a, b) => priorityScore(a.path) - priorityScore(b.path));

  const tree = analyzable
    .map((e) => e.path)
    .sort()
    .slice(0, MAX_TREE_ENTRIES);

  // Select candidate files (skip oversized blobs, take a 2x pool).
  const candidates = analyzable
    .filter((e) => !((e.size ?? 0) > 200_000 && priorityScore(e.path) > 1))
    .slice(0, MAX_FILES * 2);

  // Fetch all candidates in parallel batches instead of one at a time.
  const fetched: Array<{ path: string; raw: string }> = [];
  for (let i = 0; i < candidates.length; i += PARALLEL_FETCH) {
    const batch = candidates.slice(i, i + PARALLEL_FETCH);
    const results = await Promise.all(
      batch.map(async (e) => ({
        path: e.path,
        raw: await fetchFileContent(owner, repo, meta.defaultBranch, e.path),
      })),
    );
    for (const r of results) {
      if (r.raw != null) fetched.push({ path: r.path, raw: r.raw });
    }
  }

  // Apply byte budgets and binary filter.
  const files: RepoFile[] = [];
  let usedBytes = 0;

  for (const { path, raw } of fetched) {
    if (files.length >= MAX_FILES) break;
    if (usedBytes >= MAX_TOTAL_BYTES) break;
    if (/\u0000/.test(raw.slice(0, 4000))) continue; // null byte => binary file

    const budgetLeft = MAX_TOTAL_BYTES - usedBytes;
    const ceiling = Math.min(MAX_FILE_BYTES, budgetLeft);
    const truncatedContent = raw.length > ceiling;
    const content = truncatedContent ? raw.slice(0, ceiling) : raw;

    files.push({ path, content, truncated: truncatedContent });
    usedBytes += content.length;
  }

  const partial =
    truncated ||
    analyzable.length > files.length ||
    entries.length > analyzable.length + files.length;

  return {
    meta,
    tree,
    totalTreeCount: analyzable.length,
    files,
    partial,
  };
}

/**
 * Render the repo context into a compact prompt block for the model.
 * Kept here so both the analyze and chat routes share one representation.
 */
export function buildContextPrompt(ctx: RepoContext): string {
  const { meta, tree, files, partial, totalTreeCount } = ctx;

  const langLine = meta.languages
    .map((l) => `${l.name} ${l.pct}%`)
    .join(", ");

  const header = [
    `Repository: ${meta.fullName}`,
    meta.description ? `Description: ${meta.description}` : null,
    `Primary language: ${meta.primaryLanguage ?? "unknown"}`,
    langLine ? `Language breakdown: ${langLine}` : null,
    `Stars: ${meta.stars} | Forks: ${meta.forks} | Open issues: ${meta.openIssues}`,
    meta.topics.length ? `Topics: ${meta.topics.join(", ")}` : null,
    meta.license ? `License: ${meta.license}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const treeBlock = `File structure (${tree.length} of ${totalTreeCount} analyzable paths):\n${tree
    .map((p) => `  ${p}`)
    .join("\n")}`;

  const fileBlocks = files
    .map(
      (f) =>
        `--- FILE: ${f.path}${f.truncated ? " (truncated)" : ""} ---\n${f.content}`,
    )
    .join("\n\n");

  const note = partial
    ? "\n\nNote: This is a large repository; only a prioritized subset of files was analyzed."
    : "";

  return `${header}\n\n${treeBlock}\n\n===== KEY FILE CONTENTS =====\n\n${fileBlocks}${note}`;
}
