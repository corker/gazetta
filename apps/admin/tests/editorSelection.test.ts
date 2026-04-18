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
    it('encodes root', () => {
      expect(selectionToHash({ kind: 'root' })).toBe('#component=_root')
    })

    it('encodes inline component', () => {
      expect(selectionToHash({ kind: 'component', path: 'hero', template: 'hero' })).toBe('#component=hero')
    })

    it('encodes nested component path', () => {
      expect(selectionToHash({ kind: 'component', path: 'features/fast', template: 'card' })).toBe(
        '#component=features/fast',
      )
    })

    it('encodes fragment link from page context', () => {
      expect(
        selectionToHash({ kind: 'fragmentLink', fragmentName: 'header', treePath: '@header', childPath: null }),
      ).toBe('#component=@header')
    })

    it('encodes fragment link child from page context', () => {
      expect(
        selectionToHash({
          kind: 'fragmentLink',
          fragmentName: 'header',
          treePath: '@header/logo',
          childPath: 'logo',
        }),
      ).toBe('#component=@header/logo')
    })

    it('encodes fragment edit', () => {
      expect(selectionToHash({ kind: 'fragmentEdit', fragmentName: 'header' })).toBe('#component=@header')
    })
  })

  describe('hashToSelection', () => {
    it('returns null for empty hash', () => {
      expect(hashToSelection('', false)).toBeNull()
    })

    it('returns null for unrelated hash', () => {
      expect(hashToSelection('#other', false)).toBeNull()
    })

    it('parses root', () => {
      expect(hashToSelection('#component=_root', false)).toEqual({ kind: 'root' })
    })

    it('parses inline component', () => {
      const sel = hashToSelection('#component=hero', false)
      expect(sel?.kind).toBe('component')
      expect((sel as { path: string }).path).toBe('hero')
    })

    it('parses encoded nested component', () => {
      const sel = hashToSelection('#component=features/fast', false)
      expect(sel?.kind).toBe('component')
      expect((sel as { path: string }).path).toBe('features/fast')
    })

    it('parses @fragment on a page as fragmentLink', () => {
      const sel = hashToSelection('#component=@header', false)
      expect(sel).toEqual({ kind: 'fragmentLink', fragmentName: 'header', treePath: '@header', childPath: null })
    })

    it('parses @fragment/child on a page as fragmentLink with childPath', () => {
      const sel = hashToSelection('#component=@header/logo', false)
      expect(sel).toEqual({
        kind: 'fragmentLink',
        fragmentName: 'header',
        treePath: '@header/logo',
        childPath: 'logo',
      })
    })

    it('parses @fragment on a fragment page as fragmentEdit', () => {
      const sel = hashToSelection('#component=@header', true)
      expect(sel).toEqual({ kind: 'fragmentEdit', fragmentName: 'header' })
    })

    it('round-trips root', () => {
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
      expect(fragmentLinkDestinationHash(sel)).toBe('#component=logo')
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
      expect(fragmentLinkDestinationHash(sel)).toBe('#component=nav/links')
    })
  })
})
