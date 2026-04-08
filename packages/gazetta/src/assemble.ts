/**
 * ESI assembly — pure string functions, no I/O, no platform deps.
 * Used by edge workers and Node servers to compose pages from fragments.
 */

/** Parse and strip cache comment from page HTML */
export function parseCacheComment(html: string): { html: string; browser: number; edge: number } {
  const match = html.match(/^<!--cache:browser=(\d+),edge=(\d+)-->\n/)
  if (!match) return { html, browser: 0, edge: 86400 }
  return {
    html: html.slice(match[0].length),
    browser: parseInt(match[1], 10),
    edge: parseInt(match[2], 10),
  }
}

/** Split fragment HTML into head and body sections */
export function splitFragment(html: string): { head: string; body: string } {
  const headStart = html.indexOf('<head>')
  const headEnd = html.indexOf('</head>')

  if (headStart === -1 || headEnd === -1) {
    return { head: '', body: html }
  }

  return {
    head: html.slice(headStart + 6, headEnd).trim(),
    body: (html.slice(0, headStart) + html.slice(headEnd + 7)).trim(),
  }
}

/** Find all ESI paths referenced in the page HTML */
export function findEsiPaths(html: string): string[] {
  const paths = new Set<string>()
  const regex = /<!--esi(?:-head)?:(\/[^>]+)-->/g
  let match
  while ((match = regex.exec(html)) !== null) paths.add(match[1])
  return [...paths]
}

/** Assemble page HTML with fragment head and body content */
export function assembleEsi(
  pageHtml: string,
  fragments: Map<string, { head: string; body: string }>
): string {
  const esiHeadRegex = /<!--esi-head:(\/[^>]+)-->/g
  const esiBodyRegex = /<!--esi:(\/[^>]+)-->/g

  // Collect ESI head order from page
  const esiHeadOrder: string[] = []
  const esiHeadRegex2 = /<!--esi-head:(\/[^>]+)-->/g
  let m
  while ((m = esiHeadRegex2.exec(pageHtml)) !== null) {
    if (!esiHeadOrder.includes(m[1])) esiHeadOrder.push(m[1])
  }

  // Collect CSS and JS separately, preserving fragment order, deduplicating
  const cssLines: string[] = []
  const jsLines: string[] = []
  const otherLines: string[] = []
  const seen = new Set<string>()

  for (const path of esiHeadOrder) {
    const frag = fragments.get(path)
    if (!frag?.head) continue
    for (const line of frag.head.split('\n').map(l => l.trim()).filter(Boolean)) {
      if (seen.has(line)) continue
      seen.add(line)
      if (line.includes('rel="stylesheet"') || line.includes("rel='stylesheet'")) {
        cssLines.push(line)
      } else if (line.startsWith('<script')) {
        jsLines.push(line)
      } else {
        otherLines.push(line)
      }
    }
  }

  // Replace first esi-head with other + CSS, remove the rest
  let html = pageHtml
  const collectedCss = [...otherLines, ...cssLines].join('\n  ')
  let cssInserted = false
  html = html.replace(esiHeadRegex, () => {
    if (!cssInserted && collectedCss) {
      cssInserted = true
      return collectedCss
    }
    return ''
  })

  // Insert JS before </head> (after all CSS, preserving fragment order)
  if (jsLines.length > 0) {
    html = html.replace('</head>', `  ${jsLines.join('\n  ')}\n</head>`)
  }

  // Replace esi body tags with fragment body content
  html = html.replace(esiBodyRegex, (_match, path: string) => {
    const frag = fragments.get(path)
    return frag?.body ?? `<!-- fragment not found: ${path} -->`
  })

  return html
}
