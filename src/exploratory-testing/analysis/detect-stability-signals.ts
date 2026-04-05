import type { StabilityStatus } from "../models/test-mapping";

export type StabilityDetectionResult = {
  readonly stability: StabilityStatus;
  readonly signals: readonly string[];
};

const UNKNOWN_RESULT: StabilityDetectionResult = {
  stability: "unknown",
  signals: [],
};

const PATH_PATTERNS: readonly {
  readonly pattern: RegExp;
  readonly signal: string;
  readonly status: StabilityStatus;
}[] = [
  {
    pattern: /(?:^|[/\\._-])quarantin/i,
    signal: "path:quarantine",
    status: "quarantined",
  },
  {
    pattern: /(?:^|[/\\._-])flaky/i,
    signal: "path:flaky",
    status: "flaky",
  },
  {
    pattern: /(?:^|[/\\._-])unstable/i,
    signal: "path:unstable",
    status: "flaky",
  },
];

/**
 * Detect stability signals from a test file path.
 * Quarantined takes precedence over flaky.
 */
export function detectStabilityFromPath(
  filePath: string,
): StabilityDetectionResult {
  const signals: string[] = [];
  let hasQuarantined = false;
  let hasFlaky = false;

  for (const { pattern, signal, status } of PATH_PATTERNS) {
    if (pattern.test(filePath)) {
      signals.push(signal);
      if (status === "quarantined") {
        hasQuarantined = true;
      } else {
        hasFlaky = true;
      }
    }
  }

  if (signals.length === 0) {
    return UNKNOWN_RESULT;
  }

  return {
    stability: hasQuarantined ? "quarantined" : "flaky",
    signals,
  };
}

const ANNOTATION_PATTERNS: readonly {
  readonly pattern: RegExp;
  readonly signal: string;
  readonly status: StabilityStatus;
}[] = [
  {
    pattern: /@quarantined\b/i,
    signal: "annotation:@quarantined",
    status: "quarantined",
  },
  {
    pattern: /@flaky\b/i,
    signal: "annotation:@flaky",
    status: "flaky",
  },
  {
    pattern: /@unstable\b/i,
    signal: "annotation:@unstable",
    status: "flaky",
  },
];

const STRUCTURAL_PATTERNS: readonly {
  readonly pattern: RegExp;
  readonly signal: string;
  readonly status: StabilityStatus;
}[] = [
  {
    pattern: /\b(?:it|test|describe)\.skip\b/,
    signal: "pattern:skip",
    status: "quarantined",
  },
  {
    pattern: /\b(?:it|test)\.todo\b/,
    signal: "pattern:todo",
    status: "quarantined",
  },
  {
    pattern: /\/\/.*\bflaky\b|\/\*[\s\S]*?\bflaky\b/i,
    signal: "comment:flaky",
    status: "flaky",
  },
];

/**
 * Detect stability signals from test source text.
 * Quarantined takes precedence over flaky.
 */
export function detectStabilityFromSource(
  sourceText: string,
): StabilityDetectionResult {
  const signals: string[] = [];
  let hasQuarantined = false;
  let hasFlaky = false;

  for (const { pattern, signal, status } of ANNOTATION_PATTERNS) {
    if (pattern.test(sourceText)) {
      signals.push(signal);
      if (status === "quarantined") {
        hasQuarantined = true;
      } else {
        hasFlaky = true;
      }
    }
  }

  for (const { pattern, signal, status } of STRUCTURAL_PATTERNS) {
    if (pattern.test(sourceText)) {
      if (!signals.includes(signal)) {
        signals.push(signal);
      }
      if (status === "quarantined") {
        hasQuarantined = true;
      } else {
        hasFlaky = true;
      }
    }
  }

  if (signals.length === 0) {
    return UNKNOWN_RESULT;
  }

  return {
    stability: hasQuarantined ? "quarantined" : "flaky",
    signals,
  };
}
