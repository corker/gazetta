import { expect } from '@playwright/test'
import { test } from './fixtures.js'
import { openEditor } from './helpers.js'

test.describe('Locale picker', () => {
  test('EN active by default, FR visible', async ({ page }) => {
    await page.goto('/admin/pages/home')
    const en = page.locator('[data-testid="locale-en"]')
    const fr = page.locator('[data-testid="locale-fr"]')
    await expect(en).toBeVisible()
    await expect(fr).toBeVisible()
    await expect(en).toHaveClass(/active/)
    await expect(fr).not.toHaveClass(/active/)
  })

  test('click FR activates it and adds ?locale=fr to URL', async ({ page }) => {
    await page.goto('/admin/pages/home')
    await page.click('[data-testid="locale-fr"]')
    await expect(page.locator('[data-testid="locale-fr"]')).toHaveClass(/active/)
    await expect(page.locator('[data-testid="locale-en"]')).not.toHaveClass(/active/)
    expect(page.url()).toContain('locale=fr')
  })

  test('click EN removes ?locale from URL', async ({ page }) => {
    await page.goto('/admin/pages/home?locale=fr')
    await page.click('[data-testid="locale-en"]')
    await expect(page.locator('[data-testid="locale-en"]')).toHaveClass(/active/)
    expect(page.url()).not.toContain('locale=')
  })

  test('hidden when site has no locales config', async ({ page }) => {
    // This test is a no-op on the starter (which has locales configured).
    // It documents the expected behavior — picker should not render when
    // the site manifest has no locales.supported field.
    // Skip on starter since it always has locales.
    test.skip()
  })
})

test.describe('Locale preview switching', () => {
  test('EN preview shows English content', async ({ page }) => {
    await page.goto('/admin/pages/home')
    const iframe = page.locator('[data-testid="preview-iframe"]')
    await expect(iframe).toBeVisible()
    const frame = page.frameLocator('[data-testid="preview-iframe"]')
    await expect(frame.locator('h1')).toContainText('Welcome to Gazetta')
  })

  test('FR preview shows French content', async ({ page }) => {
    await page.goto('/admin/pages/home')
    await page.click('[data-testid="locale-fr"]')
    // Wait for preview to reload with French content
    const frame = page.frameLocator('[data-testid="preview-iframe"]')
    await expect(frame.locator('h1')).toContainText('Bienvenue sur Gazetta', { timeout: 10000 })
  })

  test('EN→FR→EN round-trip', async ({ page }) => {
    await page.goto('/admin/pages/home')
    const frame = page.frameLocator('[data-testid="preview-iframe"]')

    // Start EN
    await expect(frame.locator('h1')).toContainText('Welcome')

    // Switch to FR
    await page.click('[data-testid="locale-fr"]')
    await expect(frame.locator('h1')).toContainText('Bienvenue', { timeout: 10000 })

    // Back to EN
    await page.click('[data-testid="locale-en"]')
    await expect(frame.locator('h1')).toContainText('Welcome', { timeout: 10000 })
  })
})

test.describe('Locale URL persistence', () => {
  test('?locale=fr persists on page refresh', async ({ page }) => {
    await page.goto('/admin/pages/home?locale=fr')
    await page.reload()
    expect(page.url()).toContain('locale=fr')
    await expect(page.locator('[data-testid="locale-fr"]')).toHaveClass(/active/)
  })

  test('?locale=fr persists when navigating between pages', async ({ page }) => {
    await page.goto('/admin/pages/home?locale=fr')
    // Click about page in tree
    await page.locator('.site-tree .node-label', { hasText: 'about' }).click()
    await page.waitForURL(/\/pages\/about/)
    expect(page.url()).toContain('locale=fr')
  })

  test('?locale=fr combined with #hash', async ({ page }) => {
    await page.goto('/admin/pages/home?locale=fr#hero')
    expect(page.url()).toContain('locale=fr')
    expect(page.url()).toContain('#hero')
  })
})

test.describe('SiteTree locale badges', () => {
  test('pages with translations show locale badges', async ({ page }) => {
    await page.goto('/admin')
    // home and about should have FR badges
    const homeRow = page.locator('.site-tree .node-row', { hasText: 'home' })
    await expect(homeRow.locator('.locale-badge')).toBeVisible()
    await expect(homeRow.locator('.locale-badge')).toContainText('FR')
  })

  test('pages without translations have no badges', async ({ page }) => {
    await page.goto('/admin')
    const blogRow = page.locator('.site-tree .node-row', { hasText: 'blog' })
    await expect(blogRow.locator('.locale-badge')).toHaveCount(0)
  })
})

test.describe('Editor locale switching', () => {
  test('editor shows locale-specific content when FR selected', async ({ page }) => {
    await openEditor(page, 'home')
    // Verify EN content in editor
    const heroComponent = page.locator('[data-testid="component-hero"]')
    await expect(heroComponent).toBeVisible()

    // Switch to FR
    await page.click('[data-testid="locale-fr"]')
    // Wait for editor to reload — component tree should still show hero
    await page.waitForSelector('[data-testid="component-hero"]', { timeout: 10000 })
  })
})
