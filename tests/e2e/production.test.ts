import { test, expect } from '@playwright/test'

test.describe('Production admin (gazetta admin)', () => {
  test('admin loads with site tree', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.locator('[data-testid="site-page-home"]')).toBeVisible()
    await expect(page.locator('[data-testid="site-page-about"]')).toBeVisible()
  })

  test('no 404 errors on admin load', async ({ page }) => {
    const errors: string[] = []
    page.on('response', resp => {
      if (resp.status() >= 400) errors.push(`${resp.status()} ${resp.url()}`)
    })
    await page.goto('/admin')
    await page.waitForTimeout(2000)
    expect(errors).toEqual([])
  })

  test('admin JS and CSS assets load', async ({ page }) => {
    const assets: string[] = []
    page.on('response', resp => {
      const url = resp.url()
      if (url.includes('/assets/') && resp.status() === 200) assets.push(url)
    })
    await page.goto('/admin')
    await page.waitForTimeout(2000)
    expect(assets.some(u => u.endsWith('.js'))).toBe(true)
    expect(assets.some(u => u.endsWith('.css'))).toBe(true)
  })
})
