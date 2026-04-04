export type ExternalCommandFailureReason =
  | "timeout"
  | "command-not-found"
  | "auth-failure"
  | "network"
  | "unknown";

const AUTH_PATTERNS = [
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "gh auth login",
  "glab auth login",
  "authentication",
  "401 Unauthorized",
  "403 Forbidden",
] as const;

const NETWORK_PATTERNS = [
  "Could not resolve host",
  "connection refused",
  "Connection refused",
  "network is unreachable",
  "SSL certificate",
  "SSL_ERROR",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ENOTFOUND",
  "Failed to connect",
] as const;

export function classifyExternalCommandError(
  error: unknown,
): ExternalCommandFailureReason {
  const parsed = getExecaErrorLike(error);
  if (!parsed) {
    return "unknown";
  }

  if (parsed.timedOut === true) {
    return "timeout";
  }

  if (parsed.exitCode === 127) {
    return "command-not-found";
  }

  const messageText = [parsed.stderr, parsed.message, parsed.shortMessage]
    .filter(Boolean)
    .join(" ");
  const lowerMessage = messageText.toLowerCase();

  if (messageText.includes("ENOENT")) {
    return "command-not-found";
  }

  if (
    AUTH_PATTERNS.some((pattern) =>
      lowerMessage.includes(pattern.toLowerCase()),
    )
  ) {
    return "auth-failure";
  }

  if (
    NETWORK_PATTERNS.some((pattern) =>
      lowerMessage.includes(pattern.toLowerCase()),
    )
  ) {
    return "network";
  }

  return "unknown";
}

type ExecaErrorLike = {
  readonly shortMessage?: string;
  readonly stderr?: string;
  readonly message?: string;
  readonly command?: string;
  readonly exitCode?: number;
  readonly timedOut?: boolean;
};

export type ExecaErrorContext = {
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly timeoutMs?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readOptionalNumber(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}

function readOptionalBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

export function getExecaErrorLike(error: unknown): ExecaErrorLike | null {
  if (!isRecord(error)) {
    return null;
  }

  return {
    shortMessage: readOptionalString(error, "shortMessage"),
    stderr: readOptionalString(error, "stderr"),
    message: readOptionalString(error, "message"),
    command: readOptionalString(error, "command"),
    exitCode: readOptionalNumber(error, "exitCode"),
    timedOut: readOptionalBoolean(error, "timedOut"),
  };
}

export function getPreferredErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }

  const execaError = getExecaErrorLike(error);
  if (!execaError) {
    return null;
  }

  return (
    execaError.shortMessage ?? execaError.stderr ?? execaError.message ?? null
  );
}

export function normalizeExecaError(
  error: unknown,
  context?: ExecaErrorContext,
  fallbackMessage = "外部コマンドの実行に失敗しました",
): string {
  const preferredMessage = getPreferredErrorMessage(error);
  const execaError = getExecaErrorLike(error);

  if (!context) {
    return preferredMessage ?? fallbackMessage;
  }

  const commandText =
    context.args && context.args.length > 0
      ? `${context.command} ${context.args.join(" ")}`
      : context.command;
  const suffixParts: string[] = [];

  if (context.cwd) {
    suffixParts.push(`cwd=${context.cwd}`);
  }

  if (execaError?.timedOut === true && typeof context.timeoutMs === "number") {
    suffixParts.push(`${context.timeoutMs}ms でタイムアウトしました`);
  } else if (typeof execaError?.exitCode === "number") {
    suffixParts.push(`終了コード ${execaError.exitCode}`);
  }

  if (preferredMessage) {
    suffixParts.push(preferredMessage);
  }

  if (suffixParts.length === 0) {
    return `${commandText} の実行に失敗しました`;
  }

  return `${commandText} の実行に失敗しました (${suffixParts.join("; ")})`;
}

export type NormalizedExternalCommandError = {
  readonly reason: ExternalCommandFailureReason;
  readonly message: string;
};

export function normalizeExecaErrorWithReason(
  error: unknown,
  context?: ExecaErrorContext,
  fallbackMessage = "外部コマンドの実行に失敗しました",
): NormalizedExternalCommandError {
  return {
    reason: classifyExternalCommandError(error),
    message: normalizeExecaError(error, context, fallbackMessage),
  };
}
