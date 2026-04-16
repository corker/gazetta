import { test, expect } from './fixtures'
import { SiteTreePom } from './pages/SiteTree'

test.describe('Admin loads', () => {
  test('site tree shows pages and fragments', async ({ page }) => {
    await page.goto('/admin')
    const tree = new SiteTreePom(page)
    await expect(tree.pageRow('home')).toBeVisible()
    await expect(tree.pageRow('about')).toBeVisible()
    await expect(tree.fragmentRow('header')).toBeVisible()
    await expect(tree.fragmentRow('footer')).toBeVisible()
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
