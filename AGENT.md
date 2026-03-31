# AGENT.md

This file defines the required knowledge and coding rules for anyone working in this repository.

## Purpose

This repository builds a Claude Code Plugin for post-implementation exploratory testing.
The plugin must remain:

- TypeScript-first
- CLI-centered
- file-state-driven
- resumable across sessions
- reproducible without depending on chat history

## Required context before changing architecture

Read these files before making structural changes:

- `requirements.md`
- `stateful-workflow-plugin-framework.md`
- `README.md`
- `package.json`

Do not introduce an implementation that conflicts with these project constraints:

- state lives in files and local DB, not in conversation context
- advanced logic belongs in CLI code, not prompt-only behavior
- progress and handover documents are first-class artifacts
- the project targets Bun for development, but code should stay close to Node-compatible TypeScript

## Runtime and tools

- Runtime: `bun`
- Test runner: `vitest`
- Lint/format: `biome`
- SCM tooling: `gh`, `git`, optionally `glab`

Use these commands before finishing meaningful changes:

```bash
bun run lint
bun run typecheck
bun run test
```

## General implementation rules

- Prefer small, composable modules.
- Keep business logic in `src/exploratory-testing/**`, not in shell scripts.
- Prefer deterministic code over LLM-dependent behavior.
- Validate external input at boundaries.
- Do not store secrets in `config.json`.
- Prefer absolute paths when handing values to CLI or subprocess boundaries.
- Prefer named exports. Do not use default exports.
- Prefer pure functions unless state is necessary.
- Avoid classes unless they provide clear value for lifecycle or boundary management.

## TypeScript rules

### Hard rules

- Do not use `any`.
- Prefer `unknown` at boundaries, then narrow.
- Do not use `enum`.
- Do not use default exports.
- Do not define standalone function types.

Forbidden examples:

```ts
type Handler = (input: Input) => Output;

interface Handler {
  (input: Input): Output;
}
```

Preferred alternatives:

```ts
export function handle(input: Input): Output {
  return buildOutput(input);
}
```

```ts
items.map((item: Item) => transform(item));
```

- Exported functions must have explicit return types.
- Use discriminated unions for branching state.
- Use `readonly` and `as const` when values are not meant to change.
- Prefer objects over long positional parameter lists.
- Throw `Error` instances only. Never throw strings.

### Recommended conventions

- Prefer `type` for data shapes, unions, and DTOs.
- Use `interface` only when declaration merging or object-oriented extension is intentionally needed.
- Prefer function declarations over `const fn = () => {}` for top-level named behavior.
- Keep one responsibility per file.
- Keep parsing, persistence, and presentation separate.
- Model invalid states out of the type system when practical.
- Prefer explicit names over abbreviations.
- Prefer narrow return types over broad generic objects.
- Prefer `satisfies` over unsafe assertions when shaping constants.
- Minimize type assertions. If one is required, isolate it and justify it.

## Validation and schema rules

- Validate config, CLI input, and external JSON with `zod`.
- Keep parsed domain models separate from raw input models.
- Do not pass unvalidated external data deep into the system.

## CLI and subprocess rules

- CLI output intended for machine consumption must be JSON.
- Human-readable logs should not break structured output contracts.
- Wrap subprocess usage in reusable helpers.
- Prefer `execa` for higher-level subprocess handling once introduced in implementation code.
- SCM access must be abstracted behind repository/provider modules.

## Files, progress, and persistence

- Treat progress files and DB records as source of truth.
- Write concrete counts and concrete decisions into progress artifacts.
- Make resumability explicit.
- Design persistence to be idempotent for the same PR/MR input.
- Do not couple skills directly to SQL statements generated in prompts.

## Testing rules

- Use `vitest` for unit and integration tests.
- Add tests for every deterministic rule you introduce.
- Prefer fixture-driven tests for parsers, mappers, and risk logic.
- Test behavior, not implementation details.
- When fixing a bug, add or update a regression test first when practical.

## Repository workflow

- Keep changes aligned with the existing GitHub Issues.
- Prefer small issue-sized commits and PRs.
- If changing a project-wide rule, update this file too.

## Decision guidance

When multiple options are viable, choose the one that is:

1. more deterministic
2. easier to resume from files and DB
3. easier to test with Vitest
4. less coupled to Bun-specific APIs
5. clearer for future issue-driven development
