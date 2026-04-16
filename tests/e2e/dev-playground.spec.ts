import { test, expect } from './fixtures'

test.describe('Dev playground', () => {
  test('loads and shows sidebar with editors and fields', async ({ page }) => {
    await page.goto('/admin/dev')
    await page.waitForSelector('[data-testid="dev-playground"]')

    // Should show custom editors section with hero
    await expect(page.locator('[data-testid="playground-editor-hero"]')).toBeVisible()

    // Should show custom fields section with brand-color
    await expect(page.locator('[data-testid="playground-field-brand-color"]')).toBeVisible()
  })

  test('mounts editor with real content on click', async ({ page }) => {
    await page.goto('/admin/dev')
    await page.waitForSelector('[data-testid="dev-playground"]')

    await page.click('[data-testid="playground-editor-hero"]')
    await page.waitForSelector('[data-testid="playground-mount"]', { timeout: 10000 })

    // Value inspector should show real content
    const inspector = page.locator('[data-testid="playground-inspector"]')
    await expect(inspector).toContainText('Welcome to Gazetta', { timeout: 10000 })
  })

  test('mounts field widget on click', async ({ page }) => {
    await page.goto('/admin/dev')
    await page.waitForSelector('[data-testid="dev-playground"]')

    await page.click('[data-testid="playground-field-brand-color"]')
    await page.waitForSelector('[data-testid="playground-mount"]', { timeout: 10000 })

    // Brand-color field should render color input
    await page.waitForFunction(() => {
      const mount = document.querySelector('[data-testid="playground-mount"]')
      return mount?.querySelector('input[type="color"]') !== null
    }, { timeout: 10000 })
  })

  test('toolbar has dev playground link', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.locator('[data-testid="dev-playground-link"]')).toBeVisible()
  })

  test('dev page has back-to-editor button', async ({ page }) => {
    await page.goto('/admin/dev')
    await expect(page.locator('[data-testid="back-to-editor"]')).toBeVisible()
  })
})
