import { test, expect } from './fixtures'
import { openEditor } from './helpers'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

test.describe('Publish panel', () => {
  // Staging target's storage path is ./dist/staging relative to sites/main
  function stagingDir(projectDir: string) {
    return join(projectDir, 'sites/main/dist/staging')
  }
  async function seedSidecar(dir: string, hash: string) {
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `.${hash}.hash`), '')
  }
  async function wipe(projectDir: string) {
    await rm(stagingDir(projectDir), { recursive: true, force: true })
  }

  /** Open the unified Publish panel from the toolbar. Panel is not scoped
   *  to a selected item — it's a cross-target operation. */
  async function openPublish(page: import('@playwright/test').Page) {
    await page.goto('/admin')
    await page.locator('[data-testid="publish-btn"]').click()
    await expect(page.locator('[data-testid="publish-panel"]')).toBeVisible()
  }

  /** Check the destination by clicking its row. Source defaults to the
   *  active target (local in starter). */
  async function pickDestination(page: import('@playwright/test').Page, name: string) {
    await page.locator(`[data-testid="publish-dest-${name}"]`).click()
  }

  test('opens with local as source and destinations listed', async ({ page, testSite: _ }) => {
    await openPublish(page)
    // Single editable target in starter (local) — source renders as a fixed chip
    await expect(page.locator('[data-testid="publish-source-fixed"]')).toContainText('local')
    // Every non-source target appears as a destination row
    await expect(page.locator('[data-testid="publish-dest-staging"]')).toBeVisible()
    await expect(page.locator('[data-testid="publish-dest-esi-test"]')).toBeVisible()
    await expect(page.locator('[data-testid="publish-dest-production"]')).toBeVisible()
  })

  test('first-publish destination shows all items as added', async ({ page, testSite }) => {
    await wipe(testSite.projectDir)
    await openPublish(page)
    await pickDestination(page, 'staging')
    // Every local page becomes an 'added' row against the empty staging target
    const homeRow = page.locator('[data-testid="publish-item-pages/home"]')
    await expect(homeRow).toBeVisible()
    await expect(homeRow.locator('.marker-added')).toHaveText('+')
  })

  test('modified item shows modified marker and state chip', async ({ page, testSite }) => {
    await wipe(testSite.projectDir)
    // Seed a stale sidecar for pages/home so compare reports 'modified' there,
    // and a sidecar for pages/about so the target isn't empty (avoids every
    // page being classified 'added' via firstPublish).
    await seedSidecar(join(stagingDir(testSite.projectDir), 'pages/home'), '00000000')
    await seedSidecar(join(stagingDir(testSite.projectDir), 'pages/about'), 'aaaaaaaa')

    await openPublish(page)
    await pickDestination(page, 'staging')
    const row = page.locator('[data-testid="publish-item-pages/home"]')
    await expect(row).toBeVisible()
    await expect(row.locator('.marker-modified')).toHaveText('●')
    await expect(row.locator('.dest-state-modified')).toContainText('modified')
  })

  test('deleted item renders informational (no checkbox, struck through)', async ({ page, testSite }) => {
    await wipe(testSite.projectDir)
    // Seed a sidecar for a page that doesn't exist locally — it exists on
    // staging but not on the source, so compare classifies it 'deleted'.
    await seedSidecar(join(stagingDir(testSite.projectDir), 'pages/old-contact'), '11111111')

    await openPublish(page)
    await pickDestination(page, 'staging')
    const deletedRow = page.locator('[data-testid="publish-item-pages/old-contact"]')
    await expect(deletedRow).toBeVisible()
    await expect(deletedRow).toHaveClass(/item-deleted/)
    // Deleted rows get a spacer instead of a checkbox
    await expect(deletedRow.locator('.deleted-spacer')).toHaveCount(1)
    await expect(deletedRow.locator('.p-checkbox')).toHaveCount(0)
    await expect(deletedRow.locator('.marker-deleted')).toHaveText('−')
  })

  test('summary line shows category counts', async ({ page, testSite }) => {
    await wipe(testSite.projectDir)
    await seedSidecar(join(stagingDir(testSite.projectDir), 'pages/home'), '00000000')
    await seedSidecar(join(stagingDir(testSite.projectDir), 'pages/old-contact'), '11111111')
    // Other local pages (about/blog/showcase/404) become 'added' rows.

    await openPublish(page)
    await pickDestination(page, 'staging')
    const summary = page.locator('[data-testid="publish-items-summary"]')
    await expect(summary).toBeVisible()
    await expect(summary).toContainText('modified')
    await expect(summary).toContainText('added')
    await expect(summary).toContainText('deleted')
  })

  test('fragment row shows blast-radius badge', async ({ page, testSite }) => {
    await wipe(testSite.projectDir)
    // esi-test is the dynamic target — fragments appear as first-publish
    // items there. Wipe first so we get a clean fan-out.
    const esiDir = join(testSite.projectDir, 'sites/main/dist/esi-test')
    await rm(esiDir, { recursive: true, force: true })

    await openPublish(page)
    await pickDestination(page, 'esi-test')
    const headerRow = page.locator('[data-testid="publish-item-fragments/header"]')
    await expect(headerRow).toBeVisible()
    // Fragment rows mount a FragmentBlastRadius component (pulled in via
    // api.getDependents) — the badge shows the count of pages that reference it.
    await expect(headerRow.locator('[data-testid="fragment-blast-radius"]')).toBeVisible({ timeout: 5000 })
  })

  test('compare failure surfaces an inline error', async ({ page, testSite: _ }) => {
    test.info().annotations.push({ type: 'allow-console-errors' })
    // Intercept the compare call and force a 500. The item-list composable
    // reports the error via its own state.
    await page.route('**/admin/api/compare*', route => route.fulfill({
      status: 500, contentType: 'application/json',
      body: JSON.stringify({ error: 'Storage unreachable' }),
    }))
    await openPublish(page)
    await pickDestination(page, 'staging')
    const err = page.locator('[data-testid="publish-items-error"]')
    await expect(err).toBeVisible()
    await expect(err).toContainText('Storage unreachable')
  })

  test('production destination requires confirmation before publishing', async ({ page, testSite }) => {
    await wipe(testSite.projectDir)
    // Fixture swaps the azure-blob production target for a filesystem one
    // with environment:production so this test doesn't need Azurite.
    await openPublish(page)
    await pickDestination(page, 'production')
    // First click on Publish reveals the confirmation banner; the button
    // changes to a danger-styled "Yes, publish to production" variant.
    await page.locator('[data-testid="publish-panel-confirm"]').click()
    await expect(page.locator('[data-testid="publish-confirm-banner"]')).toBeVisible()
    await expect(page.locator('[data-testid="publish-panel-confirm-prod"]')).toBeVisible()
    await page.locator('button', { hasText: 'Back' }).click()
    await expect(page.locator('[data-testid="publish-confirm-banner"]')).toHaveCount(0)
  })

  test('non-production destination publishes without confirmation', async ({ page, testSite }) => {
    await wipe(testSite.projectDir)
    await openPublish(page)
    await pickDestination(page, 'staging')
    // Staging has environment:staging — no confirmation gate.
    // Clicking Publish goes straight to the streaming action.
    await page.locator('[data-testid="publish-panel-confirm"]').click()
    await expect(page.locator('[data-testid="publish-confirm-banner"]')).toHaveCount(0)
    // Wait for completion — the Done button replaces Cancel/Publish on success.
    await expect(page.locator('[data-testid="publish-panel-done"]')).toBeVisible({ timeout: 10000 })
  })

  test('publish streams per-destination progress and lands on results', async ({ page, testSite }) => {
    await wipe(testSite.projectDir)
    await openPublish(page)
    await pickDestination(page, 'staging')
    await page.locator('[data-testid="publish-panel-confirm"]').click()
    // Either we catch the progress block mid-stream, or the publish is fast
    // enough to land straight on results — both are valid. What matters is
    // the per-destination result row.
    const progressBlock = page.locator('[data-testid="publish-progress"]')
    await Promise.race([
      progressBlock.waitFor({ timeout: 2000 }).catch(() => null),
      page.locator('[data-testid="publish-result-staging"]').waitFor({ timeout: 5000 }),
    ])
    await expect(page.locator('[data-testid="publish-result-staging"]')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('[data-testid="publish-result-staging"]')).toHaveClass(/success/)
  })

  test('invalid templates surface as fatal error on publish', async ({ page, testSite }) => {
    test.info().annotations.push({ type: 'allow-console-errors' })
    await wipe(testSite.projectDir)
    // Break the 'hero' template — not parseable ts. The server emits a
    // 'fatal' SSE event with invalidTemplates, which the panel renders in
    // the error block. Restore afterward because the testSite fixture is
    // worker-scoped — a corrupted hero template would cascade into every
    // later test that renders the home page.
    const { readFile } = await import('node:fs/promises')
    const tpl = join(testSite.projectDir, 'templates/hero/index.ts')
    const orig = await readFile(tpl, 'utf-8')
    await writeFile(tpl, 'this is not valid ts!!!')
    try {
      await openPublish(page)
      await pickDestination(page, 'staging')
      await page.locator('[data-testid="publish-panel-confirm"]').click()
      const banner = page.locator('[data-testid="publish-invalid-templates"]')
      await expect(banner).toBeVisible({ timeout: 10000 })
      await expect(banner).toContainText('hero')
    } finally {
      await writeFile(tpl, orig)
    }
  })

  test('works in light mode', async ({ page, testSite }) => {
    await wipe(testSite.projectDir)
    await page.goto('/admin')
    const html = page.locator('html')
    if ((await html.getAttribute('class'))?.includes('dark')) {
      await page.locator('[data-testid="theme-toggle"]').click()
    }
    await page.locator('[data-testid="publish-btn"]').click()
    await expect(page.locator('[data-testid="publish-panel"]')).toBeVisible()
    await pickDestination(page, 'staging')
    await expect(page.locator('[data-testid="publish-item-pages/home"]')).toBeVisible()
    await expect(html).not.toHaveClass(/dark/)
  })

  test('environment group header selects all members in the group', async ({ page, testSite }) => {
    await wipe(testSite.projectDir)
    await openPublish(page)
    // Starter has two staging-env targets: staging + esi-test. The group
    // header appears when a group has 2+ members; single-member groups
    // (local when source, production) render flat.
    const groupHeader = page.locator('[data-testid="publish-dest-group-staging"]')
    await expect(groupHeader).toBeVisible()
    // Neither member selected initially → clicking the header selects both.
    // PrimeVue Checkbox exposes state via the .p-checkbox-checked class on
    // the wrapper rather than the native `checked` attribute.
    await groupHeader.click()
    await expect(page.locator('[data-testid="publish-dest-staging"] .p-checkbox-checked')).toHaveCount(1)
    await expect(page.locator('[data-testid="publish-dest-esi-test"] .p-checkbox-checked')).toHaveCount(1)
    // Clicking again deselects both.
    await groupHeader.click()
    await expect(page.locator('[data-testid="publish-dest-staging"] .p-checkbox-checked')).toHaveCount(0)
    await expect(page.locator('[data-testid="publish-dest-esi-test"] .p-checkbox-checked')).toHaveCount(0)
  })

  test('select-all and select-none toggle every selectable item', async ({ page, testSite }) => {
    await wipe(testSite.projectDir)
    await openPublish(page)
    await pickDestination(page, 'staging')
    const selectAll = page.locator('[data-testid="publish-select-all"]')
    const selectNone = page.locator('[data-testid="publish-select-none"]')
    await expect(selectAll).toBeVisible()
    // Starts with every item checked (default). Click Select none → button
    // stays but Publish should become disabled (no items selected).
    await selectNone.click()
    await expect(page.locator('[data-testid="publish-panel-confirm"]')).toBeDisabled()
    await selectAll.click()
    await expect(page.locator('[data-testid="publish-panel-confirm"]')).toBeEnabled()
  })
})

test.describe('Fragment blast radius', () => {
  test('tree row shows compact blast-radius badge with page count', async ({ page }) => {
    // On a fresh dev server, multiple tree badges mount in parallel and
    // all hit /api/dependents before any sidecar has been written. The
    // admin-api's sidecar writer memoizes the backfill, so concurrent
    // callers share one in-flight pass — without that, they'd race to
    // an empty index and the badge would render count=0. This test
    // covers both the UI layer and that invariant.
    await page.goto('/admin')
    const row = page.locator('[data-testid="site-fragment-header"]')
    await row.waitFor({ timeout: 10000 })
    const badge = row.locator('[data-testid="fragment-blast-radius"]')
    await badge.waitFor({ timeout: 5000 })
    // Compact form — just the count, not the "used on N pages" text.
    // Starter has 5 pages all referencing @header.
    await expect(badge).toHaveText('5')
    // Hover title lists the dependent pages.
    await expect(badge).toHaveAttribute('title', /Used on:.*home/)
  })
})

test.describe('Save button labeling', () => {
  test('generic "Save" label for local (non-production) active target', async ({ page }) => {
    await openEditor(page, 'home')
    const save = page.locator('[data-testid="save-btn"]')
    await expect(save).toHaveText(/^\s*Save\s*$/)
    // Primary severity — PrimeVue adds no class for p-button-primary, so
    // assert the button is NOT the danger variant.
    await expect(save).not.toHaveClass(/p-button-danger/)
  })
})

test.describe('Sync indicator grouping', () => {
  test('collapses 2+ members of an environment into a group chip at 4+ targets', async ({ page }) => {
    // Starter has 4 targets; staging and esi-test both env=staging.
    // That triggers grouping (threshold = 4) and collapses the two
    // staging targets into a single expandable group chip.
    await page.goto('/admin')
    const group = page.locator('[data-testid="sync-chip-group-staging"]')
    await expect(group).toBeVisible()
    await expect(group).toContainText('staging')
    await expect(group).toContainText('(2)')
    // Individual member chips are hidden until the group expands.
    await expect(page.locator('[data-testid="sync-chip-staging"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="sync-chip-esi-test"]')).toHaveCount(0)
    // Click to expand — both member chips appear.
    await group.click()
    await expect(page.locator('[data-testid="sync-chip-staging"]')).toBeVisible()
    await expect(page.locator('[data-testid="sync-chip-esi-test"]')).toBeVisible()
    // Single-member groups (production) and the active target's
    // non-group (local when active) don't get a group chip.
    await expect(page.locator('[data-testid="sync-chip-group-production"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="sync-chip-production"]')).toBeVisible()
  })
})
