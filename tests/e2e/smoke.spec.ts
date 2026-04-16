import { test, expect } from './fixtures'

test.describe('Admin loads', () => {
  test('site tree shows pages and fragments', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.locator('[data-testid="site-page-home"]')).toBeVisible()
    await expect(page.locator('[data-testid="site-page-about"]')).toBeVisible()
    await expect(page.locator('[data-testid="site-fragment-header"]')).toBeVisible()
    await expect(page.locator('[data-testid="site-fragment-footer"]')).toBeVisible()
  })
})

test.describe('Toolbar tooltips', () => {
  test('publish button is enabled when there are no pending edits', async ({ page }) => {
    await page.goto('/admin')
    const publish = page.locator('[data-testid="publish-btn"]')
    // Unified Publish panel is no longer selection-scoped — it opens for
    // any target→target flow as long as there are no unsaved edits.
    await expect(publish).toBeEnabled()
    await expect(publish).toHaveAttribute('title', 'Publish')
  })
})
