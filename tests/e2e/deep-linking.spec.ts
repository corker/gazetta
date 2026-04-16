import { test, expect } from './fixtures'
import { SiteTreePom } from './pages/SiteTree'

test.describe('Deep linking', () => {
  test('direct URL to page selects it in browse mode', async ({ page }) => {
    await page.goto('/admin/pages/about')
    const tree = new SiteTreePom(page)
    await expect(tree.selectedPage('about')).toBeVisible({ timeout: 10000 })
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
    const tree = new SiteTreePom(page)
    await expect(tree.selectedFragment('header')).toBeVisible({ timeout: 10000 })
  })

  test('back button navigates from edit to browse', async ({ page }) => {
    await page.goto('/admin/pages/home')
    const tree = new SiteTreePom(page)
    await tree.selectedPage('home').waitFor({ timeout: 10000 })

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
    await expect(tree.pageRow('home')).toBeVisible()
  })

  test('URL updates when switching pages', async ({ page }) => {
    await page.goto('/admin/pages/home')
    const tree = new SiteTreePom(page)
    await tree.selectedPage('home').waitFor({ timeout: 10000 })

    await tree.openPage('about')
    await expect(page).toHaveURL(/\/pages\/about/)
    await expect(tree.selectedPage('about')).toBeVisible()
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
