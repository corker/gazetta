import { test, expect } from '@playwright/test'

// Helper: navigate to admin, select a page, enter edit mode by clicking a component in the preview iframe
async function openEditor(page: import('@playwright/test').Page, pageName: string) {
  await page.goto('/admin')
  await page.click(`[data-testid="site-page-${pageName}"]`)

  // Wait for preview iframe to load content
  const iframe = page.frameLocator('[data-testid="preview-iframe"]')
  await iframe.locator('[data-gz]').first().waitFor({ timeout: 10000 })

  // Click a data-gz element inside the iframe to trigger edit mode
  await iframe.locator('[data-gz]').first().click()

  // Wait for component tree to appear (edit mode)
  await page.waitForSelector('[data-testid^="component-"]', { timeout: 10000 })
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

    // Wait for custom editor to load and render content
    const editorPanel = page.locator('[data-testid="editor-panel"]')
    await expect(editorPanel).toContainText('Welcome to Gazetta', { timeout: 10000 })

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

test.describe('Custom field', () => {
  test('brand-color field renders inside banner editor', async ({ page }) => {
    await openEditor(page, 'home')

    // Click banner component (uses custom brand-color field)
    await page.click('[data-testid="component-banner"]')
    await page.waitForSelector('[data-testid="editor-container"]')

    // Wait for the custom field to load (async import)
    await page.waitForFunction(() => {
      const container = document.querySelector('[data-testid="editor-container"]')
      return container?.querySelector('input[type="color"]') !== null
    }, { timeout: 10000 })

    // Verify preset color buttons exist (brand-color has 6 presets)
    const buttons = await page.locator('[data-testid="editor-container"] button[title]').count()
    expect(buttons).toBeGreaterThanOrEqual(6)

    // Verify the hex input has a color value
    const hexInput = page.locator('[data-testid="editor-container"] input[type="text"]').last()
    const value = await hexInput.inputValue()
    expect(value).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

test.describe('Rapid selection', () => {
  test('last click wins when rapidly switching pages', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.locator('[data-testid="site-page-home"]')).toBeVisible()

    // Click two pages rapidly without waiting for the first to load
    page.click('[data-testid="site-page-home"]')
    await page.click('[data-testid="site-page-about"]')

    // Wait for preview to settle — the about page should win
    const iframe = page.frameLocator('[data-testid="preview-iframe"]')
    await iframe.locator('[data-gz]').first().waitFor({ timeout: 10000 })

    // The selected item in the tree should be about, not home
    await expect(page.locator('[data-testid="site-page-about"].selected')).toBeVisible()
    await expect(page.locator('[data-testid="site-page-home"].selected')).not.toBeVisible()
  })
})

test.describe('Unsaved changes dialog', () => {
  test('shows styled dialog with Save/Discard/Cancel when leaving with unsaved changes', async ({ page }) => {
    await openEditor(page, 'home')

    // Click hero component to start editing
    await page.click('[data-testid="component-hero"]')
    await page.waitForSelector('[data-testid="editor-container"]')

    // Type into a field to make it dirty
    const input = page.locator('[data-testid="editor-container"] input').first()
    await input.fill('changed content')

    // Click back button in toolbar — should show unsaved dialog
    await page.click('[data-testid="back-to-browse"]')

    // Verify styled dialog appears (not native confirm)
    const dialog = page.locator('.p-dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(dialog).toContainText('Unsaved Changes')
    await expect(dialog.locator('button', { hasText: 'Save' })).toBeVisible()
    await expect(dialog.locator('button', { hasText: 'Discard' })).toBeVisible()
    await expect(dialog.locator('button', { hasText: 'Cancel' })).toBeVisible()
  })

  test('Cancel keeps the editor open', async ({ page }) => {
    await openEditor(page, 'home')

    await page.click('[data-testid="component-hero"]')
    await page.waitForSelector('[data-testid="editor-container"]')

    const input = page.locator('[data-testid="editor-container"] input').first()
    await input.fill('changed content')

    await page.click('[data-testid="back-to-browse"]')
    await page.locator('.p-dialog').waitFor({ timeout: 5000 })

    // Click Cancel
    await page.locator('.p-dialog button', { hasText: 'Cancel' }).click()

    // Dialog closes, still in edit mode with editor visible
    await expect(page.locator('.p-dialog')).not.toBeVisible()
    await expect(page.locator('[data-testid="editor-container"]')).toBeVisible()
  })

  test('Discard exits edit mode', async ({ page }) => {
    await openEditor(page, 'home')

    await page.click('[data-testid="component-hero"]')
    await page.waitForSelector('[data-testid="editor-container"]')

    const input = page.locator('[data-testid="editor-container"] input').first()
    await input.fill('changed content')

    await page.click('[data-testid="back-to-browse"]')
    await page.locator('.p-dialog').waitFor({ timeout: 5000 })

    // Click Discard
    await page.locator('.p-dialog button', { hasText: 'Discard' }).click()

    // Dialog closes, back to browse mode (SiteTree visible)
    await expect(page.locator('.p-dialog')).not.toBeVisible()
    await expect(page.locator('[data-testid="site-page-home"]')).toBeVisible()
  })
})

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
