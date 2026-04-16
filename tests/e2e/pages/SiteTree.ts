/**
 * Page Object for the site tree in the admin sidebar.
 *
 * Wraps the selector shapes `[data-testid="site-{type}-{name}"]`,
 * `[data-testid="dirty-{type}-{name}"]`, `[data-testid="delete-{type}-
 * {name}"]`, and the "new page / new fragment" buttons so tests work in
 * user-level terms ("open the home page", "the header fragment is dirty")
 * instead of string-formatted data-testid lookups.
 *
 * Conventions match PublishPanelPom:
 * - `page` injected in the constructor; no inheritance
 * - Methods = user actions; getters return locators; assertions stay
 *   in the tests
 * - Encodes the {type: 'page' | 'fragment'} distinction once, here
 */
import type { Locator, Page } from '@playwright/test'

export type NodeKind = 'page' | 'fragment'

export class SiteTreePom {
  constructor(private readonly page: Page) {}

  // ---- Rows ------------------------------------------------------------

  /** Tree row for a page by name (e.g. 'home', 'about'). */
  pageRow(name: string): Locator {
    return this.page.locator(`[data-testid="site-page-${name}"]`)
  }

  /** Tree row for a fragment by name (e.g. 'header', 'footer'). */
  fragmentRow(name: string): Locator {
    return this.page.locator(`[data-testid="site-fragment-${name}"]`)
  }

  /** Generic accessor — useful when tests iterate both types. */
  node(kind: NodeKind, name: string): Locator {
    return this.page.locator(`[data-testid="site-${kind}-${name}"]`)
  }

  // ---- Dirty indicators -----------------------------------------------

  /** Dirty dot on a page row (appears when the page differs from the
   *  reference target's sidecar hash). */
  dirtyDotPage(name: string): Locator {
    return this.page.locator(`[data-testid="dirty-page-${name}"]`)
  }

  /** Dirty dot on a fragment row. */
  dirtyDotFragment(name: string): Locator {
    return this.page.locator(`[data-testid="dirty-fragment-${name}"]`)
  }

  // ---- Delete buttons --------------------------------------------------

  /** Delete action for a page (visible on hover in the UI). */
  deletePageButton(name: string): Locator {
    return this.page.locator(`[data-testid="delete-page-${name}"]`)
  }

  /** Delete action for a fragment. */
  deleteFragmentButton(name: string): Locator {
    return this.page.locator(`[data-testid="delete-fragment-${name}"]`)
  }

  // ---- Creation -------------------------------------------------------

  /** Button that opens the "new page" dialog. */
  get newPageButton(): Locator {
    return this.page.locator('[data-testid="new-page"]')
  }

  /** Button that opens the "new fragment" dialog. */
  get newFragmentButton(): Locator {
    return this.page.locator('[data-testid="new-fragment"]')
  }

  // ---- Actions ---------------------------------------------------------

  /** Click a page row → admin navigates to /admin/pages/{name}. */
  async openPage(name: string): Promise<void> {
    await this.pageRow(name).click()
  }

  /** Click a fragment row → admin navigates to /admin/fragments/{name}. */
  async openFragment(name: string): Promise<void> {
    await this.fragmentRow(name).click()
  }

  // ---- State queries ---------------------------------------------------

  /**
   * Selected-state accessor for a page row. The admin adds `.selected`
   * to the active row; this helper composes the selector so tests can
   * `expect(tree.selectedPage('home')).toBeVisible()` without fiddling
   * with class names.
   */
  selectedPage(name: string): Locator {
    return this.page.locator(`[data-testid="site-page-${name}"].selected`)
  }

  /** Selected-state for a fragment row. */
  selectedFragment(name: string): Locator {
    return this.page.locator(`[data-testid="site-fragment-${name}"].selected`)
  }
}
