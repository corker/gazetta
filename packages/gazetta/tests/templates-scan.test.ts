import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scanTemplate, scanTemplates, templateHashesFrom } from '../src/templates-scan.js'

const root = join(tmpdir(), 'gazetta-scan-test-' + Date.now())
const templatesDir = join(root, 'templates')

// Tests use a fake "schema" object instead of importing zod, so they can run
// in a temp dir without node_modules. The scanner only checks that `schema`
// is truthy (not that it's a real Zod type).
const VALID = `
export const schema = { type: 'object', properties: { title: { type: 'string' } } }
export default ({ content }) => ({ html: '<h1>' + content.title + '</h1>', css: '', js: '' })
`

const SHARED = `export function shout(s) { return s.toUpperCase() }`
const USES_SHARED = `
import { shout } from '../_shared/util.js'
export const schema = { type: 'object' }
export default ({ content }) => ({ html: shout(content.title), css: '', js: '' })
`

const NO_DEFAULT = `
export const schema = { type: 'object' }
`

const NO_SCHEMA = `
export default () => ({ html: '', css: '', js: '' })
`

const SYNTAX_ERROR = `this is not valid js!!!`

beforeAll(async () => {
  await mkdir(join(templatesDir, 'good'), { recursive: true })
  await writeFile(join(templatesDir, 'good/index.js'), VALID)

  await mkdir(join(templatesDir, '_shared'), { recursive: true })
  await writeFile(join(templatesDir, '_shared/util.js'), SHARED)
  await mkdir(join(templatesDir, 'uses-shared'), { recursive: true })
  await writeFile(join(templatesDir, 'uses-shared/index.js'), USES_SHARED)

  await mkdir(join(templatesDir, 'no-default'), { recursive: true })
  await writeFile(join(templatesDir, 'no-default/index.js'), NO_DEFAULT)

  await mkdir(join(templatesDir, 'no-schema'), { recursive: true })
  await writeFile(join(templatesDir, 'no-schema/index.js'), NO_SCHEMA)

  await mkdir(join(templatesDir, 'broken'), { recursive: true })
  await writeFile(join(templatesDir, 'broken/index.js'), SYNTAX_ERROR)
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('scanTemplates', () => {
  it('discovers and validates valid templates', async () => {
    const results = await scanTemplates(templatesDir, root)
    const good = results.find(r => r.name === 'good')
    expect(good).toBeDefined()
    expect(good?.valid).toBe(true)
    expect(good?.hash).toMatch(/^[0-9a-f]{8}$/)
    expect(good?.errors).toEqual([])
  })

  it('skips _shared directories', async () => {
    const results = await scanTemplates(templatesDir, root)
    expect(results.find(r => r.name === '_shared')).toBeUndefined()
  })

  it('flags template missing default export', async () => {
    const results = await scanTemplates(templatesDir, root)
    const r = results.find(r => r.name === 'no-default')
    expect(r?.valid).toBe(false)
    expect(r?.errors.some(e => e.includes('default export'))).toBe(true)
  })

  it('flags template missing schema export', async () => {
    const results = await scanTemplates(templatesDir, root)
    const r = results.find(r => r.name === 'no-schema')
    expect(r?.valid).toBe(false)
    expect(r?.errors.some(e => e.includes('schema'))).toBe(true)
  })

  it('flags template that fails to import', async () => {
    const results = await scanTemplates(templatesDir, root)
    const r = results.find(r => r.name === 'broken')
    expect(r?.valid).toBe(false)
    expect(r?.errors.some(e => e.includes('import failed'))).toBe(true)
    expect(r?.hash).toBe('')
  })

  it('hashes all 5 discovered templates in parallel', async () => {
    const results = await scanTemplates(templatesDir, root)
    expect(results).toHaveLength(5)
  })
})

describe('scanTemplate (single)', () => {
  it('returns hash for a valid template', async () => {
    const r = await scanTemplate(templatesDir, root, 'good')
    expect(r.valid).toBe(true)
    expect(r.hash).toMatch(/^[0-9a-f]{8}$/)
  })

  it('returns error when template directory is missing', async () => {
    const r = await scanTemplate(templatesDir, root, 'does-not-exist')
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toContain('no index')
  })

  it('captures _shared imports in the hash', async () => {
    const r1 = await scanTemplate(templatesDir, root, 'uses-shared')
    expect(r1.valid).toBe(true)
    expect(r1.files.length).toBeGreaterThanOrEqual(2)
    expect(r1.files.some(f => f.includes('_shared/util.js'))).toBe(true)

    // Modify _shared/util.js → hash should change
    await writeFile(join(templatesDir, '_shared/util.js'), 'export function shout(s) { return s + "!" }')
    const r2 = await scanTemplate(templatesDir, root, 'uses-shared')
    expect(r2.hash).not.toBe(r1.hash)
  })
})

describe('templateHashesFrom', () => {
  it('builds a map of valid templates only', async () => {
    const results = await scanTemplates(templatesDir, root)
    const map = templateHashesFrom(results)
    expect(map.has('good')).toBe(true)
    expect(map.has('uses-shared')).toBe(true)
    expect(map.has('no-default')).toBe(false)
    expect(map.has('no-schema')).toBe(false)
    expect(map.has('broken')).toBe(false)
  })
})
