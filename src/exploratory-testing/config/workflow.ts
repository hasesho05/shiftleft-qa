export type WorkflowSkill = {
  readonly name: string;
  readonly title: string;
  readonly path: string;
  readonly description: string;
};

export const WORKFLOW_SKILLS = [
  {
    name: "setup",
    title: "Workspace setup",
    path: "skills/setup/SKILL.md",
    description: "Initialize config, workspace state, and progress tracking.",
  },
  {
    name: "pr-intake",
    title: "PR or MR intake",
    path: "skills/pr-intake/SKILL.md",
    description: "Ingest PR or MR metadata and changed files.",
  },
  {
    name: "discover-context",
    title: "Discover implementation context",
    path: "skills/discover-context/SKILL.md",
    description: "Analyze code and diff context before exploration.",
  },
  {
    name: "map-tests",
    title: "Map automated tests",
    path: "skills/map-tests/SKILL.md",
    description: "Map related automated tests and summarize coverage.",
  },
  {
    name: "assess-gaps",
    title: "Assess coverage gaps",
    path: "skills/assess-gaps/SKILL.md",
    description: "Identify coverage gaps and select exploratory heuristics.",
  },
  {
    name: "allocate",
    title: "Allocate testing destinations",
    path: "skills/allocate/SKILL.md",
    description: "Allocate coverage gaps to testing destinations.",
  },
  {
    name: "handoff",
    title: "QA handoff",
    path: "skills/handoff/SKILL.md",
    description: "Create QA handoff issue on GitHub.",
  },
  {
    name: "generate-charters",
    title: "Generate session charters",
    path: "skills/generate-charters/SKILL.md",
    description: "Generate short, executable exploratory session charters.",
  },
  {
    name: "run-session",
    title: "Run exploratory session",
    path: "skills/run-session/SKILL.md",
    description: "Record exploratory session observations and evidence.",
  },
  {
    name: "triage-findings",
    title: "Triage findings",
    path: "skills/triage-findings/SKILL.md",
    description:
      "Classify findings into defects, spec gaps, and automation candidates.",
  },
  {
    name: "export-artifacts",
    title: "Export artifacts",
    path: "skills/export-artifacts/SKILL.md",
    description: "Export the brief, gap map, charters, and findings reports.",
  },
] as const satisfies readonly WorkflowSkill[];

export function getWorkflowSkill(skillName: string): WorkflowSkill | undefined {
  return WORKFLOW_SKILLS.find((skill) => skill.name === skillName);
}

export function getWorkflowSkillOrThrow(skillName: string): WorkflowSkill {
  const skill = getWorkflowSkill(skillName);

  if (!skill) {
    throw new Error(`Unknown workflow step: ${skillName}`);
  }

  return skill;
}

export function getWorkflowStepNumber(skillName: string): number {
  const stepIndex = WORKFLOW_SKILLS.findIndex(
    (skill) => skill.name === skillName,
  );

  if (stepIndex < 0) {
    throw new Error(`Unknown workflow step: ${skillName}`);
  }

  return stepIndex + 1;
}

export function getNextWorkflowSkillName(skillName: string): string | null {
  const stepIndex = WORKFLOW_SKILLS.findIndex(
    (skill) => skill.name === skillName,
  );

  if (stepIndex < 0) {
    throw new Error(`Unknown workflow step: ${skillName}`);
  }

  const nextSkill = WORKFLOW_SKILLS[stepIndex + 1];
  return nextSkill?.name ?? null;
}
