import { parentPort, workerData } from 'node:worker_threads'
import { createJiti } from 'jiti'
import { pathToFileURL } from 'node:url'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { relative } from 'node:path'

interface WorkerInput {
  entry: string
  projectRoot: string
}

interface WorkerOutput {
  valid: boolean
  hash: string
  errors: string[]
  files: string[]
}

async function scan(input: WorkerInput): Promise<WorkerOutput> {
  const { entry, projectRoot } = input
  const jiti = createJiti(pathToFileURL(entry).href, { jsx: true, moduleCache: true })

  let mod: Record<string, unknown>
  try {
    mod = await jiti.import(entry) as Record<string, unknown>
  } catch (err) {
    return { valid: false, hash: '', errors: [`import failed: ${(err as Error).message}`], files: [] }
  }

  const errors: string[] = []
  if (typeof mod.default !== 'function') errors.push('no default export (render function)')
  if (!mod.schema) errors.push('no `schema` export')

  const files = Object.keys(jiti.cache as Record<string, unknown>)
    .filter(p => !p.includes('/node_modules/'))
    .sort()

  const h = createHash('md5')
  for (const file of files) {
    const rel = relative(projectRoot, file)
    h.update(rel + '\0')
    h.update(await readFile(file))
    h.update('\0')
  }

  return {
    valid: errors.length === 0,
    hash: h.digest('hex').slice(0, 8),
    errors,
    files: files.map(f => relative(projectRoot, f)),
  }
}

if (!parentPort) throw new Error('templates-scan-worker must be run as a worker_thread')

scan(workerData as WorkerInput).then(r => parentPort!.postMessage(r))
