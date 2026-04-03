import type { PrMetadata } from "../../../src/exploratory-testing/models/pr-intake";

/**
 * Mock PR metadata for "OrderFlow" — an order management system.
 *
 * 11 changed files are designed to trigger all 10 change categories:
 * ui, api, validation, state-transition, permission, async,
 * schema, shared-component, feature-flag, cross-service.
 *
 * The last file (order-form.tsx) spans 3 categories to trigger
 * the decision-table framework (threshold: 3+ categories on one file).
 */
export function createOrderFlowPrMetadata(): PrMetadata {
  return {
    provider: "github",
    repository: "acme/order-flow",
    prNumber: 100,
    title: "Add order management with premium checkout",
    description:
      "Implements order CRUD, checkout flow with feature flags, and payment gateway integration.",
    author: "bob",
    baseBranch: "main",
    headBranch: "feature/order-management",
    headSha: "a1b2c3d4",
    linkedIssues: ["ACME-200", "ACME-201"],
    changedFiles: [
      // ui
      {
        path: "src/components/OrderSummary.tsx",
        status: "added",
        additions: 120,
        deletions: 0,
        previousPath: null,
      },
      // api
      {
        path: "src/api/routes/orders.ts",
        status: "modified",
        additions: 45,
        deletions: 10,
        previousPath: null,
      },
      // validation
      {
        path: "src/validators/order-schema.ts",
        status: "added",
        additions: 60,
        deletions: 0,
        previousPath: null,
      },
      // state-transition
      {
        path: "src/store/order-state.ts",
        status: "modified",
        additions: 35,
        deletions: 8,
        previousPath: null,
      },
      // permission
      {
        path: "src/middleware/auth/verify-token.ts",
        status: "modified",
        additions: 25,
        deletions: 5,
        previousPath: null,
      },
      // async
      {
        path: "src/workers/order-fulfillment.ts",
        status: "added",
        additions: 90,
        deletions: 0,
        previousPath: null,
      },
      // schema (migration)
      {
        path: "prisma/migrations/20260401_orders.sql",
        status: "added",
        additions: 40,
        deletions: 0,
        previousPath: null,
      },
      // shared-component
      {
        path: "src/lib/format-currency.ts",
        status: "modified",
        additions: 10,
        deletions: 3,
        previousPath: null,
      },
      // feature-flag
      {
        path: "src/features/flags/premium-checkout.ts",
        status: "added",
        additions: 30,
        deletions: 0,
        previousPath: null,
      },
      // cross-service
      {
        path: "src/clients/payment-gateway.ts",
        status: "modified",
        additions: 50,
        deletions: 15,
        previousPath: null,
      },
      // multi-category: ui (.tsx) + validation (/validators/) + shared-component (/shared/)
      // → triggers decision-table (3+ categories on one file)
      {
        path: "src/shared/validators/order-form.tsx",
        status: "added",
        additions: 85,
        deletions: 0,
        previousPath: null,
      },
    ],
    reviewComments: [
      {
        author: "carol",
        body: "Consider adding rate limiting to the payment gateway client.",
        path: "src/clients/payment-gateway.ts",
        createdAt: "2026-04-01T12:00:00Z",
      },
    ],
    fetchedAt: "2026-04-01T00:00:00Z",
  };
}
