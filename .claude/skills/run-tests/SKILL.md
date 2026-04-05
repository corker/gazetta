---
name: run-tests
description: Detect which package changed and run the correct test suite
disable-model-invocation: true
allowed-tools: Bash Glob Grep Read
---

Determine which packages have changes and run their tests:

1. Check git status for changed files
2. Map changed files to packages (`apps/web/`, `packages/core/`)
3. Run `npm test` in each affected package
4. Report results with pass/fail summary
