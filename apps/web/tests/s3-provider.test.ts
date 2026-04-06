import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import { createS3Provider } from '@gazetta/renderer'

describe('S3 storage provider (MinIO)', () => {
  let container: StartedTestContainer
  let provider: ReturnType<typeof createS3Provider>

  beforeAll(async () => {
    container = await new GenericContainer('minio/minio')
      .withExposedPorts({ container: 9000, host: 9000 })
      .withCommand(['server', '/data'])
      .withEnvironment({ MINIO_ROOT_USER: 'minioadmin', MINIO_ROOT_PASSWORD: 'minioadmin' })
      .start()

    provider = createS3Provider({
      endpoint: `http://${container.getHost()}:${container.getMappedPort(9000)}`,
      bucket: 's3-provider-test',
      accessKeyId: 'minioadmin',
      secretAccessKey: 'minioadmin',
      region: 'us-east-1',
    })
    await provider.init()
  }, 60000)

  afterAll(async () => {
    if (container) await container.stop()
  })

  it('writes and reads a file', async () => {
    await provider.writeFile('test.txt', 'hello world')
    const content = await provider.readFile('test.txt')
    expect(content).toBe('hello world')
  })

  it('checks file exists', async () => {
    await provider.writeFile('exists.txt', 'yes')
    expect(await provider.exists('exists.txt')).toBe(true)
    expect(await provider.exists('nope.txt')).toBe(false)
  })

  it('reads directory entries', async () => {
    await provider.writeFile('dir/a.txt', 'a')
    await provider.writeFile('dir/b.txt', 'b')
    await provider.writeFile('dir/sub/c.txt', 'c')

    const entries = await provider.readDir('dir')
    const names = entries.map(e => e.name)
    expect(names).toContain('a.txt')
    expect(names).toContain('b.txt')
    expect(names).toContain('sub')

    const sub = entries.find(e => e.name === 'sub')
    expect(sub?.isDirectory).toBe(true)
    const file = entries.find(e => e.name === 'a.txt')
    expect(file?.isDirectory).toBe(false)
  })

  it('checks directory exists', async () => {
    await provider.writeFile('mydir/file.txt', 'content')
    expect(await provider.exists('mydir')).toBe(true)
    expect(await provider.exists('nonexistent-dir')).toBe(false)
  })

  it('throws on reading nonexistent file', async () => {
    await expect(provider.readFile('missing.txt')).rejects.toThrow()
  })

  it('deletes files', async () => {
    await provider.writeFile('to-delete.txt', 'bye')
    expect(await provider.exists('to-delete.txt')).toBe(true)
    await provider.rm('to-delete.txt')
    expect(await provider.exists('to-delete.txt')).toBe(false)
  })

  it('deletes directory recursively', async () => {
    await provider.writeFile('rmdir/a.txt', 'a')
    await provider.writeFile('rmdir/b.txt', 'b')
    await provider.rm('rmdir')
    expect(await provider.exists('rmdir/a.txt')).toBe(false)
    expect(await provider.exists('rmdir/b.txt')).toBe(false)
  })

  it('mkdir is a no-op (S3 has no directories)', async () => {
    await provider.mkdir('some/nested/dir')
    // No error thrown — that's the test
  })
})
