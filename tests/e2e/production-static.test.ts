import { test, expect } from '@playwright/test'

test.describe('Production static serve (gazetta serve with static target)', () => {
  test('published pages are served', async ({ page }) => {
    const resp = await page.goto('/')
    expect(resp?.status()).toBe(200)
    const html = await page.content()
    expect(html).toContain('Welcome to Gazetta')
  })

  test('about page is served', async ({ page }) => {
    const resp = await page.goto('/about')
    expect(resp?.status()).toBe(200)
    const html = await page.content()
    expect(html).toContain('About Gazetta')
  })
})
