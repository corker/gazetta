import { describe, it, expect, afterEach } from 'vitest'
import { join } from 'node:path'
import { rm, mkdir } from 'node:fs/promises'
import { createFilesystemProvider } from '../src/providers/filesystem.js'
import { tempDir } from './_helpers/temp.js'

const testDir = tempDir('fs-test-' + Date.now())

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('createFilesystemProvider (no basePath)', () => {
  const fs = createFilesystemProvider()

  it('writeFile and readFile', async () => {
    const path = join(testDir, 'test.txt')
    await mkdir(testDir, { recursive: true })
    await fs.writeFile(path, 'hello world')
    const content = await fs.readFile(path)
    expect(content).toBe('hello world')
  })

  it('exists returns true for existing file', async () => {
    const path = join(testDir, 'exists.txt')
    await mkdir(testDir, { recursive: true })
    await fs.writeFile(path, 'yes')
    expect(await fs.exists(path)).toBe(true)
  })

  it('exists returns false for missing file', async () => {
    expect(await fs.exists(join(testDir, 'nope.txt'))).toBe(false)
  })

  it('mkdir creates directories', async () => {
    const dir = join(testDir, 'a/b/c')
    await fs.mkdir(dir)
    expect(await fs.exists(dir)).toBe(true)
  })

  it('readDir lists entries', async () => {
    await fs.mkdir(join(testDir, 'dir'))
    await fs.mkdir(join(testDir, 'dir/sub'))
    await fs.writeFile(join(testDir, 'dir/file.txt'), 'data')

    const entries = await fs.readDir(join(testDir, 'dir'))
    expect(entries).toHaveLength(2)

    const names = entries.map(e => e.name)
    expect(names).toContain('sub')
    expect(names).toContain('file.txt')

    const sub = entries.find(e => e.name === 'sub')
    expect(sub?.isDirectory).toBe(true)
    const file = entries.find(e => e.name === 'file.txt')
    expect(file?.isDirectory).toBe(false)
  })

  it('rm removes files and directories', async () => {
    await fs.mkdir(join(testDir, 'rmdir'))
    await fs.writeFile(join(testDir, 'rmdir/file.txt'), 'data')
    await fs.rm(join(testDir, 'rmdir'))
    expect(await fs.exists(join(testDir, 'rmdir'))).toBe(false)
  })
})

describe('createFilesystemProvider (with basePath)', () => {
  it('prepends basePath to all operations', async () => {
    await mkdir(testDir, { recursive: true })
    const fs = createFilesystemProvider(testDir)

    await fs.writeFile('relative.txt', 'hello')
    const content = await fs.readFile('relative.txt')
    expect(content).toBe('hello')
    expect(await fs.exists('relative.txt')).toBe(true)
  })

  it('mkdir with basePath', async () => {
    await mkdir(testDir, { recursive: true })
    const fs = createFilesystemProvider(testDir)

    await fs.mkdir('subdir')
    expect(await fs.exists('subdir')).toBe(true)
  })

  it('readDir with basePath', async () => {
    await mkdir(testDir, { recursive: true })
    const fs = createFilesystemProvider(testDir)

    await fs.writeFile('a.txt', '1')
    await fs.writeFile('b.txt', '2')
    const entries = await fs.readDir('.')
    const names = entries.map(e => e.name)
    expect(names).toContain('a.txt')
    expect(names).toContain('b.txt')
  })
})
