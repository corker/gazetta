/**
 * Matrix test — production destinations gate the Publish button with
 * an explicit confirmation banner, regardless of editable/type axes.
 *
 * Non-production destinations publish in one click, even when they're
 * read-only or dynamic. The prod-confirm gate is specifically tied to
 * `environment === 'production'` and must not be bypassed by type or
 * editable combinations.
 *
 * Runs against tests/fixtures/sites/target-matrix/. The matrix site's
 * first target (local-edit) is the active source by default; each row
 * here picks a different destination and asserts on the confirmation
 * behavior.
 */
import { test, expect } from '@playwright/test'

/**
 * Destinations grouped by whether they should trigger the prod-confirm
 * banner. The gating contract: production → banner; staging/local →
 * immediate publish. editable and type don't affect this.
 */
const destinations = [
  { name: 'local-ro', env: 'local', editable: false, type: 'static', requiresConfirm: false },
  { name: 'local-dyn', env: 'local', editable: true, type: 'dynamic', requiresConfirm: false },
  { name: 'staging-ro', env: 'staging', editable: false, type: 'static', requiresConfirm: false },
  { name: 'staging-edit', env: 'staging', editable: true, type: 'static', requiresConfirm: false },
  { name: 'prod-ro', env: 'production', editable: false, type: 'static', requiresConfirm: true },
  { name: 'prod-edit', env: 'production', editable: true, type: 'static', requiresConfirm: true },
  { name: 'prod-dyn', env: 'production', editable: false, type: 'dynamic', requiresConfirm: true },
] as const

test.describe('Publish confirmation matrix', () => {
  for (const row of destinations) {
    test(`dest=${row.name} (env=${row.env}) → requiresConfirm=${row.requiresConfirm}`, async ({ page }) => {
      await page.goto('/admin')
      await page.locator('[data-testid="publish-btn"]').click()
      await expect(page.locator('[data-testid="publish-panel"]')).toBeVisible()

      // Pick this row's destination. Because local-edit is the default
      // active/source, it won't appear in the destinations list — that's
      // fine, the matrix only enumerates non-local-edit rows.
      await page.locator(`[data-testid="publish-dest-${row.name}"]`).click()

      // Wait for compare to complete — either items appear or "in sync".
      // Dynamic targets may report "in sync" despite content differences
      // because sidecar hashes match the rendered output.
      const itemOrSync = await Promise.race([
        page
          .locator('[data-testid="publish-item-pages/home"]')
          .waitFor({ timeout: 10000 })
          .then(() => 'items' as const),
        page
          .locator('text=Nothing to publish')
          .waitFor({ timeout: 10000 })
          .then(() => 'sync' as const),
      ])

      if (itemOrSync === 'sync') {
        // In sync — confirmation behavior is moot. Verify no banner and move on.
        await expect(page.locator('[data-testid="publish-confirm-banner"]')).toHaveCount(0)
        await page.locator('[data-testid="publish-panel-cancel"]').click()
        return
      }

      // Click Publish. Prod destinations should reveal the confirm banner
      // without dispatching; non-prod should proceed to the stream/result.
      await page.locator('[data-testid="publish-panel-confirm"]').click()

      if (row.requiresConfirm) {
        await expect(page.locator('[data-testid="publish-confirm-banner"]')).toBeVisible()
        await expect(page.locator('[data-testid="publish-panel-confirm-prod"]')).toBeVisible()
        // Step back to reset state for the next test in the same worker.
        await page.locator('button', { hasText: 'Back' }).click()
        await page.locator('[data-testid="publish-panel-cancel"]').click()
      } else {
        // Banner must NOT appear — either the Done button lands (fast
        // publish) or the progress block is in flight.
        await expect(page.locator('[data-testid="publish-confirm-banner"]')).toHaveCount(0)
        // Wait for the stream to complete before moving on.
        await expect(page.locator('[data-testid="publish-panel-done"]')).toBeVisible({ timeout: 15000 })
        await page.locator('[data-testid="publish-panel-done"]').click()
      }
    })
  }
})
