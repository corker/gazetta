import { test, expect } from './fixtures'
import { openEditor } from './helpers'
import { ComponentTreePom } from './pages/ComponentTree'

test.describe('Component operations', () => {
  // These tests mutate page.json on disk via the API. Isolation comes from the
  // worker-scoped testSite fixture — each Playwright worker has its own copy
  // of the starter site. Tests within the file share state; each one uses a
  // unique component name so they don't collide.

  test('add inline component via dialog', async ({ page }, testInfo) => {
    await openEditor(page, 'home')
    const tree = new ComponentTreePom(page)
    const name = `test-add-${testInfo.testId}`

    const beforeCount = await tree.allRows.count()

    await tree.add(name, 'text-block')

    await expect(tree.row(name)).toBeVisible({ timeout: 10000 })
    expect(await tree.allRows.count()).toBe(beforeCount + 1)
  })

  test('remove component', async ({ page }, testInfo) => {
    await openEditor(page, 'home')
    const tree = new ComponentTreePom(page)
    const name = `test-remove-${testInfo.testId}`

    // Add a component first so we have something to remove
    await tree.add(name, 'text-block')
    await expect(tree.row(name)).toBeVisible({ timeout: 10000 })

    const beforeCount = await tree.allRows.count()

    await tree.remove(name)

    await expect(tree.row(name)).not.toBeVisible({ timeout: 10000 })
    expect(await tree.allRows.count()).toBe(beforeCount - 1)
  })

  test('move component changes order', async ({ page }) => {
    await openEditor(page, 'home')
    const tree = new ComponentTreePom(page)

    // hero should be above features in the tree
    const heroBefore = await tree.row('hero').boundingBox()
    const featuresBefore = await tree.row('features').boundingBox()
    expect(heroBefore!.y).toBeLessThan(featuresBefore!.y)

    // Move features up — it should swap with hero
    await tree.moveUp('features')

    await expect(async () => {
      const heroAfter = await tree.row('hero').boundingBox()
      const featuresAfter = await tree.row('features').boundingBox()
      expect(featuresAfter!.y).toBeLessThan(heroAfter!.y)
    }).toPass({ timeout: 10000 })

    // Restore order so subsequent tests see hero above features
    await tree.moveDown('features')
    await expect(async () => {
      const heroAfter = await tree.row('hero').boundingBox()
      const featuresAfter = await tree.row('features').boundingBox()
      expect(heroAfter!.y).toBeLessThan(featuresAfter!.y)
    }).toPass({ timeout: 10000 })
  })
})
