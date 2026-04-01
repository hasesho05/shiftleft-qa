import { classifyFileChange } from "../analysis/classify-file-change";
import { extractViewpointSeeds } from "../analysis/extract-viewpoint-seeds";
import { findRelatedCodeCandidates } from "../analysis/find-related-code";
import {
  type PersistedChangeAnalysis,
  type PersistedPrIntake,
  findPrIntake,
  saveChangeAnalysis,
} from "../db/workspace-repository";
import type {
  ChangeAnalysisResult,
  FileChangeAnalysis,
} from "../models/change-analysis";
import type { ResolvedPluginConfig } from "../models/config";
import { readPluginConfig } from "./config";
import {
  type StepHandoverWriteResult,
  writeStepHandoverFromConfig,
} from "./progress";

export type DiscoverContextInput = {
  readonly prNumber: number;
  readonly provider: string;
  readonly repository: string;
  readonly configPath?: string;
  readonly manifestPath?: string;
};

export type DiscoverContextResult = {
  readonly persisted: PersistedChangeAnalysis;
  readonly handover: StepHandoverWriteResult;
};

export async function runDiscoverContext(
  input: DiscoverContextInput,
): Promise<DiscoverContextResult> {
  const configPath = input.configPath ?? "config.json";
  const manifestPath = input.manifestPath ?? ".claude-plugin/plugin.json";
  const config = await readPluginConfig(configPath, manifestPath);

  const prIntake = findPrIntake(
    config.paths.database,
    input.provider,
    input.repository,
    input.prNumber,
  );

  if (!prIntake) {
    throw new Error(
      `PR intake not found for ${input.provider}/${input.repository}#${input.prNumber}. Run pr-intake first.`,
    );
  }

  return runDiscoverContextFromIntake(prIntake, config);
}

export async function runDiscoverContextFromIntake(
  prIntake: PersistedPrIntake,
  config: ResolvedPluginConfig,
): Promise<DiscoverContextResult> {
  const fileAnalyses = analyzeFiles(prIntake);
  const relatedCodes = findRelatedCodeCandidates(prIntake.changedFiles);
  const viewpointSeeds = extractViewpointSeeds(fileAnalyses);
  const summary = buildSummary(fileAnalyses, prIntake);

  const analysisResult: ChangeAnalysisResult = {
    prIntakeId: prIntake.id,
    fileAnalyses: [...fileAnalyses],
    relatedCodes: [...relatedCodes],
    viewpointSeeds: [...viewpointSeeds],
    summary,
    analyzedAt: new Date().toISOString(),
  };

  const persisted = saveChangeAnalysis(config.paths.database, analysisResult);
  const body = buildHandoverBody(persisted);

  const handover = await writeStepHandoverFromConfig(config, {
    stepName: "discover-context",
    status: "completed",
    summary: `Analyzed ${fileAnalyses.length} files: ${summary}`,
    body,
  });

  return { persisted, handover };
}

function analyzeFiles(
  prIntake: PersistedPrIntake,
): readonly FileChangeAnalysis[] {
  return prIntake.changedFiles.map((file) => ({
    path: file.path,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    categories: [...classifyFileChange(file)],
  }));
}

function buildSummary(
  fileAnalyses: readonly FileChangeAnalysis[],
  prIntake: PersistedPrIntake,
): string {
  const categorySet = new Set<string>();

  for (const fa of fileAnalyses) {
    for (const cat of fa.categories) {
      categorySet.add(cat.category);
    }
  }

  const categories = [...categorySet].sort();

  if (categories.length === 0) {
    return `${prIntake.repository}#${prIntake.prNumber}: ${fileAnalyses.length} files analyzed, no specific categories detected`;
  }

  return `${prIntake.repository}#${prIntake.prNumber}: ${fileAnalyses.length} files, categories: ${categories.join(", ")}`;
}

function buildHandoverBody(analysis: PersistedChangeAnalysis): string {
  const lines = [
    `# Change Analysis (pr_intake_id: ${analysis.prIntakeId})`,
    "",
    "## File Change Analysis",
    "",
    "| Path | Status | Categories | +/- |",
    "| --- | --- | --- | --- |",
  ];

  for (const fa of analysis.fileAnalyses) {
    const cats =
      fa.categories.map((c) => `${c.category}(${c.confidence})`).join(", ") ||
      "—";
    lines.push(
      `| ${fa.path.replace(/\|/g, "\\|")} | ${fa.status} | ${cats} | +${fa.additions} -${fa.deletions} |`,
    );
  }
  lines.push("");

  if (analysis.relatedCodes.length > 0) {
    lines.push("## Related Code Candidates", "");
    for (const rc of analysis.relatedCodes) {
      lines.push(
        `- **${rc.path}** (${rc.relation}, confidence: ${rc.confidence}): ${rc.reason}`,
      );
    }
    lines.push("");
  }

  lines.push("## Viewpoint Seeds", "");
  for (const vs of analysis.viewpointSeeds) {
    lines.push(`### ${vs.viewpoint}`, "");
    if (vs.seeds.length === 0) {
      lines.push("- *(no seeds extracted)*", "");
    } else {
      for (const seed of vs.seeds) {
        lines.push(`- ${seed}`);
      }
      lines.push("");
    }
  }

  lines.push("## Next step", "", "- map-tests", "");

  return lines.join("\n");
}
