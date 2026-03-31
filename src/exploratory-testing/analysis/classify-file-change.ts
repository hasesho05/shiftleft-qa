import type { CategorizedChange } from "../models/change-analysis";
import type { ChangedFile } from "../models/pr-intake";

type ClassificationRule = {
  readonly category: CategorizedChange["category"];
  test(path: string): boolean;
  readonly confidence: number;
  readonly reason: string;
};

const PATH_RULES: readonly ClassificationRule[] = [
  // UI
  {
    category: "ui",
    test: (p) => /\.(tsx|jsx)$/.test(p) && !/\.test\.(tsx|jsx)$/.test(p),
    confidence: 0.8,
    reason: "React/JSX component file",
  },
  {
    category: "ui",
    test: (p) => /\.vue$/.test(p),
    confidence: 0.85,
    reason: "Vue single-file component",
  },
  {
    category: "ui",
    test: (p) => /\.(css|scss|sass|less|styl)$/.test(p),
    confidence: 0.9,
    reason: "Stylesheet file",
  },
  {
    category: "ui",
    test: (p) => /\.stories\.(ts|tsx|js|jsx|mdx)$/.test(p),
    confidence: 0.85,
    reason: "Storybook story file",
  },
  {
    category: "ui",
    test: (p) =>
      /\/(components|views|pages|layouts)\//i.test(p) &&
      /\.(ts|js)$/.test(p) &&
      !/\.test\.(ts|js)$/.test(p),
    confidence: 0.7,
    reason: "File in UI directory",
  },

  // API
  {
    category: "api",
    test: (p) => /\/(routes|controllers|handlers|endpoints)\//i.test(p),
    confidence: 0.85,
    reason: "API route/controller/handler file",
  },
  {
    category: "api",
    test: (p) =>
      /\/api\//i.test(p) &&
      /\.(ts|js)$/.test(p) &&
      !/openapi\.(yaml|yml|json)$/.test(p),
    confidence: 0.8,
    reason: "File in API directory",
  },

  // Validation
  {
    category: "validation",
    test: (p) => /\/(validators?|validations?)\//i.test(p),
    confidence: 0.9,
    reason: "Validation module file",
  },
  {
    category: "validation",
    test: (p) =>
      /\/(schemas?)\//i.test(p) && /\.(ts|js)$/.test(p) && !/\.prisma$/.test(p),
    confidence: 0.75,
    reason: "Schema definition file (likely validation)",
  },

  // State transition
  {
    category: "state-transition",
    test: (p) => /\/(store|stores|state|redux)\//i.test(p),
    confidence: 0.85,
    reason: "State management file",
  },
  {
    category: "state-transition",
    test: (p) => /\/(reducers?|slices?|atoms?|signals?)\//i.test(p),
    confidence: 0.85,
    reason: "State reducer/slice file",
  },
  {
    category: "state-transition",
    test: (p) => /\/(machines?|statecharts?)\//i.test(p),
    confidence: 0.9,
    reason: "State machine definition",
  },

  // Permission
  {
    category: "permission",
    test: (p) =>
      /\/(auth|authentication|authorization)\//i.test(p) ||
      /\/middleware\/auth/i.test(p),
    confidence: 0.85,
    reason: "Authentication/authorization module",
  },
  {
    category: "permission",
    test: (p) => /\/(rbac|acl|permissions?|roles?|policies)\//i.test(p),
    confidence: 0.9,
    reason: "RBAC/ACL/permission definition",
  },
  {
    category: "permission",
    test: (p) => /\/(guards?|interceptors?)\//i.test(p),
    confidence: 0.7,
    reason: "Guard/interceptor (possibly auth-related)",
  },

  // Async
  {
    category: "async",
    test: (p) => /\/(workers?|queues?|consumers?|producers?)\//i.test(p),
    confidence: 0.9,
    reason: "Async worker/queue file",
  },
  {
    category: "async",
    test: (p) => /\/(jobs?|tasks?|cron|schedulers?)\//i.test(p),
    confidence: 0.85,
    reason: "Background job/task file",
  },
  {
    category: "async",
    test: (p) => /\/(subscribers?|listeners?|events?)\//i.test(p),
    confidence: 0.8,
    reason: "Event subscriber/listener",
  },

  // Schema (DB)
  {
    category: "schema",
    test: (p) => /\/(migrations?)\//i.test(p),
    confidence: 0.95,
    reason: "Database migration file",
  },
  {
    category: "schema",
    test: (p) => /\.prisma$/.test(p),
    confidence: 0.95,
    reason: "Prisma schema file",
  },
  {
    category: "schema",
    test: (p) => /\.(sql)$/.test(p) && !/\/(migrations?)\//i.test(p),
    confidence: 0.8,
    reason: "SQL file (likely schema-related)",
  },
  {
    category: "schema",
    test: (p) => /\/(seeds?|fixtures?)\//i.test(p) && /\.sql$/.test(p),
    confidence: 0.7,
    reason: "Database seed/fixture SQL",
  },

  // Shared component
  {
    category: "shared-component",
    test: (p) => /\/(shared|common|utils?|helpers?|lib)\//i.test(p),
    confidence: 0.8,
    reason: "Shared/common module",
  },
  {
    category: "shared-component",
    test: (p) => /\/(packages?|libs?)\//i.test(p) && !/node_modules/.test(p),
    confidence: 0.75,
    reason: "Monorepo shared package",
  },

  // Feature flag
  {
    category: "feature-flag",
    test: (p) =>
      /\/(features?)\/(flags?|toggles?)/i.test(p) ||
      /feature[-_]?(flags?|toggles?)/i.test(p),
    confidence: 0.9,
    reason: "Feature flag configuration",
  },
  {
    category: "feature-flag",
    test: (p) => /\/(features?)\//i.test(p) && /flags?\.(ts|js|json)$/i.test(p),
    confidence: 0.85,
    reason: "Feature flag file",
  },

  // Cross-service
  {
    category: "cross-service",
    test: (p) => /\.proto$/.test(p),
    confidence: 0.95,
    reason: "Protocol Buffers definition (gRPC)",
  },
  {
    category: "cross-service",
    test: (p) => /openapi\.(yaml|yml|json)$/.test(p),
    confidence: 0.9,
    reason: "OpenAPI specification",
  },
  {
    category: "cross-service",
    test: (p) => /swagger\.(yaml|yml|json)$/.test(p),
    confidence: 0.9,
    reason: "Swagger/OpenAPI specification",
  },
  {
    category: "cross-service",
    test: (p) => /\/(graphql|gql)\//i.test(p) || /\.(graphql|gql)$/.test(p),
    confidence: 0.85,
    reason: "GraphQL schema/query definition",
  },
  {
    category: "cross-service",
    test: (p) => /\/(clients?|sdk|integrations?)\//i.test(p),
    confidence: 0.75,
    reason: "Service client/integration module",
  },
];

export function classifyFileChange(
  file: ChangedFile,
): readonly CategorizedChange[] {
  const matches: CategorizedChange[] = [];
  const seenCategories = new Set<string>();

  for (const rule of PATH_RULES) {
    if (rule.test(file.path) && !seenCategories.has(rule.category)) {
      seenCategories.add(rule.category);
      matches.push({
        category: rule.category,
        confidence: rule.confidence,
        reason: rule.reason,
      });
    }
  }

  return matches;
}
