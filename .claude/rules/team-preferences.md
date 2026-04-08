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
