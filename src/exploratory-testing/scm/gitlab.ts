import { nonEmptyString, schema, v } from "../lib/validation";

import type {
  ChangedFile,
  PrMetadata,
  ReviewComment,
} from "../models/pr-intake";

// --- Valibot schemas for glab CLI JSON output ---

const glabAuthorSchema = schema(v.object({ username: v.string() }));

const glabNoteSchema = schema(
  v.object({
    author: glabAuthorSchema,
    body: v.optional(v.string(), ""),
    created_at: v.optional(nonEmptyString()),
  }),
);

export const glabDiscussionSchema = schema(
  v.object({
    notes: v.optional(v.array(glabNoteSchema), []),
  }),
);

export const glabMrViewSchema = schema(
  v.object({
    iid: v.number(),
    title: v.string(),
    description: v.optional(v.nullable(v.string()), null),
    author: glabAuthorSchema,
    target_branch: v.string(),
    source_branch: v.string(),
    sha: v.string(),
    project_id: v.number(),
    web_url: v.string(),
    // glab mr view --comments outputs Discussions (capital D, Go struct field name)
    Discussions: v.optional(v.array(glabDiscussionSchema), []),
  }),
);

export const glabDiffEntrySchema = schema(
  v.object({
    old_path: v.string(),
    new_path: v.string(),
    new_file: v.boolean(),
    renamed_file: v.boolean(),
    deleted_file: v.boolean(),
    diff: v.optional(v.string(), ""),
  }),
);

export const glabCloseIssueSchema = schema(
  v.object({
    iid: v.number(),
  }),
);

// --- Data types ---

export type GlabMrData = {
  readonly prNumber: number;
  readonly title: string;
  readonly description: string;
  readonly author: string;
  readonly baseBranch: string;
  readonly headBranch: string;
  readonly headSha: string;
  readonly projectId: number;
  readonly webUrl: string;
  readonly discussions: readonly Record<string, unknown>[];
};

// --- Parse functions ---

export function parseGlabMrJson(json: Record<string, unknown>): GlabMrData {
  const parsed = glabMrViewSchema.parse(json);

  return {
    prNumber: parsed.iid,
    title: parsed.title,
    description: parsed.description ?? "",
    author: parsed.author.username,
    baseBranch: parsed.target_branch,
    headBranch: parsed.source_branch,
    headSha: parsed.sha,
    projectId: parsed.project_id,
    webUrl: parsed.web_url,
    discussions: parsed.Discussions as readonly Record<string, unknown>[],
  };
}

export function parseGlabDiffsJson(
  json: readonly Record<string, unknown>[],
): readonly ChangedFile[] {
  return json.map((entry) => {
    const parsed = glabDiffEntrySchema.parse(entry);
    const stats = countDiffStats(parsed.diff);

    return {
      path: parsed.deleted_file ? parsed.old_path : parsed.new_path,
      status: mapGlabFileStatus(parsed),
      additions: stats.additions,
      deletions: stats.deletions,
      previousPath: parsed.renamed_file ? parsed.old_path : null,
    };
  });
}

export function countDiffStats(diff: string): {
  additions: number;
  deletions: number;
} {
  if (diff.length === 0) {
    return { additions: 0, deletions: 0 };
  }

  let additions = 0;
  let deletions = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }
    if (line.startsWith("+")) {
      additions++;
    } else if (line.startsWith("-")) {
      deletions++;
    }
  }

  return { additions, deletions };
}

export function parseGlabCloseIssuesJson(
  json: readonly Record<string, unknown>[],
): readonly string[] {
  return json.map((issue) => {
    const parsed = glabCloseIssueSchema.parse(issue);
    return `#${parsed.iid}`;
  });
}

export function parseGlabDiscussionsJson(
  discussions: readonly Record<string, unknown>[],
): readonly ReviewComment[] {
  const comments: ReviewComment[] = [];

  for (const discussion of discussions) {
    const parsed = glabDiscussionSchema.parse(discussion);

    for (const note of parsed.notes) {
      if (note.body.trim().length === 0) {
        continue;
      }

      comments.push({
        author: note.author.username,
        body: note.body,
        path: null,
        createdAt: note.created_at ?? new Date().toISOString(),
      });
    }
  }

  return comments;
}

export function extractRepositoryFromWebUrl(webUrl: string): string {
  const match = webUrl.match(
    /^https?:\/\/[^/]+\/(.+?)\/-\/merge_requests\/\d+/,
  );
  if (!match?.[1]) {
    throw new Error(
      `Cannot extract repository from GitLab MR URL: "${webUrl}". Expected format: https://<host>/<path>/-/merge_requests/<iid>`,
    );
  }
  return match[1];
}

export function buildGitlabPrMetadata(
  mrData: GlabMrData,
  files: readonly ChangedFile[],
  comments: readonly ReviewComment[],
  linkedIssues: readonly string[],
): PrMetadata {
  return {
    provider: "gitlab",
    repository: extractRepositoryFromWebUrl(mrData.webUrl),
    prNumber: mrData.prNumber,
    title: mrData.title,
    description: mrData.description,
    author: mrData.author,
    baseBranch: mrData.baseBranch,
    headBranch: mrData.headBranch,
    headSha: mrData.headSha,
    linkedIssues: [...linkedIssues],
    changedFiles: [...files],
    reviewComments: [...comments],
    fetchedAt: new Date().toISOString(),
  };
}

// --- Internal helpers ---

function mapGlabFileStatus(parsed: {
  new_file: boolean;
  deleted_file: boolean;
  renamed_file: boolean;
}): ChangedFile["status"] {
  if (parsed.new_file) return "added";
  if (parsed.deleted_file) return "deleted";
  if (parsed.renamed_file) return "renamed";
  return "modified";
}
