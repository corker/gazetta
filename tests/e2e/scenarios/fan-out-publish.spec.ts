/**
 * Scenario #2 — fan-out publish with real execution.
 *
 * Surfaces crossed: PB + PB.G + PB.P. The existing publish.spec has
 * "environment group header selects all members" but stops at the
 * UI toggle — never dispatches the actual multi-target publish.
 *
 * What regresses if this breaks:
 *   - group-selection → publishStream wiring (destinationNames must
 *     include every group member, not just the header)
 *   - streaming progress for multiple targets in parallel
 *   - per-destination result rows rendered for every target, not just
 *     the first to complete
 */
import { test, expect } from '../fixtures'
import { PublishPanelPom } from '../pages/PublishPanel'
import { resetScenarioState } from './_isolation'

test.describe('Scenario — fan-out publish to an environment group', () => {
  test.beforeEach(async ({ testSite }) => {
    await resetScenarioState(testSite.projectDir)
  })

  test('selecting the staging group publishes to every member and returns a result per target', async ({ page }) => {
    const panel = new PublishPanelPom(page)
    await panel.open()

    // Starter has 4 targets with staging + esi-test both tagged
    // environment:staging — this is what triggers the group header.
    const stagingGroup = panel.destinationGroup('staging')
    await expect(stagingGroup).toBeVisible()

    // Click the group header → both members selected.
    await panel.toggleGroup('staging')
    await expect(panel.isDestinationChecked('staging')).toHaveCount(1)
    await expect(panel.isDestinationChecked('esi-test')).toHaveCount(1)

    // Items auto-populate from compare — every item is 'added' because
    // both targets are in firstPublish state after the reset.
    await expect(panel.item('pages/home')).toBeVisible({ timeout: 10000 })

    // Publish — streams to both targets in parallel.
    await panel.publish()

    // Both result rows should land — order is non-deterministic.
    await expect(panel.result('staging')).toBeVisible({ timeout: 20000 })
    await expect(panel.result('esi-test')).toBeVisible({ timeout: 20000 })
    await expect(panel.result('staging')).toHaveClass(/success/)
    await expect(panel.result('esi-test')).toHaveClass(/success/)

    // Done button appears after the full stream closes.
    await expect(panel.doneButton).toBeVisible({ timeout: 5000 })
  })
})
