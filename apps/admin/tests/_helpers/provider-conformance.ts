/**
 * Shared storage-provider conformance suite — the canonical "does this
 * provider satisfy StorageProvider?" test battery, extracted so every
 * provider (filesystem, S3, Azure Blob, R2) runs the same assertions.
 *
 * Closes testing-plan.md Priority 2.1: Azure had only 3 publish-level
 * tests, S3 had 8 direct CRUD tests. Parity now enforced by running
 * the same function against both.
 *
 * SRP: this module owns the conformance contract, nothing else. New
 * providers opt in by calling `runProviderConformance(...)` from their
 * docker.test.ts describe block with a factory that returns an
 * initialized StorageProvider.
 *
 * Why a factory rather than a plain instance: providers need different
 * buckets/containers per test batch (to keep parallel test runs from
 * colliding), so the caller supplies a "give me a provider named X"
 * callback. The helper calls it once at suite start.
 */
import { beforeAll, describe, it, expect } from 'vitest'
import type { StorageProvider } from 'gazetta'

export interface ProviderFactory {
  /** Human-readable name, used in the describe() label. */
  name: string
  /**
   * Create an initialized provider bound to a unique namespace (bucket /
   * container / dir). Caller decides the naming scheme; helper only
   * requires that successive calls with different names don't collide.
   */
  make(namespace: string): Promise<StorageProvider>
}

/**
 * Register the storage-provider conformance battery under its own
 * describe() block. Call once per provider from docker.test.ts.
 *
 * Each test uses fresh keys so ordering doesn't matter, but the test
 * suite itself shares one provider (one bucket/container) because
 * per-test provision would triple Azurite/MinIO setup time.
 */
export function runProviderConformance(factory: ProviderFactory): void {
  describe(`${factory.name} — StorageProvider conformance`, () => {
    let provider: StorageProvider

    beforeAll(async () => {
      // A stable namespace per provider; tests use unique file paths
      // within it so state doesn't leak between tests.
      provider = await factory.make('conformance')
    })

    it('writes and reads a file', async () => {
      await provider.writeFile('rw/hello.txt', 'hello world')
      expect(await provider.readFile('rw/hello.txt')).toBe('hello world')
    })

    it('exists returns true for a written file and false for a missing one', async () => {
      await provider.writeFile('exists/yes.txt', 'yes')
      expect(await provider.exists('exists/yes.txt')).toBe(true)
      expect(await provider.exists('exists/nope.txt')).toBe(false)
    })

    it('reads a directory and distinguishes files vs subdirectories', async () => {
      await provider.writeFile('readdir/a.txt', 'a')
      await provider.writeFile('readdir/b.txt', 'b')
      await provider.writeFile('readdir/sub/c.txt', 'c')

      const entries = await provider.readDir('readdir')
      const names = entries.map(e => e.name)
      expect(names).toContain('a.txt')
      expect(names).toContain('b.txt')
      expect(names).toContain('sub')
      expect(entries.find(e => e.name === 'sub')?.isDirectory).toBe(true)
      expect(entries.find(e => e.name === 'a.txt')?.isDirectory).toBe(false)
    })

    it('exists on a directory prefix returns true, on a missing prefix returns false', async () => {
      await provider.writeFile('existsdir/file.txt', 'content')
      expect(await provider.exists('existsdir')).toBe(true)
      expect(await provider.exists('existsdir-missing')).toBe(false)
    })

    it('readFile throws on a missing file', async () => {
      await expect(provider.readFile('never/written.txt')).rejects.toThrow()
    })

    it('rm deletes a single file', async () => {
      await provider.writeFile('rm-file/bye.txt', 'bye')
      await provider.rm('rm-file/bye.txt')
      expect(await provider.exists('rm-file/bye.txt')).toBe(false)
    })

    it('rm deletes a directory recursively', async () => {
      await provider.writeFile('rm-dir/a.txt', 'a')
      await provider.writeFile('rm-dir/b.txt', 'b')
      await provider.writeFile('rm-dir/sub/c.txt', 'c')
      await provider.rm('rm-dir')
      expect(await provider.exists('rm-dir/a.txt')).toBe(false)
      expect(await provider.exists('rm-dir/b.txt')).toBe(false)
      expect(await provider.exists('rm-dir/sub/c.txt')).toBe(false)
    })

    it('mkdir is safe to call (no-op on object stores, creates on fs)', async () => {
      // No assertion beyond "doesn't throw" — object stores have no
      // real directories, filesystem does but we don't need to verify
      // that here (filesystem-provider.test.ts covers the fs-specific
      // behavior). The contract is: mkdir must be idempotent and safe.
      await provider.mkdir('mkdir-safe/a/b/c')
      await provider.mkdir('mkdir-safe/a/b/c')  // second call, same path
    })
  })
}
