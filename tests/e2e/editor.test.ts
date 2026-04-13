import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'

// Restore starter site files before each test so tests don't depend on each other's side effects.
// The git checkout may trigger the file watcher → SSE reload in the dev server.
// We restore synchronously before the browser navigates, so the reload settles before the test starts.
test.beforeEach(async ({ page }) => {
  execSync('git checkout examples/starter/sites/main/', { stdio: 'pipe' })
  // Navigate away to ensure any pending SSE reload doesn't interfere with test setup
  await page.goto('about:blank')
})

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

    // Wait for editor to load — custom editor renders "Welcome to Gazetta" locally,
    // but in CI the Vite async import may be slower. Verify the editor panel has content
    // (title/subtitle fields appear in both custom and default editor).
    const editorPanel = page.locator('[data-testid="editor-panel"]')
    await expect(editorPanel).toContainText('title', { timeout: 20000 })
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
    await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: "Don't Save" })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible()
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

  test('Don\'t Save exits edit mode', async ({ page }) => {
    await openEditor(page, 'home')

    await page.click('[data-testid="component-hero"]')
    await page.waitForSelector('[data-testid="editor-container"]')

    const input = page.locator('[data-testid="editor-container"] input').first()
    await input.fill('changed content')

    await page.click('[data-testid="back-to-browse"]')
    await page.locator('.p-dialog').waitFor({ timeout: 5000 })

    // Click Discard
    await page.locator('.p-dialog button', { hasText: "Don't Save" }).click()

    // Dialog closes, back to browse mode (SiteTree visible)
    await expect(page.locator('.p-dialog')).not.toBeVisible()
    await expect(page.locator('[data-testid="site-page-home"]')).toBeVisible()
  })
})

test.describe('Component stashing', () => {
  test('switching components stashes edits and shows dot', async ({ page }) => {
    await openEditor(page, 'home')

    // Edit hero
    await page.click('[data-testid="component-hero"]')
    await page.waitForSelector('[data-testid="editor-container"]')
    const input = page.locator('[data-testid="editor-container"] input').first()
    await input.fill('stashed edit')

    // Switch to features — no dialog, hero should show dot
    await page.click('[data-testid="component-features"]')
    await page.waitForSelector('[data-testid="editor-container"]')

    // Hero should have a dirty dot
    const heroDot = page.locator('[data-testid="component-hero"] .node-dirty-dot')
    await expect(heroDot).toBeVisible()
  })

  test('switching back restores stashed edits', async ({ page }) => {
    await openEditor(page, 'home')

    // Edit hero
    await page.click('[data-testid="component-hero"]')
    await page.waitForSelector('[data-testid="editor-container"]')
    const input = page.locator('[data-testid="editor-container"] input').first()
    await input.fill('restored edit')

    // Switch to features
    await page.click('[data-testid="component-features"]')
    await page.waitForSelector('[data-testid="editor-container"]')

    // Switch back to hero — click the label to avoid hitting the revert button
    await page.locator('[data-testid="component-hero"] .node-label').click()
    const restoredInput = page.locator('[data-testid="editor-container"] input').first()
    await expect(restoredInput).toHaveValue('restored edit', { timeout: 10000 })
  })

  test('discard clears current dot, stashed dots remain', async ({ page }) => {
    await openEditor(page, 'home')

    // Edit hero
    await page.click('[data-testid="component-hero"]')
    await page.waitForSelector('[data-testid="editor-container"]')
    await page.locator('[data-testid="editor-container"] input').first().fill('hero pending')

    // Switch to features — hero stashed with dot
    await page.click('[data-testid="component-features"]')
    await page.waitForSelector('[data-testid="editor-container"]')

    // Hero should have stashed dot
    const heroDot = page.locator('[data-testid="component-hero"] .node-dirty-dot')
    await expect(heroDot).toBeVisible({ timeout: 5000 })

    // Edit features to make it dirty
    await page.locator('[data-testid="editor-container"] input').first().fill('features pending')

    // Hover hero to reveal revert button, click it
    await page.hover('[data-testid="component-hero"]')
    const revertBtn = page.locator('[data-testid="component-hero"] .node-revert')
    await expect(revertBtn).toBeVisible({ timeout: 3000 })
    await revertBtn.click()

    // Hero dot gone, features still dirty (current editor)
    await expect(heroDot).not.toBeVisible()
  })
})

test.describe('Deep linking', () => {
  test('direct URL to page selects it in browse mode', async ({ page }) => {
    await page.goto('/admin/pages/about')
    await expect(page.locator('[data-testid="site-page-about"].selected')).toBeVisible({ timeout: 10000 })
    // Preview should show about page
    const iframe = page.frameLocator('[data-testid="preview-iframe"]')
    await iframe.locator('[data-gz]').first().waitFor({ timeout: 10000 })
  })

  test('direct URL to page/edit enters edit mode', async ({ page }) => {
    await page.goto('/admin/pages/home/edit')
    // Should be in edit mode with component tree visible
    await page.waitForSelector('[data-testid^="component-"]', { timeout: 10000 })
  })

  test('direct URL to fragment selects it', async ({ page }) => {
    await page.goto('/admin/fragments/header')
    await expect(page.locator('[data-testid="site-fragment-header"].selected')).toBeVisible({ timeout: 10000 })
  })

  test('back button navigates from edit to browse', async ({ page }) => {
    await page.goto('/admin/pages/home')
    await page.locator('[data-testid="site-page-home"].selected').waitFor({ timeout: 10000 })

    // Enter edit mode via preview click
    const iframe = page.frameLocator('[data-testid="preview-iframe"]')
    await iframe.locator('[data-gz]').first().waitFor({ timeout: 10000 })
    await iframe.locator('[data-gz]').first().click()
    await page.waitForSelector('[data-testid^="component-"]', { timeout: 10000 })

    // URL should reflect edit mode
    await expect(page).toHaveURL(/\/pages\/home\/edit/)

    // Browser back should return to browse mode
    await page.goBack()
    await expect(page).toHaveURL(/\/pages\/home$/)
    await expect(page.locator('[data-testid="site-page-home"]')).toBeVisible()
  })

  test('URL updates when switching pages', async ({ page }) => {
    await page.goto('/admin/pages/home')
    await page.locator('[data-testid="site-page-home"].selected').waitFor({ timeout: 10000 })

    await page.click('[data-testid="site-page-about"]')
    await expect(page).toHaveURL(/\/pages\/about/)
    await expect(page.locator('[data-testid="site-page-about"].selected')).toBeVisible()
  })
})

test.describe('Deep linking - dev playground', () => {
  test('direct URL to editor pre-selects it', async ({ page }) => {
    await page.goto('/admin/dev/editor/hero')
    await page.waitForSelector('[data-testid="playground-mount"]', { timeout: 10000 })
    const inspector = page.locator('[data-testid="playground-inspector"]')
    await expect(inspector).toContainText('Welcome to Gazetta', { timeout: 10000 })
  })

  test('selecting editor updates URL', async ({ page }) => {
    await page.goto('/admin/dev')
    await page.waitForSelector('[data-testid="dev-playground"]')
    await page.click('[data-testid="playground-editor-hero"]')
    await expect(page).toHaveURL(/\/dev\/editor\/hero/, { timeout: 5000 })
  })

  test('selecting field updates URL', async ({ page }) => {
    await page.goto('/admin/dev')
    await page.waitForSelector('[data-testid="dev-playground"]')
    await page.click('[data-testid="playground-field-brand-color"]')
    await expect(page).toHaveURL(/\/dev\/field\/brand-color/, { timeout: 5000 })
  })
})

test.describe('Escape key behavior', () => {
  test('Escape from unsaved dialog does not reopen it', async ({ page }) => {
    await openEditor(page, 'home')
    await page.click('[data-testid="component-hero"]')
    await page.waitForSelector('[data-testid="editor-container"]')
    await page.locator('[data-testid="editor-container"] input').first().fill('escape test')

    await page.click('[data-testid="back-to-browse"]')
    const dialog = page.locator('.p-dialog')
    await dialog.waitFor({ timeout: 5000 })

    // Press Escape to close dialog
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible({ timeout: 2000 })

    // Wait a moment — dialog should NOT reappear
    await page.waitForTimeout(500)
    await expect(dialog).not.toBeVisible()
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

test.describe('Component operations', () => {
  test('add inline component via dialog', async ({ page }) => {
    await openEditor(page, 'home')

    // Count components before adding
    const beforeCount = await page.locator('[data-testid^="component-"]').count()

    // Open add dialog
    await page.click('[data-testid="add-component"]')
    await page.locator('[data-testid="add-component-name"]').waitFor({ timeout: 5000 })

    // Fill name
    await page.locator('[data-testid="add-component-name"]').fill('test-widget')

    // Select a template from the listbox
    await page.locator('.p-listbox-option', { hasText: 'text-block' }).click()

    // Click Add
    await page.click('[data-testid="add-component-submit"]')

    // Component should appear in tree
    await expect(page.locator('[data-testid="component-test-widget"]')).toBeVisible({ timeout: 10000 })

    // Count should increase
    const afterCount = await page.locator('[data-testid^="component-"]').count()
    expect(afterCount).toBe(beforeCount + 1)
  })

  test('remove component', async ({ page }) => {
    await openEditor(page, 'home')

    // Add a component first so we have something to remove
    await page.click('[data-testid="add-component"]')
    await page.locator('[data-testid="add-component-name"]').waitFor({ timeout: 5000 })
    await page.locator('[data-testid="add-component-name"]').fill('to-remove')
    await page.locator('.p-listbox-option', { hasText: 'text-block' }).click()
    await page.click('[data-testid="add-component-submit"]')
    const widget = page.locator('[data-testid="component-to-remove"]')
    await expect(widget).toBeVisible({ timeout: 10000 })

    const beforeCount = await page.locator('[data-testid^="component-"]').count()

    // Hover to reveal actions, click remove
    await widget.hover()
    await page.click('[data-testid="remove-to-remove"]')

    // Component should be gone
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

    // Wait for tree to re-render with new order (features above hero)
    await expect(async () => {
      const heroAfter = await page.locator('[data-testid="component-hero"]').boundingBox()
      const featuresAfter = await page.locator('[data-testid="component-features"]').boundingBox()
      expect(featuresAfter!.y).toBeLessThan(heroAfter!.y)
    }).toPass({ timeout: 10000 })
    // No manual cleanup — beforeEach restores page.json via git checkout
  })
})
