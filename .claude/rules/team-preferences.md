# Team Preferences

Validated approaches and things to avoid. Each entry: rule, then why.

1. **No auto-save in CMS.** Edits stay in memory until explicit save. Preview uses POST with draft content overrides.
   Why: Auto-save doesn't fit the CMS UX — content authors need control over when changes are persisted.

2. **Use testcontainers for Docker-based integration tests, not docker-compose.**
   Why: Testcontainers manage lifecycle programmatically — cleaner setup/teardown, no manual docker-compose up.

3. **Use data-testid attributes for Playwright selectors, not CSS classes or aria-labels.**
   Why: CSS/aria selectors are brittle — break when PrimeVue updates or labels change. Test IDs are stable.

4. **Write tests alongside new functionality, in the same commit.**
   Why: Tests added as follow-up commits get forgotten or deprioritized. Ship tested code, not code then tests.

5. **Types infer from Zod schema — single source of truth.**
   Use `type Content = z.infer<typeof schema>` and `TemplateFunction<Content>`. Don't duplicate types manually.

6. **Content, not props.** The CMS vocabulary is "content" — matches what content authors see. Don't use React terminology (props) in CMS/template code.

7. **Consistent naming across CLI, UI, and API.** If the CMS button says "Publish", the CLI command is `gazetta publish`, the API endpoint is `/api/publish`. Don't use synonyms (build, deploy, push) for the same action. One word per concept.

8. **Update docs in the same commit as the feature.** When adding or changing user-facing behavior, update getting-started.md and gazetta.studio docs in the same commit. Don't leave docs as a follow-up.
   Why: Docs that lag behind the code mislead users and create extra issues to track.

9. **npm release: bump version, lockfile, commit, tag — all together.**
   When bumping the gazetta package version:
   ```
   npm version <patch|minor|major> -w packages/gazetta
   git add packages/gazetta/package.json package-lock.json
   git commit -m "Bump gazetta to v$(node -p "require('./packages/gazetta/package.json').version")"
   git tag "v$(node -p "require('./packages/gazetta/package.json').version")"
   git push && git push --tags
   ```
   `npm version -w` updates package.json and lockfile but does NOT commit or tag (disabled for workspaces). Must do it manually.
   Why: v0.1.1 shipped with lockfile out of sync because the commit and tag were done without the lockfile.

10. **E2e test isolation: scope git checkout to mutating tests only, not global beforeEach.**
   Only tests that write to disk (add/remove/move component) need `beforeEach` with `git checkout`. Read-only tests must not have it — the file change triggers SSE reload which clears editor state mid-test.
   Why: Global beforeEach caused 5 CI failures. The SSE reload from git checkout arrived late in CI and clobbered component selections in unrelated tests.

11. **When adding CI steps, verify assumptions locally first.**
   Before pushing CI changes, check: default parallelism settings, async import behavior, file watcher side effects, and timing differences between local and CI. One fact-check round saves multiple CI push-fix cycles.
   Why: The e2e CI setup took 5 pushes because we assumed Playwright defaults, SSE timing, and Vite import behavior without verifying.

12. **Dark mode CSS: use non-scoped `<style>` block, not `:global(.dark)` in scoped styles.**
   Scoped selectors get `[data-v-xxx]` attributes which beat `:global(.dark)` in specificity. Put dark overrides in a separate `<style>` (no `scoped`) using `.dark .component-name` selectors. Follow PreviewPanel's pattern.
   Why: ComponentTree dark mode was broken — `:global(.dark) .node-root .node-label` lost to `.node-root .node-label[data-v-xxx]`.
