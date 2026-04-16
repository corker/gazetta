import { test, expect } from './fixtures'
import { openEditor } from './helpers'

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
