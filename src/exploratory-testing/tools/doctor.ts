import { spawnSync } from "node:child_process";

export type ToolStatus = "ok" | "missing";

export interface ToolCheck {
  name: string;
  required: boolean;
  detected: boolean;
  version: string | null;
}

export interface EnvironmentReport {
  runtime: {
    bunVersion: string | null;
    nodeVersion: string | null;
  };
  tools: ToolCheck[];
}

function detectVersion(
  commandName: string,
  versionArgs: string[] = ["--version"],
): string | null {
  if (!isCommandAvailable(commandName)) {
    return null;
  }

  const result = spawnSync(commandName, versionArgs, {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return null;
  }

  const output = result.stdout.trim();
  return output.length > 0 ? output : null;
}

export function getToolStatus(tool: ToolCheck): ToolStatus {
  return tool.detected ? "ok" : "missing";
}

function isCommandAvailable(commandName: string): boolean {
  const result = spawnSync("which", [commandName], {
    encoding: "utf8",
  });

  return result.status === 0;
}

export function createEnvironmentReport(): EnvironmentReport {
  const tools: ToolCheck[] = [
    {
      name: "gh",
      required: true,
      detected: isCommandAvailable("gh"),
      version: detectVersion("gh", ["--version"]),
    },
    {
      name: "git",
      required: true,
      detected: isCommandAvailable("git"),
      version: detectVersion("git", ["--version"]),
    },
    {
      name: "sqlite3",
      required: false,
      detected: isCommandAvailable("sqlite3"),
      version: detectVersion("sqlite3", ["--version"]),
    },
    {
      name: "glab",
      required: false,
      detected: isCommandAvailable("glab"),
      version: detectVersion("glab", ["--version"]),
    },
  ];

  return {
    runtime: {
      bunVersion: process.versions.bun ?? null,
      nodeVersion: process.versions.node ?? null,
    },
    tools,
  };
}
