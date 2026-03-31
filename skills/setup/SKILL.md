---
name: setup
description: Initialize config, workspace state, and progress tracking for the exploratory testing plugin.
---

# Setup

## Purpose

Prepare the project workspace so later skills can resume from files and local state instead of chat history.

## Current status

Implemented in `#7`.

## Intended outputs

- `config.json`
- `exploratory-testing.db`
- `.exploratory-testing/progress/progress-summary.md`
- `.exploratory-testing/progress/01-setup.md`

## Intended CLI boundary

- `exploratory-testing setup`
- `exploratory-testing db init`
- `exploratory-testing progress summary`
- `exploratory-testing progress handover`

## Notes

- `config.json` stores relative paths.
- CLI loads `config.json`, resolves absolute paths, and writes through TypeScript modules only.
- Progress files use markdown with YAML frontmatter and are mirrored into the local SQLite state store.
