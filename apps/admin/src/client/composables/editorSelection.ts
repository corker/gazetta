/**
 * Typed representation of what the user selected in the component tree.
 *
 * Every selection is one of four kinds. The kind determines what the
 * editor panel shows and what hash goes in the URL. All path parsing
 * and construction lives here — no ad-hoc string splitting elsewhere.
 */

/** User clicked the page/fragment root node — opens root content editor. */
export interface RootSelection {
  kind: 'root'
}

/** User clicked an inline component — opens its editor. */
export interface ComponentSelection {
  kind: 'component'
  /** Component path within the page/fragment, e.g. "hero" or "features/fast". */
  path: string
  /** Template name for the component. */
  template: string
}

/** User clicked a fragment reference from page context — shows "go to fragment" link. */
export interface FragmentLinkSelection {
  kind: 'fragmentLink'
  /** Fragment name, e.g. "header". */
  fragmentName: string
  /** The full tree path that was clicked, e.g. "@header" or "@header/logo". */
  treePath: string
  /** If a child was clicked, the child's path relative to the fragment, e.g. "logo". Null for the fragment root. */
  childPath: string | null
}

/** User clicked a fragment root when already on a fragment page — opens it for editing. */
export interface FragmentEditSelection {
  kind: 'fragmentEdit'
  /** Fragment name, e.g. "header". */
  fragmentName: string
}

export type EditorSelection = RootSelection | ComponentSelection | FragmentLinkSelection | FragmentEditSelection

// --- URL hash serialization ---

const HASH_PREFIX = 'component='

export function selectionToHash(sel: EditorSelection): string {
  switch (sel.kind) {
    case 'root':
      return `#${HASH_PREFIX}_root`
    case 'component':
      return `#${HASH_PREFIX}${encodeURIComponent(sel.path)}`
    case 'fragmentLink':
      return `#${HASH_PREFIX}${encodeURIComponent(sel.treePath)}`
    case 'fragmentEdit':
      return `#${HASH_PREFIX}${encodeURIComponent(`@${sel.fragmentName}`)}`
  }
}

/**
 * Parse a URL hash into an EditorSelection. Returns null if the hash
 * doesn't encode a component selection.
 *
 * Context-dependent: the same hash `@header` means "fragment link" on
 * a page and "fragment edit" on a fragment page. The `onFragmentPage`
 * flag disambiguates.
 */
export function hashToSelection(hash: string, onFragmentPage: boolean): EditorSelection | null {
  if (!hash.startsWith(`#${HASH_PREFIX}`)) return null
  const encoded = hash.slice(1 + HASH_PREFIX.length)
  if (!encoded) return null
  const decoded = decodeURIComponent(encoded)

  if (decoded === '_root') return { kind: 'root' }

  if (decoded.startsWith('@')) {
    const parts = decoded.slice(1).split('/')
    const fragmentName = parts[0]
    const childPath = parts.length > 1 ? parts.slice(1).join('/') : null

    if (onFragmentPage) {
      return { kind: 'fragmentEdit', fragmentName }
    }
    return { kind: 'fragmentLink', fragmentName, treePath: decoded, childPath }
  }

  // Inline component — template is unknown from hash alone, must be
  // looked up from the tree after parsing.
  return { kind: 'component', path: decoded, template: '' }
}

/**
 * When navigating from a fragment link to the fragment's edit page,
 * compute the hash for the destination. If the user clicked a child
 * (e.g. @header/logo), the destination hash should select that child
 * within the fragment editor (e.g. #component=logo).
 */
export function fragmentLinkDestinationHash(sel: FragmentLinkSelection): string {
  if (sel.childPath) {
    return `#${HASH_PREFIX}${encodeURIComponent(sel.childPath)}`
  }
  return ''
}
