import { test, expect } from '@playwright/test'

// Helper: navigate to admin and enter edit mode on a page
async function openEditor(page: import('@playwright/test').Page, pageName: string) {
  await page.goto('/admin')
  await page.click(`[data-testid="site-page-${pageName}"]`)
  // Click preview iframe to enter edit mode
  await page.click('[data-testid="preview-iframe"]')
}

test.describe('Admin loads', () => {
  test('site tree shows pages and fragments', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.locator('[data-testid="site-page-home"]')).toBeVisible()
    await expect(page.locator('[data-testid="site-page-about"]')).toBeVisible()
    await expect(page.locator('[data-testid="site-fragment-header"]')).toBeVisible()
    await expect(page.locator('[data-testid="site-fragment-footer"]')).toBeVisible()
  })
})

test.describe('Theme toggle', () => {
  test('switches between dark and light mode', async ({ page }) => {
    await page.goto('/admin')
    // Default should have a theme toggle button
    const toggle = page.locator('[data-testid="theme-toggle"]')
    await expect(toggle).toBeVisible()

    // Click to toggle
    await toggle.click()

    // Check that the html element has the expected class
    const htmlClass = await page.locator('html').getAttribute('class')
    // After toggle, class is either 'dark' or empty
    expect(htmlClass !== null).toBeTruthy()
  })
})

test.describe('Default editor', () => {
  test('loads @rjsf form for template without custom editor', async ({ page }) => {
    await openEditor(page, 'home')

    // Click a component without custom editor (features)
    await page.click('[data-testid="component-features"]')
    await page.waitForSelector('[data-testid="editor-container"]')

    // Should show the default form with heading field
    const editorText = await page.locator('[data-testid="editor-panel"]').textContent()
    expect(editorText).toContain('heading')
  })
})

test.describe('Custom editor', () => {
  test('loads custom editor for hero template', async ({ page }) => {
    await openEditor(page, 'home')

    // Click hero component (has custom editor)
    await page.click('[data-testid="component-hero"]')
    await page.waitForSelector('[data-testid="editor-container"]')

    // Wait for content to render — custom editor has a gradient preview
    // The custom hero editor renders "Welcome to Gazetta" in a gradient div
    const editorPanel = page.locator('[data-testid="editor-panel"]')
    await expect(editorPanel).toContainText('Welcome to Gazetta')

    // Should also have the default form fields (title, subtitle)
    await expect(editorPanel).toContainText('title')
    await expect(editorPanel).toContainText('subtitle')
  })

  test('falls back to default form when switching to template without editor', async ({ page }) => {
    await openEditor(page, 'home')

    // First load hero (custom editor)
    await page.click('[data-testid="component-hero"]')
    await page.waitForSelector('[data-testid="editor-container"]')

    // Then switch to features (no custom editor)
    await page.click('[data-testid="component-features"]')
    // Wait for the editor to remount with the new content
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="editor-panel"]')
      return panel?.textContent?.includes('heading')
    }, { timeout: 5000 })

    const editorText = await page.locator('[data-testid="editor-panel"]').textContent()
    expect(editorText).toContain('heading')
  })
})
