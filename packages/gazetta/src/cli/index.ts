#!/usr/bin/env node

import { resolve, join, dirname } from 'node:path'
import { watch, existsSync, readFileSync } from 'node:fs'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import yaml from 'js-yaml'
import { loadSite } from '../site-loader.js'
import { resolvePage } from '../resolver.js'
import { renderPage } from '../renderer.js'
import { createFilesystemProvider } from '../providers/filesystem.js'
import { invalidateTemplate, invalidateAllTemplates } from '../template-loader.js'
// createTargetRegistry is used lazily by admin-api publish routes
import type { SiteManifest } from '../types.js'
import { createAdminApp } from '../admin-api/index.js'

// ANSI color helpers — no dependency, suppressed when NO_COLOR or CI
const noColor = !!process.env.NO_COLOR || !process.stdout.isTTY
const c = {
  bold: (s: string) => noColor ? s : `\x1b[1m${s}\x1b[22m`,
  dim: (s: string) => noColor ? s : `\x1b[2m${s}\x1b[22m`,
  cyan: (s: string) => noColor ? s : `\x1b[36m${s}\x1b[39m`,
  green: (s: string) => noColor ? s : `\x1b[32m${s}\x1b[39m`,
  yellow: (s: string) => noColor ? s : `\x1b[33m${s}\x1b[39m`,
  red: (s: string) => noColor ? s : `\x1b[31m${s}\x1b[39m`,
  magenta: (s: string) => noColor ? s : `\x1b[35m${s}\x1b[39m`,
  bgGreen: (s: string) => noColor ? s : `\x1b[42m\x1b[30m${s}\x1b[39m\x1b[49m`,
}

const args = process.argv.slice(2)
const command = args[0]

/**
 * Detect the project root from a site directory.
 * Walks up from siteDir looking for a parent that contains templates/.
 * Falls back to siteDir for flat projects (templates/ inside site dir).
 */
function detectProjectRoot(siteDir: string): string {
  // If siteDir itself has templates/, it's a flat project
  if (existsSync(join(siteDir, 'templates'))) return siteDir
  // Walk up looking for templates/
  let dir = resolve(siteDir)
  const root = resolve('/')
  while (dir !== root) {
    const parent = dirname(dir)
    if (existsSync(join(parent, 'templates'))) return parent
    dir = parent
  }
  // Fallback — use siteDir (templates/ may not exist yet)
  return siteDir
}

function printHelp() {
  console.log(`
  gazetta - Stateless CMS for composable websites

  Usage:
    gazetta init [dir]              Create a new site
    gazetta dev [site]              Start dev server + CMS at /admin
    gazetta build                   Build admin UI for production
    gazetta admin [site]            Run production CMS admin server
    gazetta publish [target] [site] Pre-render and publish to a target
    gazetta serve [target] [site]   Serve published pages from target storage
    gazetta deploy [target] [site]  Deploy worker to hosting (one-time setup)
    gazetta validate [site]         Check site for broken references
    gazetta help                    Show this help message

  Options:
    --port, -p <port>               Server port (default: 3000)

  Auto-detection:
    Site is auto-detected from sites/ directory. If multiple sites exist,
    you'll be prompted to choose (or pass it as an argument).

    Target is auto-detected as the first target in site.yaml. If multiple
    targets exist, you'll be prompted to choose (or pass it as an argument).

  Examples:
    gazetta init my-site                # scaffold a new site
    gazetta dev                         # dev server (auto-detect site)
    gazetta publish                     # publish to default target
    gazetta publish production          # publish to production
    gazetta publish production my-site  # publish specific site to production
    gazetta serve production -p 8080    # serve production on port 8080
    gazetta validate                    # check site for errors
`)
}

interface ParsedArgs { positional: string[]; port?: number }

function parseArgs(input: string[]): ParsedArgs {
  const positional: string[] = []
  let port: number | undefined
  for (let i = 0; i < input.length; i++) {
    if (input[i] === '--port' || input[i] === '-p') {
      port = parseInt(input[++i], 10)
    } else if (!input[i].startsWith('-')) {
      positional.push(input[i])
    }
  }
  return { positional, port }
}

/**
 * Resolve the site directory from positional args or auto-detection.
 * For commands like `dev` and `validate`, the first positional is the site.
 * For commands like `publish` and `serve`, the first positional is the target
 * and the second is the site.
 */
async function resolveSiteDir(positionalSite?: string): Promise<string> {
  // Explicit site dir provided
  if (positionalSite) {
    const dir = resolve(positionalSite)
    if (existsSync(join(dir, 'site.yaml'))) return dir
    // Maybe it's a site name under sites/
    const sitesSubdir = resolve('sites', positionalSite)
    if (existsSync(join(sitesSubdir, 'site.yaml'))) return sitesSubdir
    // Maybe it's a project root with sites/
    const mainSite = resolve(dir, 'sites/main')
    if (existsSync(join(mainSite, 'site.yaml'))) return mainSite
    return dir // let loadSite produce a clear error
  }

  // Auto-detect: check current dir first
  if (existsSync(join(resolve('.'), 'site.yaml'))) return resolve('.')

  // Check sites/ directory
  const sitesDir = resolve('sites')
  if (existsSync(sitesDir)) {
    const { readdirSync, statSync } = await import('node:fs')
    const sites = readdirSync(sitesDir)
      .filter(name => {
        const dir = join(sitesDir, name)
        return statSync(dir).isDirectory() && existsSync(join(dir, 'site.yaml'))
      })

    if (sites.length === 1) return join(sitesDir, sites[0])
    if (sites.length > 1) {
      if (process.env.CI) {
        console.error(`\n  Error: multiple sites found. Specify one: gazetta ${command} <site>\n  Available: ${sites.join(', ')}\n`)
        process.exit(1)
      }
      const { select } = await import('@clack/prompts')
      const result = await select({
        message: 'Select site:',
        options: sites.map(s => ({ value: s, label: s })),
      })
      if (typeof result === 'symbol') process.exit(0) // cancelled
      return join(sitesDir, result as string)
    }
  }

  // No site found — give a helpful error
  console.error(`\n  Error: no site found in current directory.\n`)
  console.error(`  To create a new project:  gazetta init my-site`)
  console.error(`  To use an existing site:  gazetta ${command} <path-to-site>\n`)
  process.exit(1)
}

/**
 * Resolve target from positional args or auto-detection.
 * Prompts if multiple targets and no explicit choice.
 */
async function resolveTarget(positionalTarget: string | undefined, siteDir: string): Promise<string | undefined> {
  if (positionalTarget) return positionalTarget

  const siteYamlPath = join(siteDir, 'site.yaml')
  if (!existsSync(siteYamlPath)) return undefined

  const siteYaml = yaml.load(readFileSync(siteYamlPath, 'utf-8')) as SiteManifest
  const targets = Object.keys(siteYaml.targets ?? {})

  if (targets.length <= 1) return targets[0] // auto-select if 0 or 1

  if (process.env.CI) {
    console.error(`\n  Error: multiple targets found. Specify one: gazetta ${command} <target>\n  Available: ${targets.join(', ')}\n`)
    process.exit(1)
  }

  const { select } = await import('@clack/prompts')
  const result = await select({
    message: 'Select target:',
    options: targets.map(t => ({ value: t, label: t })),
  })
  if (typeof result === 'symbol') process.exit(0)
  return result as string
}

async function runInit(dir: string) {
  const { writeFile, mkdir } = await import('node:fs/promises')
  const target = resolve(dir)

  if (existsSync(join(target, 'sites')) || existsSync(join(target, 'site.yaml'))) {
    console.error(`\n  Error: project already exists in ${target}\n`)
    process.exit(1)
  }

  const name = target.split('/').pop() ?? 'my-site'

  const files: Record<string, string> = {
    'sites/main/site.yaml': `name: ${name}\nversion: 1.0.0\nsystemPages:\n  - "404"\ntargets:\n  local:\n    storage:\n      type: filesystem\n      path: ./dist/local\n`,

    'templates/page-layout/index.ts': `import { z } from 'zod'
import type { TemplateFunction } from 'gazetta'

export const schema = z.object({
  title: z.string().describe('Page title'),
  description: z.string().optional().describe('Page description'),
})

type Content = z.infer<typeof schema>

const template: TemplateFunction<Content> = ({ content, children = [] }) => ({
  html: \`<main>\${children.map(c => c.html).join('\\n')}</main>\`,
  css: \`main { max-width: 800px; margin: 0 auto; padding: 2rem; font-family: system-ui, sans-serif; }
\${children.map(c => c.css).join('\\n')}\`,
  js: children.map(c => c.js).filter(Boolean).join('\\n'),
  head: \`<title>\${content?.title ?? ''}</title>
\${content?.description ? \`<meta name="description" content="\${content.description}">\` : ''}
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
\${children.map(c => c.head).filter(Boolean).join('\\n')}\`,
})

export default template
`,

    'templates/hero/index.ts': `import { z } from 'zod'
import type { TemplateFunction } from 'gazetta'

export const schema = z.object({
  title: z.string().describe('Page title'),
  subtitle: z.string().optional().describe('Subtitle text'),
})

const template: TemplateFunction = ({ content = {} }) => ({
  html: \`<section class="hero">
  <h1>\${content.title ?? ''}</h1>
  <p>\${content.subtitle ?? ''}</p>
</section>\`,
  css: \`.hero { text-align: center; padding: 4rem 0; }
.hero h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
.hero p { color: #666; font-size: 1.25rem; }\`,
  js: '',
})

export default template
`,

    'templates/text-block/index.ts': `import { z } from 'zod'
import type { TemplateFunction } from 'gazetta'

export const schema = z.object({
  body: z.string().describe('Text content (HTML allowed)'),
})

const template: TemplateFunction = ({ content = {} }) => ({
  html: \`<div class="text-block">\${content.body ?? ''}</div>\`,
  css: \`.text-block { line-height: 1.6; margin: 2rem 0; }\`,
  js: '',
})

export default template
`,

    'templates/nav/index.ts': `import { z } from 'zod'
import type { TemplateFunction } from 'gazetta'

export const schema = z.object({
  brand: z.string().describe('Site name'),
  links: z.array(z.object({
    label: z.string(),
    href: z.string(),
  })).describe('Navigation links'),
})

const template: TemplateFunction = ({ content = {} }) => {
  const links = (content.links ?? []) as Array<{ label: string; href: string }>
  return {
    html: \`<nav class="nav">
  <a class="nav-brand" href="/">\${content.brand ?? ''}</a>
  <div class="nav-links">\${links.map(l => \`<a href="\${l.href}">\${l.label}</a>\`).join('\\n    ')}</div>
</nav>\`,
    css: \`.nav { display: flex; align-items: center; justify-content: space-between; padding: 1rem 2rem; border-bottom: 1px solid #eee; }
.nav-brand { font-weight: 700; font-size: 1.125rem; text-decoration: none; color: #1a1a1a; }
.nav-links { display: flex; gap: 1.5rem; }
.nav-links a { text-decoration: none; color: #555; font-size: 0.875rem; }
.nav-links a:hover { color: #1a1a1a; }\`,
    js: '',
  }
}

export default template
`,

    'sites/main/fragments/header/fragment.json': JSON.stringify({
      template: 'nav',
      content: { brand: name, links: [{ label: 'Home', href: '/' }] },
    }, null, 2) + '\n',

    'sites/main/pages/home/page.json': JSON.stringify({
      template: 'page-layout',
      content: { title: name, description: 'A site built with Gazetta' },
      components: [
        '@header',
        { name: 'hero', template: 'hero', content: { title: `Welcome to ${name}`, subtitle: 'A site built with Gazetta' } },
        { name: 'intro', template: 'text-block', content: { body: '<p>Edit this content in the CMS at <a href="/admin">/admin</a>.</p>' } },
      ],
    }, null, 2) + '\n',

    'sites/main/pages/404/page.json': JSON.stringify({
      template: 'page-layout',
      content: { title: 'Page Not Found', description: "The page you're looking for doesn't exist." },
    }, null, 2) + '\n',

    'admin/.gitkeep': '',
    '.gitignore': `node_modules/\ndist/\n.env.local\n`,

    'package.json': JSON.stringify({
      name,
      private: true,
      type: 'module',
      engines: { node: '>=22' },
      scripts: { dev: 'gazetta dev' },
      dependencies: { gazetta: '*', react: '^19.0.0', 'react-dom': '^19.0.0', zod: '^4.0.0' },
    }, null, 2) + '\n',
  }

  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(target, path)
    await mkdir(join(fullPath, '..'), { recursive: true })
    await writeFile(fullPath, content)
  }

  const { intro, outro, note, spinner } = await import('@clack/prompts')
  intro(c.bgGreen(c.bold(' gazetta ')))

  note(
    `${c.bold('templates/')}          ${c.dim('4 templates (hero, nav, page-layout, text-block)')}\n` +
    `${c.bold('admin/')}              ${c.dim('custom editors and fields')}\n` +
    `${c.bold('sites/main/')}         ${c.dim('site content')}\n` +
    `  ${c.dim('pages/home/')}       ${c.dim('home page with hero + intro')}\n` +
    `  ${c.dim('pages/404/')}        ${c.dim('error page')}\n` +
    `  ${c.dim('fragments/header/')} ${c.dim('shared header nav')}\n` +
    `  ${c.dim('site.yaml')}         ${c.dim('site config + local target')}\n` +
    `${c.bold('package.json')}`,
    `Created ${c.green(name)}/`
  )

  // Run npm install
  const s = spinner()
  s.start('Installing dependencies')
  try {
    const { execSync } = await import('node:child_process')
    execSync('npm install', { cwd: target, stdio: 'pipe' })
    s.stop('Dependencies installed')
  } catch {
    s.stop('npm install failed — run it manually')
  }

  const cdStep = dir !== '.' ? `cd ${dir} && ` : ''
  outro(`Done! Run: ${c.cyan(`${cdStep}npx gazetta dev`)}`)
}

async function runPublish(siteDir: string, targetName?: string) {
  const storage = createFilesystemProvider()
  const projectRoot = detectProjectRoot(siteDir)
  const templatesDir = join(projectRoot, 'templates')

  const site = await loadSite({ siteDir, storage, templatesDir })

  // Load target configs from site.yaml
  const siteYamlPath = join(siteDir, 'site.yaml')
  if (!existsSync(siteYamlPath)) {
    console.error(`\n  ${c.red('Error:')} No site.yaml found at ${siteDir}\n`)
    process.exit(1)
  }
  const siteYaml = yaml.load(readFileSync(siteYamlPath, 'utf-8')) as import('../types.js').SiteManifest
  if (!siteYaml.targets || Object.keys(siteYaml.targets).length === 0) {
    console.error(`\n  Error: no targets configured in ${siteYamlPath}`)
    console.error(`\n  Add a target to site.yaml:\n`)
    console.error(`    targets:`)
    console.error(`      staging:`)
    console.error(`        storage: { type: filesystem, path: ./dist/staging }\n`)
    process.exit(1)
  }

  // Determine which targets to publish to
  const targetNames = targetName ? [targetName] : Object.keys(siteYaml.targets)
  for (const name of targetNames) {
    if (!siteYaml.targets[name]) {
      console.error(`\n  Error: Unknown target "${name}". Available: ${Object.keys(siteYaml.targets).join(', ')}\n`)
      process.exit(1)
    }
  }

  // Initialize targets
  const { createTargetRegistry } = await import('../targets.js')
  const targets = await createTargetRegistry(
    Object.fromEntries(targetNames.map(n => [n, siteYaml.targets![n]])),
    siteDir
  )

  const { publishPageRendered, publishPageStatic, publishFragmentRendered, publishSiteManifest, publishFragmentIndex } = await import('../publish-rendered.js')
  const { scanTemplates, templateHashesFrom, reportTemplateErrors } = await import('../templates-scan.js')
  const { hashManifest } = await import('../hash.js')

  // Validate + hash templates once for this publish run
  const templateInfos = await scanTemplates(templatesDir, projectRoot)
  const invalid = reportTemplateErrors(templateInfos)
  if (invalid > 0) {
    console.error(`\n  ${c.red('✗')} Refusing to publish with invalid templates.`)
    process.exit(1)
  }
  const templateHashes = templateHashesFrom(templateInfos)

  console.log()
  console.log(`  ${c.bgGreen(c.bold(' gazetta '))} ${c.green('publish')} ${c.dim(site.manifest.name)}`)
  console.log()
  console.log(`  ${c.dim('┃')} Pages      ${c.dim([...site.pages.keys()].join(', '))}`)
  console.log(`  ${c.dim('┃')} Fragments  ${c.dim([...site.fragments.keys()].join(', '))}`)
  console.log(`  ${c.dim('┃')} Targets    ${targetNames.join(', ')}`)
  console.log()

  for (const name of targetNames) {
    const targetStorage = targets.get(name)
    if (!targetStorage) {
      console.error(`  ${name}: SKIPPED (failed to initialize)`)
      continue
    }

    const targetConfig = siteYaml.targets![name]
    const { getPublishMode } = await import('../types.js')
    const publishMode = targetConfig ? getPublishMode(targetConfig) : 'static'
    const isStatic = publishMode === 'static'
    console.log(`  ${c.bold(name)} ${c.dim(`(${publishMode})`)}`)
    let totalFiles = 0
    let totalRemoved = 0

    if (isStatic) {
      // Static mode — fully assembled HTML, no fragments needed separately
      for (const [pageName, page] of site.pages) {
        const manifestHash = hashManifest(page, { templateHashes })
        const { files } = await publishPageStatic(pageName, storage, siteDir, targetStorage, templatesDir, manifestHash)
        totalFiles += files
        console.log(`    ${c.green('✓')} ${pageName}`)
      }
    } else {
      // ESI mode — fragments separate, pages with placeholders
      for (const [fragName, frag] of site.fragments) {
        const manifestHash = hashManifest(frag, { templateHashes })
        const { files, removed } = await publishFragmentRendered(fragName, storage, siteDir, targetStorage, templatesDir, manifestHash)
        totalFiles += files
        totalRemoved += removed
        console.log(`    ${c.green('✓')} @${fragName}`)
      }
      for (const [pageName, page] of site.pages) {
        const manifestHash = hashManifest(page, { templateHashes })
        const { files, removed } = await publishPageRendered(pageName, storage, siteDir, targetStorage, targetConfig?.cache, templatesDir, manifestHash)
        totalFiles += files
        totalRemoved += removed
        console.log(`    ${c.green('✓')} ${pageName}`)
      }
    }

    // Site manifest + fragment index
    await publishSiteManifest(storage, siteDir, targetStorage)
    await publishFragmentIndex(storage, siteDir, targetStorage)
    totalFiles += 2

    const removedMsg = totalRemoved > 0 ? c.dim(` (${totalRemoved} old files cleaned)`) : ''
    console.log(`\n  ${c.green('✓')} ${c.bold(name)}: ${totalFiles} files published${removedMsg}\n`)
  }

  // Purge CDN cache per target
  const { resolveEnvVars } = await import('../targets.js')
  for (const [name, config] of Object.entries(siteYaml.targets ?? {})) {
    const purge = config.cache?.purge
    if (!purge) continue
    if (purge.type === 'cloudflare') {
      const apiToken = resolveEnvVars(purge.apiToken)
      if (!apiToken) { console.log(`  ${name}: purge.apiToken not set, skipping cache purge`); continue }
      try {
        const { lookupCloudflareZoneId } = await import('../publish-rendered.js')
        const zoneId = resolveEnvVars(purge.zoneId) ?? (config.siteUrl ? await lookupCloudflareZoneId(config.siteUrl, apiToken) : null)
        if (!zoneId) { console.log(`  ${name}: zone not found, set purge.zoneId or siteUrl`); continue }
        const { createCloudflarePurge } = await import('../publish-rendered.js')
        await createCloudflarePurge(zoneId, apiToken).purgeAll()
        console.log(`  ${name}: cache purged`)
      } catch (err) {
        console.warn(`  ${name}: cache purge failed: ${(err as Error).message}`)
      }
    }
  }

  console.log(`  Done!\n`)
}

async function runBuild(siteDir: string) {
  const projectRoot = detectProjectRoot(siteDir)
  const outDir = join(projectRoot, 'dist', 'admin')

  console.log()
  console.log(`  ${c.bgGreen(c.bold(' gazetta '))} ${c.green('build')}`)
  console.log()

  // Find the admin source (monorepo) or pre-built admin (npm package)
  const cmsWebDir = findCmsDir()
  const cmsStaticDir = findCmsStaticDir()

  if (cmsWebDir) {
    // Monorepo — build from source via Vite
    console.log(`  ${c.dim('┃')} Admin source  ${c.dim(cmsWebDir)}`)
    console.log(`  ${c.dim('┃')} Output        ${c.dim(outDir)}`)
    console.log()

    const { build } = await import('vite')
    await build({
      configFile: join(cmsWebDir, 'vite.config.ts'),
      root: cmsWebDir,
      base: '/admin/',
      build: {
        outDir,
        emptyOutDir: true,
        chunkSizeWarningLimit: 2000,
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-react': ['react', 'react-dom', 'react-dom/client'],
              'vendor-editor': ['@rjsf/core', '@rjsf/utils', '@rjsf/validator-ajv8', '@hello-pangea/dnd'],
              'vendor-tiptap': ['@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-link', '@tiptap/extension-placeholder'],
            },
          },
          onwarn(warning, defaultHandler) {
            if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
            if (warning.code === 'PLUGIN_WARNING' && warning.message?.includes('dynamically imported')) return
            defaultHandler(warning)
          },
        },
      },
      logLevel: 'warn',
    })

    console.log(`  ${c.green('✓')} Admin UI built to ${c.dim(outDir)}`)
  } else if (cmsStaticDir) {
    // npm package — copy pre-built admin
    const { cp } = await import('node:fs/promises')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(outDir, { recursive: true })
    await cp(cmsStaticDir, outDir, { recursive: true })
    console.log(`  ${c.green('✓')} Admin UI copied to ${c.dim(outDir)}`)
  } else {
    console.error(`  ${c.red('Error:')} admin UI source not found`)
    console.error(`  ${c.dim('Run from monorepo or install gazetta from npm')}`)
    process.exit(1)
  }

  // Bundle custom editors and fields with esbuild + shared import map
  const adminDir = join(projectRoot, 'admin')
  const editorsDir = join(adminDir, 'editors')
  const fieldsDir = join(adminDir, 'fields')

  const entryExtensions = ['.ts', '.tsx', '.jsx']
  const hasEditors = existsSync(editorsDir) && (await import('node:fs')).readdirSync(editorsDir).some(f => entryExtensions.some(ext => f.endsWith(ext)))
  const hasFields = existsSync(fieldsDir) && (await import('node:fs')).readdirSync(fieldsDir).some(f => entryExtensions.some(ext => f.endsWith(ext)))

  if (hasEditors || hasFields) {
    const { build: esbuild } = await import('esbuild')
    const { writeFile: writeFileAsync, mkdir: mkdirAsync } = await import('node:fs/promises')
    const sharedDir = join(outDir, '_shared')
    await mkdirAsync(sharedDir, { recursive: true })

    // Build shared dependency bundles (one copy of React, etc.)
    const sharedDeps: Record<string, string> = {
      'react': 'export * from "react"; import React from "react"; export default React;',
      'react-dom/client': 'export * from "react-dom/client";',
      'react/jsx-runtime': 'export * from "react/jsx-runtime";',
      'gazetta/editor': 'export * from "gazetta/editor";',
      'gazetta/types': 'export * from "gazetta/types";',
    }

    const importMap: Record<string, string> = {}
    for (const [specifier, stub] of Object.entries(sharedDeps)) {
      const safeName = specifier.replace(/\//g, '_')
      const stubFile = join(sharedDir, `_stub_${safeName}.js`)
      await writeFileAsync(stubFile, stub)
      const outfile = join(sharedDir, `${safeName}.js`)
      try {
        await esbuild({
          entryPoints: [stubFile],
          outfile,
          bundle: true,
          format: 'esm',
          platform: 'browser',
          target: 'es2022',
          minify: true,
          define: { 'process.env.NODE_ENV': '"production"' },
          logLevel: 'warning',
        })
        importMap[specifier] = `/admin/_shared/${safeName}.js`
      } catch { /* skip — dep may not be installed */ }
      await import('node:fs/promises').then(fs => fs.rm(stubFile, { force: true }))
    }

    console.log(`  ${c.green('✓')} Shared deps: ${Object.keys(importMap).join(', ')}`)

    // Bundle each custom editor/field with shared deps externalized
    const externals = Object.keys(importMap)
    let bundledCount = 0

    for (const [kind, srcDir] of [['editors', editorsDir], ['fields', fieldsDir]] as const) {
      if (!existsSync(srcDir)) continue
      const { readdirSync } = await import('node:fs')
      const files = readdirSync(srcDir).filter(f => entryExtensions.some(ext => f.endsWith(ext)) && !f.startsWith('.') && !f.startsWith('_'))

      for (const file of files) {
        const name = file.replace(/\.(ts|tsx|jsx)$/, '')
        const entryPoint = join(srcDir, file)
        const outfile = join(outDir, kind, `${name}.js`)
        await esbuild({
          entryPoints: [entryPoint],
          outfile,
          bundle: true,
          format: 'esm',
          platform: 'browser',
          target: 'es2022',
          minify: true,
          external: externals,
          define: { 'process.env.NODE_ENV': '"production"' },
          logLevel: 'warning',
        })
        bundledCount++
        console.log(`  ${c.green('✓')} ${kind}/${name}.js`)
      }
    }

    // Inject import map into index.html
    const indexPath = join(outDir, 'index.html')
    if (existsSync(indexPath)) {
      let html = readFileSync(indexPath, 'utf-8')
      const mapScript = `<script type="importmap">\n${JSON.stringify({ imports: importMap }, null, 2)}\n</script>`
      html = html.replace('<head>', `<head>\n${mapScript}`)
      await writeFileAsync(indexPath, html)
      console.log(`  ${c.green('✓')} Import map injected into index.html`)
    }

    console.log(`\n  ${bundledCount} custom ${bundledCount === 1 ? 'module' : 'modules'} bundled`)
  }

  console.log()
}

async function runAdmin(siteDir: string, port: number) {
  const projectRoot = detectProjectRoot(siteDir)
  const templatesDir = join(projectRoot, 'templates')
  const adminDir = join(projectRoot, 'admin')
  const builtAdminDir = join(projectRoot, 'dist', 'admin')

  if (!existsSync(join(builtAdminDir, 'index.html'))) {
    console.error(`\n  ${c.red('Error:')} admin UI not built`)
    console.error(`  Run ${c.cyan('gazetta build')} first\n`)
    process.exit(1)
  }

  const app = new Hono()
  app.get('/__reload', (ctx) => ctx.body(null, 204))

  const fsStorage = createFilesystemProvider()
  await setupProductionMode(app, siteDir, fsStorage, builtAdminDir, templatesDir, adminDir)

  // SPA fallback for non-API admin routes
  app.get('*', (ctx) => {
    const indexPath = join(builtAdminDir, 'index.html')
    if (existsSync(indexPath)) return ctx.html(readFileSync(indexPath, 'utf-8'))
    return ctx.notFound()
  })

  const siteYaml = yaml.load(readFileSync(join(siteDir, 'site.yaml'), 'utf-8')) as SiteManifest

  const server = serve({ fetch: app.fetch, port }, () => {
    console.log()
    console.log(`  ${c.bgGreen(c.bold(' gazetta '))} ${c.green('admin')} ${c.dim(siteYaml.name)}`)
    console.log()
    console.log(`  ${c.dim('┃')} Admin    ${c.cyan(`http://localhost:${port}/admin`)}`)
    console.log()
  })

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => { console.log(`\n  Shutting down...`); server.close(() => process.exit(0)) })
  }
}

async function runServe(siteDir: string, port: number, targetName?: string) {
  const siteYamlPath = join(siteDir, 'site.yaml')
  if (!existsSync(siteYamlPath)) {
    console.error(`\n  Error: ${siteYamlPath} not found\n`)
    process.exit(1)
  }

  const siteYaml = yaml.load(readFileSync(siteYamlPath, 'utf-8')) as import('../types.js').SiteManifest
  if (!siteYaml.targets || Object.keys(siteYaml.targets).length === 0) {
    console.error('\n  Error: no targets configured in site.yaml\n')
    process.exit(1)
  }

  const name = targetName ?? Object.keys(siteYaml.targets)[0]
  const config = siteYaml.targets[name]
  if (!config) {
    console.error(`\n  Error: target "${name}" not found in site.yaml\n`)
    process.exit(1)
  }

  const { createStorageProvider } = await import('../targets.js')
  const storage = await createStorageProvider(config.storage, siteDir)
  const { getPublishMode } = await import('../types.js')
  const { createServer } = await import('../serve.js')
  const app = createServer({ storage, mode: getPublishMode(config) })

  const server = serve({ fetch: app.fetch, port }, () => {
    console.log()
    console.log(`  ${c.bgGreen(c.bold(' gazetta '))} ${c.green('serve')} ${c.dim(siteYaml.name)} ${c.dim(`(${name})`)}`)
    console.log()
    console.log(`  ${c.dim('┃')} Local    ${c.cyan(`http://localhost:${port}/`)}`)
    console.log()
  })

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      console.log(`\n  Shutting down...`)
      server.close(() => process.exit(0))
    })
  }
}

async function runDeploy(siteDir: string, targetName?: string) {
  const { execSync } = await import('node:child_process')
  const { writeFile, mkdir, rm } = await import('node:fs/promises')

  const siteYamlPath = join(siteDir, 'site.yaml')
  if (!existsSync(siteYamlPath)) {
    console.error(`\n  Error: No site.yaml found at ${siteDir}\n`)
    process.exit(1)
  }
  const siteYaml = yaml.load(readFileSync(siteYamlPath, 'utf-8')) as import('../types.js').SiteManifest
  if (!siteYaml.targets) {
    console.error(`\n  Error: No targets configured in site.yaml\n`)
    process.exit(1)
  }
  if (!targetName) {
    console.error(`\n  ${c.red('Error:')} target is required for deploy\n  Usage: gazetta deploy <target-name>\n`)
    process.exit(1)
  }
  const target = siteYaml.targets[targetName]
  if (!target) {
    console.error(`\n  Error: Unknown target "${targetName}". Available: ${Object.keys(siteYaml.targets).join(', ')}\n`)
    process.exit(1)
  }
  if (!target.worker) {
    console.error(`\n  Error: Target "${targetName}" has no worker config. Add to site.yaml:\n\n  worker:\n    type: cloudflare\n    name: my-site\n`)
    process.exit(1)
  }
  if (target.worker.type !== 'cloudflare') {
    console.error(`\n  Error: Unsupported worker type "${target.worker.type}". Currently only "cloudflare" is supported.\n`)
    process.exit(1)
  }

  // Generate worker in temp dir
  const workerName = target.worker.name ?? targetName
  const bucketName = target.storage.bucket ?? workerName
  const tmpDir = join(siteDir, '.gazetta-deploy')
  await rm(tmpDir, { recursive: true, force: true })
  await mkdir(tmpDir, { recursive: true })

  // Generate wrangler.toml
  let wranglerToml = `name = "${workerName}"\nmain = "index.ts"\ncompatibility_date = "2024-12-01"\nworkers_dev = true\n\n[[r2_buckets]]\nbinding = "SITE_BUCKET"\nbucket_name = "${bucketName}"\n`

  // Add custom domain route if siteUrl is configured
  if (target.siteUrl) {
    const url = new URL(target.siteUrl)
    const hostname = url.hostname
    wranglerToml += `\n[[routes]]\npattern = "${hostname}/*"\nzone_name = "${hostname}"\n`
  }

  await writeFile(join(tmpDir, 'wrangler.toml'), wranglerToml)

  // Generate worker entry point
  const workerCode = `import { createWorker } from 'gazetta/workers/cloudflare-r2'\nexport default createWorker()\n`
  await writeFile(join(tmpDir, 'index.ts'), workerCode)

  // Generate package.json for wrangler
  const pkgJson = JSON.stringify({
    type: 'module',
    dependencies: { gazetta: '*', hono: '*' },
  })
  await writeFile(join(tmpDir, 'package.json'), pkgJson)

  // Install deps and deploy
  console.log(`  Deploying worker "${workerName}" to Cloudflare...`)
  try {
    execSync('npm install --install-links ' + resolve(import.meta.dirname, '../..'), { cwd: tmpDir, stdio: 'pipe' })
    const output = execSync('npx wrangler deploy', { cwd: tmpDir, stdio: 'pipe' }).toString()
    const urlMatch = output.match(/https:\/\/[^\s]+/)
    console.log(`  Worker deployed: ${urlMatch?.[0] ?? workerName}`)
    if (target.siteUrl) console.log(`  Site: ${target.siteUrl}`)
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? (err as Error).message
    console.error(`\n  Deploy failed: ${stderr}\n`)
    process.exit(1)
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }

  console.log(`\n  ${c.green('✓')} Worker deployed. Now publish content:\n    ${c.cyan(`gazetta publish ${targetName}`)}\n`)
}

async function runValidate(siteDir: string) {
  const storage = createFilesystemProvider()
  const projectRoot = detectProjectRoot(siteDir)
  const templatesDir = join(projectRoot, 'templates')

  console.log()
  console.log(`  ${c.bgGreen(c.bold(' gazetta '))} ${c.green('validate')} ${c.dim(siteDir)}`)
  console.log()

  // 1. Check site.yaml
  let site: Awaited<ReturnType<typeof loadSite>>
  try {
    site = await loadSite({ siteDir, storage, templatesDir })
    console.log(`  ${c.green('✓')} site.yaml ${c.dim(`— ${site.manifest.name}`)}`)
  } catch (err) {
    console.error(`  ${c.red('✗')} site.yaml ${c.dim(`— ${(err as Error).message}`)}`)
    process.exit(1)
  }

  let errors = 0

  // 2. Validate all fragments
  for (const [fragName, frag] of site.fragments) {
    try {
      const { resolveComponent } = await import('../resolver.js')
      const ctx = { site, templatesDir: site.templatesDir, visited: new Set<string>(), path: [`@${fragName}`] }
      await resolveComponent(`@${fragName}`, ctx)

      const childCount = frag.components?.length ?? 0
      console.log(`  ${c.green('✓')} @${fragName} ${c.dim(`(${childCount} components)`)}`)
    } catch (err) {
      console.error(`  ${c.red('✗')} @${fragName} ${c.dim(`— ${(err as Error).message}`)}`)
      errors++
    }
  }

  // 3. Validate all pages
  for (const [pageName, page] of site.pages) {
    try {
      await resolvePage(pageName, site)

      const componentCount = page.components?.length ?? 0
      const fragmentCount = page.components?.filter(cc => typeof cc === 'string' && cc.startsWith('@')).length ?? 0
      console.log(`  ${c.green('✓')} ${pageName} ${c.dim(`(${componentCount} components, ${fragmentCount} fragments)`)}`)
    } catch (err) {
      console.error(`  ${c.red('✗')} ${pageName} ${c.dim(`— ${(err as Error).message}`)}`)
      errors++
    }
  }

  // 4. List templates
  let templateNames: string[] = []
  try {
    const entries = await storage.readDir(templatesDir)
    templateNames = entries.filter(e => e.isDirectory).map(e => e.name)
    console.log(`  ${c.green('✓')} ${c.dim(`${templateNames.length} templates`)}`)
  } catch {
    console.log(`  ${c.yellow('⚠')} ${c.dim('templates/ directory not found')}`)
  }

  // 5. Check for orphaned editors (editor exists but template doesn't)
  const adminDir = join(projectRoot, 'admin')
  const editorsDir = join(adminDir, 'editors')
  if (existsSync(editorsDir)) {
    const editorFiles = (await import('node:fs')).readdirSync(editorsDir).filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))
    for (const file of editorFiles) {
      const editorName = file.replace(/\.(ts|tsx)$/, '')
      if (!templateNames.includes(editorName)) {
        console.log(`  ${c.yellow('⚠')} orphaned editor: ${c.dim(`admin/editors/${file}`)} ${c.dim('— no matching template')}`)
      }
    }
  }

  // 6. Check for missing custom fields (schema references field but file doesn't exist)
  const fieldsDir = join(adminDir, 'fields')
  const fieldFiles = existsSync(fieldsDir) ? (await import('node:fs')).readdirSync(fieldsDir).filter(f => f.endsWith('.ts') || f.endsWith('.tsx')).map(f => f.replace(/\.(ts|tsx)$/, '')) : []
  const { loadTemplate } = await import('../template-loader.js')
  const zod = await import('zod')
  for (const tplName of templateNames) {
    try {
      const loaded = await loadTemplate(storage, templatesDir, tplName)
      const jsonSchema = zod.z.toJSONSchema(loaded.schema as import('zod').ZodType) as Record<string, unknown>
      const props = jsonSchema.properties as Record<string, Record<string, unknown>> | undefined
      if (!props) continue
      for (const [propName, prop] of Object.entries(props)) {
        const fieldRef = prop.field as string | undefined
        if (fieldRef && !fieldFiles.includes(fieldRef)) {
          console.error(`  ${c.red('✗')} template ${tplName}.${propName} references field "${fieldRef}" ${c.dim('— not found in admin/fields/')}`)
          errors++
        }
      }
    } catch { /* template load errors already caught above */ }
  }

  console.log()
  if (errors > 0) {
    console.error(`  ${errors} error${errors > 1 ? 's' : ''} found.\n`)
    process.exit(1)
  } else {
    console.log(`  All good.\n`)
  }
}

function renderErrorOverlay(err: Error): string {
  const message = err.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const stack = (err.stack ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Extract file path from error message or stack
  const fileMatch = stack.match(/\(?(\/[^\s:)]+):(\d+)/)
  const filePath = fileMatch ? fileMatch[1] : ''
  const lineNum = fileMatch ? fileMatch[2] : ''
  const location = filePath ? `${filePath}${lineNum ? `:${lineNum}` : ''}` : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Error — Gazetta</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #1a1a2e; color: #e4e4e7; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .overlay { max-width: 48rem; width: 100%; margin: 2rem; }
    .header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem; }
    .header svg { flex-shrink: 0; }
    .header h1 { font-size: 1.25rem; font-weight: 600; color: #f87171; }
    .message { background: #0f0f1a; border: 1px solid #27272a; border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem; font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.875rem; line-height: 1.7; white-space: pre-wrap; word-break: break-word; color: #fca5a5; }
    .location { font-size: 0.8125rem; color: #71717a; margin-bottom: 1rem; }
    .location span { color: #a78bfa; }
    .stack { background: #0f0f1a; border: 1px solid #27272a; border-radius: 8px; padding: 1.5rem; font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.75rem; line-height: 1.7; white-space: pre-wrap; word-break: break-word; color: #52525b; max-height: 20rem; overflow: auto; }
    .hint { margin-top: 1.5rem; font-size: 0.8125rem; color: #52525b; }
  </style>
</head>
<body>
  <div class="overlay">
    <div class="header">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <h1>Template Error</h1>
    </div>
    ${location ? `<div class="location">File: <span>${location}</span></div>` : ''}
    <div class="message">${message}</div>
    <details>
      <summary style="color:#52525b;font-size:0.8125rem;cursor:pointer;margin-bottom:0.5rem">Stack trace</summary>
      <div class="stack">${stack}</div>
    </details>
    <div class="hint">Fix the error and save — the page will reload automatically.</div>
  </div>
  <script>new EventSource('/__reload').onmessage = () => location.reload()</script>
</body>
</html>`
}

async function runDev(siteDir: string, port: number) {
  const storage = createFilesystemProvider()
  const projectRoot = detectProjectRoot(siteDir)
  const templatesDir = join(projectRoot, 'templates')
  const adminDir = join(projectRoot, 'admin')

  const site = await loadSite({ siteDir, storage, templatesDir })

  const app = new Hono()

  // ---- Live reload (SSE) ----
  let reloadId = 0
  const reloadListeners = new Set<() => void>()
  function notifyReload() { reloadId++; for (const l of reloadListeners) l() }

  const RELOAD_SCRIPT = `<script>new EventSource('/__reload').onmessage = () => location.reload()</script>`

  app.get('/__reload', (c) => {
    return streamSSE(c, async (stream) => {
      let lastId = reloadId
      const check = async () => {
        if (reloadId !== lastId) { lastId = reloadId; await stream.writeSSE({ data: 'reload', event: 'message' }) }
      }
      reloadListeners.add(check)
      stream.onAbort(() => { reloadListeners.delete(check) })
      while (true) { await stream.sleep(500); await check() }
    })
  })

  // ---- Site page routes ----
  for (const [pageName, page] of site.pages) {
    app.get(page.route, async (c) => {
      try {
        const freshSite = await loadSite({ siteDir, storage, templatesDir })
        const resolved = await resolvePage(pageName, freshSite)
        const html = await renderPage(resolved, c.req.param())
        return c.html(html.replace('</body>', `${RELOAD_SCRIPT}\n</body>`))
      } catch (err) {
        return c.html(renderErrorOverlay(err as Error), 500)
      }
    })
  }

  // ---- Detect mode: dev (monorepo with apps/admin source) vs production (pre-built) ----
  const cmsWebDir = findCmsDir()
  const cmsStaticDir = findCmsStaticDir()
  const isDevMode = cmsWebDir !== null

  if (isDevMode) {
    // Dev mode: mount CMS API inline (same process = shared template cache)
    await setupCmsApi(app, siteDir, storage, templatesDir, adminDir)
  } else if (cmsStaticDir) {
    // Production mode: inline CMS API + static files
    await setupProductionMode(app, siteDir, storage, cmsStaticDir, templatesDir, adminDir)
  }

  // ---- 404 ----
  app.notFound((c) => {
    const routes = [...site.pages.entries()].map(([n, p]) => `  ${p.route} → ${n}`).join('\n')
    return c.html(`<pre style="padding:2rem">Page not found: ${c.req.path}\n\nAvailable:\n${routes}\n  /admin → CMS editor</pre>`, 404)
  })

  // ---- Start server ----
  const startTime = performance.now()
  const nodeServer = serve({ fetch: app.fetch, port }, async () => {
    const elapsed = Math.round(performance.now() - startTime)
    console.log()
    console.log(`  ${c.bgGreen(c.bold(' gazetta '))} ${c.green(site.manifest.name)} ${c.dim(`ready in ${elapsed} ms`)}`)
    console.log()
    console.log(`  ${c.dim('┃')} Local    ${c.cyan(`http://localhost:${port}/`)}`)
    if (isDevMode) {
      console.log(`  ${c.dim('┃')} CMS      ${c.cyan(`http://localhost:${port}/admin`)}`)
      console.log(`  ${c.dim('┃')} Dev      ${c.cyan(`http://localhost:${port}/admin/dev`)}`)
    }
    console.log()
    console.log(`  ${c.dim('┃')} Pages    ${[...site.pages.entries()].map(([n, p]) => `${c.dim(p.route)} ${c.dim('→')} ${n}`).join(c.dim(', '))}`)
    console.log(`  ${c.dim('┃')} Frags    ${c.dim([...site.fragments.keys()].join(', ') || '(none)')}`)

    if (isDevMode && cmsWebDir) {
      try {
        const { createServer: createViteServer } = await import('vite')
        const { searchForWorkspaceRoot } = await import('vite')
        const vite = await createViteServer({
          configFile: join(cmsWebDir, 'vite.config.ts'),
          root: cmsWebDir,
          base: '/admin/',
          resolve: {
            alias: {
              '@editors': join(adminDir, 'editors'),
              '@fields': join(adminDir, 'fields'),
            },
          },
          server: {
            middlewareMode: true,
            hmr: { server: nodeServer as unknown as import('node:http').Server },
            fs: { allow: [searchForWorkspaceRoot(cmsWebDir), siteDir] },
          },
        })

        const httpServer = nodeServer as unknown as import('node:http').Server
        const originalListeners = httpServer.listeners('request').slice()
        httpServer.removeAllListeners('request')

        const honoHandler = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
          for (const listener of originalListeners) {
            (listener as (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void)(req, res)
          }
        }

        httpServer.on('request', (req, res) => {
          const url = req.url ?? ''
          if (url.startsWith('/admin/api') || url.startsWith('/admin/preview')) {
            honoHandler(req, res)
          } else if (url.startsWith('/admin') || url.startsWith('/@')) {
            vite.middlewares(req, res, () => honoHandler(req, res))
          } else {
            honoHandler(req, res)
          }
        })

      } catch (err) {
        console.warn(`  Warning: CMS UI failed to start: ${(err as Error).message}`)
      }
    }
    console.log()
  })

  // ---- File watching ----
  // Watch site dir for content changes (JSON manifests + site.yaml config)
  watch(siteDir, { recursive: true }, (_event, filename) => {
    if (!filename) return
    if (filename.endsWith('.json') || filename.endsWith('.yaml')) {
      console.log(`  Manifest changed: ${filename}`)
      invalidateAllTemplates()
      notifyReload()
    }
  })

  // Watch templates dir for template source changes
  if (existsSync(templatesDir)) {
    watch(templatesDir, { recursive: true }, (_event, filename) => {
      if (!filename) return
      if (filename.endsWith('.ts') || filename.endsWith('.tsx')) {
        const parts = filename.split('/')
        if (parts.length >= 1) {
          console.log(`  Template changed: ${parts[0]}`)
          invalidateTemplate(parts[0])
          notifyReload()
        }
      }
    })
  }
}

// ---- Mount CMS API on the main Hono app (shared process = shared template cache) ----
async function setupCmsApi(app: Hono, siteDir: string, storage: ReturnType<typeof createFilesystemProvider>, templatesDir: string, adminDir: string) {
  const siteYamlPath = join(siteDir, 'site.yaml')
  let targetConfigs: Record<string, import('../types.js').TargetConfig> | undefined
  if (existsSync(siteYamlPath)) {
    const siteYaml = yaml.load(readFileSync(siteYamlPath, 'utf-8')) as SiteManifest
    targetConfigs = siteYaml.targets
  }
  const cmsApp = createAdminApp({ siteDir, storage, templatesDir, adminDir, targetConfigs })
  app.route('/admin', cmsApp)
}

// ---- Production mode: inline CMS API + static files from admin-dist/ ----
async function setupProductionMode(app: Hono, siteDir: string, storage: ReturnType<typeof createFilesystemProvider>, cmsStaticDir: string, templatesDir: string, adminDir: string) {
  // Read target configs from site.yaml — targets are initialized lazily on first publish/fetch
  const siteYamlPath = join(siteDir, 'site.yaml')
  let targetConfigs: Record<string, import('../types.js').TargetConfig> | undefined
  if (existsSync(siteYamlPath)) {
    const siteYaml = yaml.load(readFileSync(siteYamlPath, 'utf-8')) as SiteManifest
    targetConfigs = siteYaml.targets
  }

  // Mount CMS API inline at /admin (production mode — bundled editors/fields)
  const cmsApp = createAdminApp({ siteDir, storage, templatesDir, adminDir, production: true, targetConfigs })
  app.route('/admin', cmsApp)

  // Serve pre-built CMS static files (includes bundled editors/fields)
  app.use('/admin/*', serveStatic({
    root: cmsStaticDir,
    rewriteRequestPath: (path) => path.replace(/^\/admin/, ''),
  }))

  // SPA fallback: serve index.html for unmatched /admin routes
  app.get('/admin/*', (c) => {
    const indexPath = join(cmsStaticDir, 'index.html')
    if (existsSync(indexPath)) {
      return c.html(readFileSync(indexPath, 'utf-8'))
    }
    return c.text('CMS admin UI not found', 404)
  })
  app.get('/admin', (c) => {
    const indexPath = join(cmsStaticDir, 'index.html')
    if (existsSync(indexPath)) {
      return c.html(readFileSync(indexPath, 'utf-8'))
    }
    return c.text('CMS admin UI not found', 404)
  })
}

/** Find apps/admin source dir (monorepo dev mode) */
function findCmsDir(): string | null {
  const candidates = [
    resolve('apps/admin'),
    resolve(import.meta.dirname, '../../../../apps/admin'),
    resolve(import.meta.dirname, '../../../apps/admin'),
  ]
  for (const dir of candidates) {
    if (existsSync(join(dir, 'src/server/dev.ts'))) return dir
  }
  return null
}

/** Find pre-built CMS static files (production mode) */
function findCmsStaticDir(): string | null {
  const candidates = [
    resolve(import.meta.dirname, '../../admin-dist'),
    resolve(import.meta.dirname, '../../../admin-dist'),
  ]
  for (const dir of candidates) {
    if (existsSync(join(dir, 'index.html'))) return dir
  }
  return null
}


async function main() {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp()
    process.exit(0)
  }

  const parsed = parseArgs(args.slice(1))

  // Commands that take [target] [site] positional args
  const targetFirstCommands = new Set(['publish', 'serve', 'deploy'])
  // Commands that take [site] positional arg
  const siteOnlyCommands = new Set(['dev', 'validate', 'admin'])

  let siteDir: string
  let targetName: string | undefined

  if (command === 'init') {
    await runInit(parsed.positional[0] ?? '.')
    return
  } else if (command === 'build') {
    const siteDir = await resolveSiteDir(parsed.positional[0])
    await runBuild(siteDir)
    return
  } else if (targetFirstCommands.has(command)) {
    // gazetta publish [target] [site]
    const [first, second] = parsed.positional
    // If first arg looks like a site path (contains / or has site.yaml), it's the site
    const firstIsSite = first && (first.includes('/') || existsSync(join(resolve(first), 'site.yaml')))
    if (firstIsSite) {
      siteDir = await resolveSiteDir(first)
      targetName = await resolveTarget(undefined, siteDir)
    } else {
      siteDir = await resolveSiteDir(second)
      targetName = await resolveTarget(first, siteDir)
    }
  } else if (siteOnlyCommands.has(command)) {
    siteDir = await resolveSiteDir(parsed.positional[0])
  } else {
    console.error(`  Unknown command: ${command}\n`)
    printHelp()
    process.exit(1)
    return
  }

  // Load .env from project root and site dir (skipped in CI)
  if (!process.env.CI) {
    const projectRoot = detectProjectRoot(siteDir)
    const envDirs = projectRoot !== siteDir ? [projectRoot, siteDir] : [siteDir]
    for (const dir of envDirs) {
      for (const name of ['.env', '.env.local']) {
        const envPath = join(dir, name)
        if (existsSync(envPath)) {
          for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
            const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
            if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
          }
        }
      }
    }
  }

  switch (command) {
    case 'publish':
      await runPublish(siteDir, targetName)
      break
    case 'serve':
      await runServe(siteDir, parsed.port ?? 3000, targetName)
      break
    case 'deploy':
      await runDeploy(siteDir, targetName)
      break
    case 'validate':
      await runValidate(siteDir)
      break
    case 'dev':
      await runDev(siteDir, parsed.port ?? 3000)
      break
    case 'admin':
      await runAdmin(siteDir, parsed.port ?? 3000)
      break
  }
}

main().catch((err) => {
  console.error(`\n  Error: ${(err as Error).message}\n`)
  process.exit(1)
})
