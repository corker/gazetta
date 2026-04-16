/**
 * Property-based tests for hash.ts helpers — focused on the round-trip
 * and non-collision invariants for fragment/template name encoding and
 * sidecar filename generation. Closes testing-plan.md Priority 1.3.
 *
 * Scope (explicitly narrow — complements existing example tests in
 * hash.test.ts):
 *   - encodeRefName / decodeRefName round-trip
 *   - sidecarNameFor / parseSidecarName round-trip + rejection
 *   - usesSidecarNameFor / parseUsesSidecarName round-trip
 *   - templateSidecarNameFor / parseTemplateSidecarName round-trip
 *   - Non-collision: the three sidecar regexes don't match each other's
 *     outputs for typical inputs
 *
 * hashManifest stability and key-order invariance are already covered
 * by hash.test.ts:55-68 — not repeated here.
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  encodeRefName, decodeRefName,
  sidecarNameFor, parseSidecarName,
  usesSidecarNameFor, parseUsesSidecarName,
  templateSidecarNameFor, parseTemplateSidecarName,
} from '../src/hash.js'

/**
 * Ref names are filesystem-safe identifiers — lowercase-kebab-case with
 * optional `/` segments for subfolder grouping (e.g. `buttons/primary`).
 * No leading/trailing slashes, no dots, no spaces.
 */
const refNameArb = fc.stringMatching(/^[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)*$/)
  .filter(s => s.length > 0 && s.length <= 80)

/** 8-character lowercase hex hash — the output shape of hashManifest. */
const hashArb = fc.stringMatching(/^[0-9a-f]{8}$/)

describe('encodeRefName / decodeRefName', () => {
  it('decode(encode(x)) === x for ref names with subfolders', () => {
    fc.assert(
      fc.property(refNameArb, (name) => {
        expect(decodeRefName(encodeRefName(name))).toBe(name)
      }),
      { numRuns: 200 },
    )
  })

  it('encode produces no / — always safe as a filename component', () => {
    fc.assert(
      fc.property(refNameArb, (name) => {
        expect(encodeRefName(name)).not.toContain('/')
      }),
      { numRuns: 200 },
    )
  })

  it('encode of a name without / is identity', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z][a-z0-9-]*$/).filter(s => s.length > 0), (name) => {
        expect(encodeRefName(name)).toBe(name)
      }),
      { numRuns: 100 },
    )
  })
})

describe('sidecarNameFor / parseSidecarName round-trip', () => {
  it('parse(generate(h)) === h for every 8-hex hash', () => {
    fc.assert(
      fc.property(hashArb, (h) => {
        expect(parseSidecarName(sidecarNameFor(h))).toBe(h)
      }),
      { numRuns: 200 },
    )
  })

  it('rejects names that are not exactly .{8hex}.hash', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        // If the string doesn't match the expected pattern, parse must return null.
        const isValid = /^\.[0-9a-f]{8}\.hash$/.test(s)
        if (!isValid) expect(parseSidecarName(s)).toBeNull()
      }),
      { numRuns: 500 },
    )
  })
})

describe('usesSidecarNameFor / parseUsesSidecarName round-trip', () => {
  it('parse(generate(name)) === name for every ref name', () => {
    fc.assert(
      fc.property(refNameArb, (name) => {
        expect(parseUsesSidecarName(usesSidecarNameFor(name))).toBe(name)
      }),
      { numRuns: 200 },
    )
  })

  it('produces filenames starting with .uses- and containing no /', () => {
    fc.assert(
      fc.property(refNameArb, (name) => {
        const out = usesSidecarNameFor(name)
        expect(out.startsWith('.uses-')).toBe(true)
        expect(out).not.toContain('/')
      }),
      { numRuns: 200 },
    )
  })
})

describe('templateSidecarNameFor / parseTemplateSidecarName round-trip', () => {
  it('parse(generate(name)) === name for every template name', () => {
    fc.assert(
      fc.property(refNameArb, (name) => {
        expect(parseTemplateSidecarName(templateSidecarNameFor(name))).toBe(name)
      }),
      { numRuns: 200 },
    )
  })

  it('produces filenames starting with .tpl- and containing no /', () => {
    fc.assert(
      fc.property(refNameArb, (name) => {
        const out = templateSidecarNameFor(name)
        expect(out.startsWith('.tpl-')).toBe(true)
        expect(out).not.toContain('/')
      }),
      { numRuns: 200 },
    )
  })
})

describe('non-collision between sidecar kinds', () => {
  it('a generated .hash name is not parsed as uses or tpl', () => {
    fc.assert(
      fc.property(hashArb, (h) => {
        const name = sidecarNameFor(h)
        expect(parseUsesSidecarName(name)).toBeNull()
        expect(parseTemplateSidecarName(name)).toBeNull()
      }),
      { numRuns: 200 },
    )
  })

  it('a generated uses-* name is not parsed as hash or tpl', () => {
    fc.assert(
      fc.property(refNameArb, (name) => {
        const out = usesSidecarNameFor(name)
        expect(parseSidecarName(out)).toBeNull()
        expect(parseTemplateSidecarName(out)).toBeNull()
      }),
      { numRuns: 200 },
    )
  })

  it('a generated tpl-* name is not parsed as hash or uses', () => {
    fc.assert(
      fc.property(refNameArb, (name) => {
        const out = templateSidecarNameFor(name)
        expect(parseSidecarName(out)).toBeNull()
        expect(parseUsesSidecarName(out)).toBeNull()
      }),
      { numRuns: 200 },
    )
  })
})
