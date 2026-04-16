import type { Page } from '@playwright/test'

/**
 * Navigate to admin in edit mode for a page — uses the direct URL to avoid
 * race conditions from clicking data-gz elements in the preview iframe.
 * Waits for the component tree to render before returning.
 */
export async function openEditor(page: Page, pageName: string): Promise<void> {
  await page.goto(`/admin/pages/${pageName}/edit`)
  await page.waitForSelector('[data-testid^="component-"]', { timeout: 10000 })
}
