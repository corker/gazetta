import { test, expect } from './fixtures'
import { openEditor } from './helpers'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

test.describe('Target switch preserves preview', () => {
  /**
   * Publish everything from local → staging so both targets have the home
   * page. Without this the staging target returns 404 and we can't assert
   * on scroll-preserved content swap.
   */
  async function seedStaging(baseURL: string) {
    const res = await fetch(`${baseURL}/admin/api/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: ['pages/home', 'pages/about', 'fragments/header', 'fragments/footer'],
        targets: ['staging'],
      }),
    })
    if (!res.ok) throw new Error(`seed publish failed: ${res.status}`)
  }

  test('scroll position is preserved when switching active target', async ({ page, testSite }) => {
    await seedStaging(testSite.baseURL)

    // Shorter viewport forces the home page to actually overflow so the
    // iframe has somewhere to scroll to.
    await page.setViewportSize({ width: 1200, height: 400 })
    await page.goto('/admin/pages/home')
    await page.waitForSelector('iframe[data-testid="preview-iframe"]', { timeout: 10000 })

    // Give the iframe time to load its first srcdoc and lay out.
    await expect.poll(async () => {
      return page.evaluate(() => {
        const f = document.querySelector('iframe[data-testid="preview-iframe"]') as HTMLIFrameElement | null
        return (f?.srcdoc?.length ?? 0) > 500 && !!f?.contentDocument?.body
      })
    }, { timeout: 10000 }).toBe(true)

    // Scroll the iframe.
    await page.evaluate(() => {
      const f = document.querySelector('iframe[data-testid="preview-iframe"]') as HTMLIFrameElement | null
      f?.contentWindow?.scrollTo(0, 400)
    })
    await expect.poll(async () => page.evaluate(() => {
      const f = document.querySelector('iframe[data-testid="preview-iframe"]') as HTMLIFrameElement | null
      return f?.contentWindow?.scrollY ?? 0
    }), { timeout: 2000 }).toBeGreaterThan(100)

    const scrolled = await page.evaluate(() => {
      const f = document.querySelector('iframe[data-testid="preview-iframe"]') as HTMLIFrameElement | null
      return f?.contentWindow?.scrollY ?? 0
    })

    // Open the top-bar target switcher and select staging. The preview
    // should swap content via morphdom, preserving scroll.
    await page.locator('[data-testid="active-target-indicator"]').click()
    await page.locator('[data-testid="active-target-menu"]').getByRole('menuitem', { name: 'staging' }).click()

    await expect.poll(async () => page.evaluate(() => {
      const f = document.querySelector('iframe[data-testid="preview-iframe"]') as HTMLIFrameElement | null
      return f?.contentWindow?.scrollY ?? 0
    }), { timeout: 5000 }).toBe(scrolled)

    // Sanity: the indicator now reflects staging as active.
    await expect(page.locator('[data-testid="active-target-indicator"]')).toContainText('staging')
  })
})

test.describe('Target switch with missing item', () => {
  async function wipeStaging(projectDir: string) {
    await rm(join(projectDir, 'sites/main/dist/staging'), { recursive: true, force: true })
  }

  test('item missing on destination drops focus to root with a back-toast', async ({ page, testSite }) => {
    // Preview on an empty target responds 404 with a friendly "No content
    // on this target yet" placeholder — deliberate, but the browser logs
    // it as a console error which the fixture's guard would otherwise
    // fail the test on.
    test.info().annotations.push({ type: 'allow-console-errors' })
    await wipeStaging(testSite.projectDir)
    // Select home on local.
    await page.goto('/admin/pages/home')
    await page.waitForSelector('[data-testid="site-page-home"]', { timeout: 10000 })
    // Switch to staging — home doesn't exist there.
    await page.locator('[data-testid="active-target-indicator"]').click()
    await page.locator('[data-testid="active-target-menu"]').getByRole('menuitem', { name: 'staging' }).click()
    // Toast appears with a "back" action.
    const toast = page.locator('[data-testid="global-toast"]')
    await expect(toast).toBeVisible()
    await expect(toast).toContainText("pages/home isn't on staging")
    await expect(toast).toContainText('showing site root')
    // Clicking the action restores the previous target + selection.
    await page.locator('[data-testid="toast-action"]').click()
    await expect(page).toHaveURL(/\/admin\/pages\/home/)
    await expect(page.locator('[data-testid="active-target-indicator"]')).toContainText('local')
  })
})

test.describe('Target switch with unsaved edits', () => {
  test('Cancel keeps the user on the current target with edits intact', async ({ page }) => {
    // Enter edit mode and make a change to mark the editor dirty.
    await openEditor(page, 'home')
    await page.locator('[data-testid="component-hero"]').click()
    await page.waitForTimeout(300)
    const titleField = page.locator('input[name="root_title"]').first()
    await titleField.waitFor({ timeout: 5000 })
    const original = await titleField.inputValue()
    await titleField.fill(original + ' — dirty')
    // Save button becomes enabled when there are pending edits.
    await expect(page.locator('[data-testid="save-btn"]')).toBeEnabled()

    // Try to switch to staging → the unsaved-dialog opens.
    await page.locator('[data-testid="active-target-indicator"]').click()
    await page.locator('[data-testid="active-target-menu"]').getByRole('menuitem', { name: 'staging' }).click()
    const dialog = page.getByRole('dialog', { name: /unsaved changes/i })
    await dialog.waitFor({ timeout: 5000 })
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    // Still on local (the original active target), edits preserved.
    await expect(page.locator('[data-testid="active-target-indicator"]')).toContainText('local')
    await expect(page.locator('[data-testid="save-btn"]')).toBeEnabled()
    await expect(titleField).toHaveValue(original + ' — dirty')
  })
})
