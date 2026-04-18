import { describe, it, expect } from 'vitest'
import {
  selectionToHash,
  hashToSelection,
  fragmentLinkDestinationHash,
  type EditorSelection,
  type FragmentLinkSelection,
} from '../src/client/composables/editorSelection.js'

describe('editorSelection', () => {
  describe('selectionToHash', () => {
    it('encodes root as empty hash', () => {
      expect(selectionToHash({ kind: 'root' })).toBe('')
    })

    it('encodes inline component', () => {
      expect(selectionToHash({ kind: 'component', path: 'hero', template: 'hero' })).toBe('#hero')
    })

    it('encodes nested component path', () => {
      expect(selectionToHash({ kind: 'component', path: 'features/fast', template: 'card' })).toBe('#features/fast')
    })

    it('encodes fragment link from page context', () => {
      expect(
        selectionToHash({ kind: 'fragmentLink', fragmentName: 'header', treePath: '@header', childPath: null }),
      ).toBe('#@header')
    })

    it('encodes fragment link child from page context', () => {
      expect(
        selectionToHash({
          kind: 'fragmentLink',
          fragmentName: 'header',
          treePath: '@header/logo',
          childPath: 'logo',
        }),
      ).toBe('#@header/logo')
    })

    it('encodes fragment edit', () => {
      expect(selectionToHash({ kind: 'fragmentEdit', fragmentName: 'header' })).toBe('#@header')
    })
  })

  describe('hashToSelection', () => {
    it('parses empty hash as root', () => {
      expect(hashToSelection('', false)).toEqual({ kind: 'root' })
    })

    it('parses # as root', () => {
      expect(hashToSelection('#', false)).toEqual({ kind: 'root' })
    })

    it('parses plain string as component', () => {
      expect(hashToSelection('#other', false)).toEqual({ kind: 'component', path: 'other', template: '' })
    })

    it('parses inline component', () => {
      const sel = hashToSelection('#hero', false)
      expect(sel?.kind).toBe('component')
      expect((sel as { path: string }).path).toBe('hero')
    })

    it('parses encoded nested component', () => {
      const sel = hashToSelection('#features/fast', false)
      expect(sel?.kind).toBe('component')
      expect((sel as { path: string }).path).toBe('features/fast')
    })

    it('parses @fragment on a page as fragmentLink', () => {
      const sel = hashToSelection('#@header', false)
      expect(sel).toEqual({ kind: 'fragmentLink', fragmentName: 'header', treePath: '@header', childPath: null })
    })

    it('parses @fragment/child on a page as fragmentLink with childPath', () => {
      const sel = hashToSelection('#@header/logo', false)
      expect(sel).toEqual({
        kind: 'fragmentLink',
        fragmentName: 'header',
        treePath: '@header/logo',
        childPath: 'logo',
      })
    })

    it('parses @fragment on a fragment page as fragmentEdit', () => {
      const sel = hashToSelection('#@header', true)
      expect(sel).toEqual({ kind: 'fragmentEdit', fragmentName: 'header' })
    })

    it('round-trips root (empty hash)', () => {
      const original: EditorSelection = { kind: 'root' }
      expect(hashToSelection(selectionToHash(original), false)).toEqual(original)
    })

    it('round-trips component', () => {
      const original: EditorSelection = { kind: 'component', path: 'features/fast', template: 'card' }
      const parsed = hashToSelection(selectionToHash(original), false)
      expect(parsed?.kind).toBe('component')
      expect((parsed as { path: string }).path).toBe('features/fast')
    })

    it('round-trips fragmentLink', () => {
      const original: FragmentLinkSelection = {
        kind: 'fragmentLink',
        fragmentName: 'header',
        treePath: '@header/logo',
        childPath: 'logo',
      }
      expect(hashToSelection(selectionToHash(original), false)).toEqual(original)
    })
  })

  describe('fragmentLinkDestinationHash', () => {
    it('returns child hash when child was clicked', () => {
      const sel: FragmentLinkSelection = {
        kind: 'fragmentLink',
        fragmentName: 'header',
        treePath: '@header/logo',
        childPath: 'logo',
      }
      expect(fragmentLinkDestinationHash(sel)).toBe('#logo')
    })

    it('returns empty string when fragment root was clicked', () => {
      const sel: FragmentLinkSelection = {
        kind: 'fragmentLink',
        fragmentName: 'header',
        treePath: '@header',
        childPath: null,
      }
      expect(fragmentLinkDestinationHash(sel)).toBe('')
    })

    it('handles nested child path', () => {
      const sel: FragmentLinkSelection = {
        kind: 'fragmentLink',
        fragmentName: 'header',
        treePath: '@header/nav/links',
        childPath: 'nav/links',
      }
      expect(fragmentLinkDestinationHash(sel)).toBe('#nav/links')
    })
  })
})
