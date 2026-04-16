import { test, expect } from './fixtures'
import { openEditor } from './helpers'

test.describe('Component operations', () => {
  // These tests mutate page.json on disk via the API. Isolation comes from the
  // worker-scoped testSite fixture — each Playwright worker has its own copy
  // of the starter site. Tests within the file share state; each one uses a
  // unique component name so they don't collide.

  test('add inline component via dialog', async ({ page }, testInfo) => {
    await openEditor(page, 'home')
    const name = `test-add-${testInfo.testId}`

    const beforeCount = await page.locator('[data-testid^="component-"]').count()

    await page.click('[data-testid="add-component"]')
    await page.locator('[data-testid="add-component-name"]').waitFor({ timeout: 5000 })
    await page.locator('[data-testid="add-component-name"]').fill(name)
    await page.locator('.p-listbox-option', { hasText: 'text-block' }).click()
    await page.click('[data-testid="add-component-submit"]')

    await expect(page.locator(`[data-testid="component-${name}"]`)).toBeVisible({ timeout: 10000 })
    const afterCount = await page.locator('[data-testid^="component-"]').count()
    expect(afterCount).toBe(beforeCount + 1)
  })

  test('remove component', async ({ page }, testInfo) => {
    await openEditor(page, 'home')
    const name = `test-remove-${testInfo.testId}`

    // Add a component first so we have something to remove
    await page.click('[data-testid="add-component"]')
    await page.locator('[data-testid="add-component-name"]').waitFor({ timeout: 5000 })
    await page.locator('[data-testid="add-component-name"]').fill(name)
    await page.locator('.p-listbox-option', { hasText: 'text-block' }).click()
    await page.click('[data-testid="add-component-submit"]')
    const widget = page.locator(`[data-testid="component-${name}"]`)
    await expect(widget).toBeVisible({ timeout: 10000 })

    const beforeCount = await page.locator('[data-testid^="component-"]').count()

    await widget.hover()
    await page.click(`[data-testid="remove-${name}"]`)

    await expect(widget).not.toBeVisible({ timeout: 10000 })
    const afterCount = await page.locator('[data-testid^="component-"]').count()
    expect(afterCount).toBe(beforeCount - 1)
  })

  test('move component changes order', async ({ page }) => {
    await openEditor(page, 'home')

    // hero should be above features in the tree
    const heroBefore = await page.locator('[data-testid="component-hero"]').boundingBox()
    const featuresBefore = await page.locator('[data-testid="component-features"]').boundingBox()
    expect(heroBefore!.y).toBeLessThan(featuresBefore!.y)

    // Move features up — it should swap with hero
    await page.locator('[data-testid="component-features"]').hover()
    await page.click('[data-testid="move-up-features"]')

    await expect(async () => {
      const heroAfter = await page.locator('[data-testid="component-hero"]').boundingBox()
      const featuresAfter = await page.locator('[data-testid="component-features"]').boundingBox()
      expect(featuresAfter!.y).toBeLessThan(heroAfter!.y)
    }).toPass({ timeout: 10000 })

    // Restore order so subsequent tests see hero above features
    await page.locator('[data-testid="component-features"]').hover()
    await page.click('[data-testid="move-down-features"]')
    await expect(async () => {
      const heroAfter = await page.locator('[data-testid="component-hero"]').boundingBox()
      const featuresAfter = await page.locator('[data-testid="component-features"]').boundingBox()
      expect(heroAfter!.y).toBeLessThan(featuresAfter!.y)
    }).toPass({ timeout: 10000 })
  })
})
