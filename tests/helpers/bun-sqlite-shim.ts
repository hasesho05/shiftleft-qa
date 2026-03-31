import { execFileSync } from "node:child_process";

type QueryRow = Record<string, unknown>;

export class Statement {
  constructor(
    private readonly filename: string,
    private readonly sql: string,
  ) {}

  run(...params: readonly unknown[]): unknown {
    executeSql(this.filename, materializeSql(this.sql, params));
    return {
      changes: 0,
    };
  }

  get<T>(...params: readonly unknown[]): T | null {
    const rows = runQuery<T>(this.filename, materializeSql(this.sql, params));

    return rows[0] ?? null;
  }

  all<T>(...params: readonly unknown[]): T[] {
    return runQuery<T>(this.filename, materializeSql(this.sql, params));
  }
}

export class Database {
  constructor(
    private readonly filename: string,
    _options?: {
      readonly create?: boolean;
      readonly readonly?: boolean;
      readonly strict?: boolean;
      readonly safeIntegers?: boolean;
    },
  ) {}

  exec(sql: string): Database {
    executeSql(this.filename, sql);
    return this;
  }

  query<T = unknown>(sql: string): Statement {
    return new Statement(this.filename, sql);
  }

  close(): void {}

  transaction<TArgs extends readonly unknown[], TResult>(
    callback: (...args: TArgs) => TResult,
  ): (...args: TArgs) => TResult {
    return (...args: TArgs) => callback(...args);
  }
}

function executeSql(filename: string, sql: string): void {
  execFileSync("sqlite3", [filename, withSessionExecPragmas(sql)], {
    encoding: "utf8",
  });
}

function runQuery<T>(filename: string, sql: string): T[] {
  const output = execFileSync(
    "sqlite3",
    ["-json", filename, withSessionQueryPragmas(sql)],
    {
      encoding: "utf8",
    },
  ).trim();

  if (output.length === 0) {
    return [];
  }

  const parsed: unknown = JSON.parse(output);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed as T[];
}

function withSessionExecPragmas(sql: string): string {
  return `PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; ${sql}`;
}

function withSessionQueryPragmas(sql: string): string {
  return `PRAGMA foreign_keys=ON; ${sql}`;
}

function materializeSql(sql: string, params: readonly unknown[]): string {
  return sql.replaceAll(/\?(\d+)/g, (_, indexText: string) => {
    const index = Number.parseInt(indexText, 10) - 1;
    return toSqlLiteral(params[index]);
  });
}

function toSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}
