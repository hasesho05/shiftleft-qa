---
description: Standalone function type definitions are forbidden per AGENT.md
paths:
  - "**/*.ts"
---

# No standalone function types

Do NOT define standalone function types as `type` aliases or callable `interface` signatures.

## Forbidden

```ts
type Handler = (input: Input) => Output;

interface Handler {
  (input: Input): Output;
}
```

## Preferred alternatives

Use concrete function declarations:

```ts
export function handle(input: Input): Output {
  return buildOutput(input);
}
```

Use inline annotations:

```ts
items.map((item: Item) => transform(item));
```

When a function parameter accepts a callback, annotate it inline:

```ts
function retry(fn: () => Promise<void>, attempts: number): Promise<void> { ... }
```

Do NOT extract the callback shape into a standalone type alias.

## Also avoid

- `Parameters<typeof fn>[N]` when a named type is available — import the named type directly instead.
- `ReturnType<typeof fn>` when the return type can be stated explicitly.
