import { test, expect } from '@playwright/test'

test.describe('Production ESI serve (gazetta serve with publishMode: esi)', () => {
  test('home page is served with assembled fragments', async ({ page }) => {
    const resp = await page.goto('/')
    expect(resp?.status()).toBe(200)
    const html = await page.content()
    // Page content
    expect(html).toContain('Welcome to Gazetta')
    // Fragment content (header assembled via ESI)
    expect(html).toContain('site-header')
    // No raw ESI placeholders in output
    expect(html).not.toContain('<!--esi:')
  })

  test('about page is served', async ({ page }) => {
    const resp = await page.goto('/about')
    expect(resp?.status()).toBe(200)
    const html = await page.content()
    expect(html).toContain('About Gazetta')
  })

  test('404 page returns 404 status', async ({ page }) => {
    const resp = await page.goto('/nonexistent')
    expect(resp?.status()).toBe(404)
  })

  test('ETag caching works', async ({ request }) => {
    const first = await request.get('/')
    const etag = first.headers()['etag']
    expect(etag).toBeDefined()

    const second = await request.get('/', { headers: { 'If-None-Match': etag } })
    expect(second.status()).toBe(304)
  })
})
