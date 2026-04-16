/**
 * Property-based tests for the sidecar-name codec in hash.ts.
 *
 * The sidecar filenames are the persistent shape we write to disk, so
 * the encode/decode contract has to hold across every name a real site
 * might throw at it (fragments with subfolders, templates with weird
 * characters, unicode, empty-ish). Example tests catch the obvious
 * cases; `fast-check` probes the edge space.
 *
 * Properties covered:
 *   1. encodeRefName / decodeRefName round-trip for arbitrary strings
 *   2. usesSidecarName round-trip (name → filename → name)
 *   3. templateSidecarName round-trip (name → filename → name)
 *   4. The three sidecar regexes don't collide — a filename the
 *      encoder produces for one kind isn't mistakenly parsed as another
 *
 * Not covered here: hashManifest key-order invariance is example-tested
 * in hash.test.ts already.
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  encodeRefName,
  decodeRefName,
  sidecarNameFor,
  parseSidecarName,
  usesSidecarNameFor,
  parseUsesSidecarName,
  templateSidecarNameFor,
  parseTemplateSidecarName,
} from '../src/hash.js'

/**
 * Reference names are fragment/template ids authored in site.yaml /
 * component lists. Per operations.md they're lowercase-kebab-case,
 * optionally subfolder-qualified with `/` (e.g. `buttons/primary`).
 * The encoder's `/` ↔ `.` scheme is invertible only when the input
 * has no `.` — encodeRefName validates that, and this arbitrary stays
 * within the valid domain.
 *
 * Excluded:
 *   - Empty string (not meaningful as a ref)
 *   - Control characters (not valid in filenames on most providers)
 *   - `.` (validator throws; tested separately. `.` is already
 *     documented as off-limits in operations.md.)
 */
const refNameArb = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter(s => !/[\x00-\x1f]/.test(s))
  .filter(s => !s.includes('.'))

describe('encodeRefName / decodeRefName', () => {
  it('round-trips arbitrary ref names', () => {
    fc.assert(
      fc.property(refNameArb, name => {
        expect(decodeRefName(encodeRefName(name))).toBe(name)
      }),
    )
  })

  it('replaces every forward slash with a dot', () => {
    expect(encodeRefName('a/b/c')).toBe('a.b.c')
    // The fully-specced form: no slash survives encoding.
    fc.assert(
      fc.property(refNameArb, name => {
        expect(encodeRefName(name)).not.toMatch(/\//)
      }),
    )
  })

  it('preserves underscores — they are valid in ref names', () => {
    // Underscore is a common spacing character in names. The codec
    // uses `.` as the path separator specifically to keep `_` legal
    // (earlier `/` ↔ `__` was ambiguous for inputs containing `_`).
    expect(encodeRefName('my_fragment')).toBe('my_fragment')
    expect(decodeRefName(encodeRefName('a_b/c_d'))).toBe('a_b/c_d')
  })

  it('throws on names containing a dot (reserved for path encoding)', () => {
    // Dot is the path separator in encoded form. An author who sneaks
    // a `.` into a ref would otherwise get silent misrouting on
    // sidecar reads. Per operations.md, `.` is already documented as
    // avoided in ref names — this makes the contract loud.
    expect(() => encodeRefName('foo.bar')).toThrow(/dot/i)
    expect(() => encodeRefName('.')).toThrow()
    expect(() => encodeRefName('a/b.c')).toThrow()
  })
})

describe('usesSidecarName round-trip', () => {
  it('name → filename → name for arbitrary fragment names', () => {
    fc.assert(
      fc.property(refNameArb, name => {
        expect(parseUsesSidecarName(usesSidecarNameFor(name))).toBe(name)
      }),
    )
  })

  it('produces filenames starting with `.uses-`', () => {
    fc.assert(
      fc.property(refNameArb, name => {
        expect(usesSidecarNameFor(name).startsWith('.uses-')).toBe(true)
      }),
    )
  })

  it('rejects non-uses names (returns null)', () => {
    expect(parseUsesSidecarName('index.html')).toBeNull()
    expect(parseUsesSidecarName('.tpl-something')).toBeNull()
    expect(parseUsesSidecarName('')).toBeNull()
  })
})

describe('templateSidecarName round-trip', () => {
  it('name → filename → name for arbitrary template names', () => {
    fc.assert(
      fc.property(refNameArb, name => {
        expect(parseTemplateSidecarName(templateSidecarNameFor(name))).toBe(name)
      }),
    )
  })

  it('produces filenames starting with `.tpl-`', () => {
    fc.assert(
      fc.property(refNameArb, name => {
        expect(templateSidecarNameFor(name).startsWith('.tpl-')).toBe(true)
      }),
    )
  })

  it('rejects non-tpl names (returns null)', () => {
    expect(parseTemplateSidecarName('index.html')).toBeNull()
    expect(parseTemplateSidecarName('.uses-something')).toBeNull()
    expect(parseTemplateSidecarName('')).toBeNull()
  })
})

describe('sidecar kind disambiguation', () => {
  // The three sidecar parsers walk the same directory listing (see
  // sidecars.ts readSidecars). If a filename produced by the uses
  // encoder happened to also match the hash regex, readSidecars would
  // misclassify it and callers would see the wrong data. This runs
  // both encoders against arbitrary names and asserts each filename
  // parses to exactly one kind.

  it('usesSidecar filenames never parse as hash or tpl', () => {
    fc.assert(
      fc.property(refNameArb, name => {
        const fname = usesSidecarNameFor(name)
        expect(parseSidecarName(fname)).toBeNull()
        expect(parseTemplateSidecarName(fname)).toBeNull()
        // And the expected positive result for completeness.
        expect(parseUsesSidecarName(fname)).toBe(name)
      }),
    )
  })

  it('templateSidecar filenames never parse as hash or uses', () => {
    fc.assert(
      fc.property(refNameArb, name => {
        const fname = templateSidecarNameFor(name)
        expect(parseSidecarName(fname)).toBeNull()
        expect(parseUsesSidecarName(fname)).toBeNull()
        expect(parseTemplateSidecarName(fname)).toBe(name)
      }),
    )
  })

  it('hash sidecar filenames never parse as uses or tpl', () => {
    // Hashes are 8-hex — generate arbitrary 8-char lowercase hex.
    const hexArb = fc.stringMatching(/^[0-9a-f]{8}$/, { minLength: 8, maxLength: 8 })
    fc.assert(
      fc.property(hexArb, hex => {
        const fname = sidecarNameFor(hex)
        expect(parseUsesSidecarName(fname)).toBeNull()
        expect(parseTemplateSidecarName(fname)).toBeNull()
        expect(parseSidecarName(fname)).toBe(hex)
      }),
    )
  })
})
