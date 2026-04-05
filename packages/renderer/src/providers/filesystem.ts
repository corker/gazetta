import { readFile, readdir, access } from 'node:fs/promises'
import type { StorageProvider, DirEntry } from '@gazetta/shared'

export function createFilesystemProvider(): StorageProvider {
  return {
    async readFile(path: string): Promise<string> {
      try {
        return await readFile(path, 'utf-8')
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'ENOENT') throw new Error(`File not found: ${path}`)
        throw new Error(`Cannot read ${path}: ${(err as Error).message}`)
      }
    },

    async readDir(path: string): Promise<DirEntry[]> {
      try {
        const entries = await readdir(path, { withFileTypes: true })
        return entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }))
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'ENOENT') throw new Error(`Directory not found: ${path}`)
        throw new Error(`Cannot read directory ${path}: ${(err as Error).message}`)
      }
    },

    async exists(path: string): Promise<boolean> {
      try {
        await access(path)
        return true
      } catch {
        return false
      }
    },
  }
}
