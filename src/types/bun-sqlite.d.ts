declare module "bun:sqlite" {
  export class Statement {
    run(...params: readonly unknown[]): unknown;
    get<T>(...params: readonly unknown[]): T | null;
    all<T>(...params: readonly unknown[]): T[];
  }

  export class Database {
    constructor(
      filename: string,
      options?: {
        readonly create?: boolean;
        readonly readonly?: boolean;
        readonly strict?: boolean;
        readonly safeIntegers?: boolean;
      },
    );

    exec(sql: string): Database;
    query<T = unknown>(sql: string): Statement;
    close(): void;
    transaction<TArgs extends readonly unknown[], TResult>(
      callback: (...args: TArgs) => TResult,
    ): (...args: TArgs) => TResult;
  }
}
