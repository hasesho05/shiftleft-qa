import { schema, v } from "../lib/validation";

export const changePurposeSchema = schema(
  v.picklist(["feature", "bugfix", "refactor", "config", "docs", "other"]),
);

export const extractionStatusSchema = schema(
  v.picklist(["empty", "parsed", "partial"]),
);

export const intentContextSchema = schema(
  v.object({
    changePurpose: v.nullable(changePurposeSchema),
    userStory: v.nullable(v.string()),
    acceptanceCriteria: v.array(v.string()),
    nonGoals: v.array(v.string()),
    targetUsers: v.array(v.string()),
    notesForQa: v.array(v.string()),
    sourceRefs: v.array(v.string()),
    extractionStatus: extractionStatusSchema,
  }),
);

export type ChangePurpose = v.InferOutput<typeof changePurposeSchema>;
export type ExtractionStatus = v.InferOutput<typeof extractionStatusSchema>;
export type IntentContext = v.InferOutput<typeof intentContextSchema>;
