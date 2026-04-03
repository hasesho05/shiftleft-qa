import { nonEmptyString, positiveInteger, schema, v } from "../lib/validation";

// --- Valibot schemas for gh issue CLI JSON output ---

/** gh issue create --json number,url,title の出力を検証 */
export const createdIssueSchema = schema(
  v.object({
    number: positiveInteger(),
    url: nonEmptyString(),
    title: nonEmptyString(),
  }),
);

/** gh issue comment の出力を検証 */
export const createdCommentSchema = schema(
  v.object({
    url: nonEmptyString(),
  }),
);

// --- Inferred types ---

export type CreatedIssue = v.InferOutput<typeof createdIssueSchema>;
export type CreatedComment = v.InferOutput<typeof createdCommentSchema>;
