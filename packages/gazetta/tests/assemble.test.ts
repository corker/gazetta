import { describe, it, expect } from 'vitest'
import { assembleEsi, parseCacheComment, splitFragment, findEsiPaths } from '../src/assemble.js'

describe('parseCacheComment', () => {
  it('parses cache config from comment', () => {
    const { html, browser, edge } = parseCacheComment('<!--cache:browser=60,edge=3600-->\n<!DOCTYPE html>')
    expect(browser).toBe(60)
    expect(edge).toBe(3600)
    expect(html).toBe('<!DOCTYPE html>')
  })

  it('returns defaults when no comment', () => {
    const { html, browser, edge } = parseCacheComment('<!DOCTYPE html>')
    expect(browser).toBe(0)
    expect(edge).toBe(86400)
    expect(html).toBe('<!DOCTYPE html>')
  })
})

describe('splitFragment', () => {
  it('splits head and body', () => {
    const { head, body } = splitFragment('<head>\n<link rel="stylesheet" href="/x.css">\n</head>\n<nav>hello</nav>')
    expect(head).toContain('stylesheet')
    expect(body).toContain('<nav>hello</nav>')
    expect(body).not.toContain('<head>')
  })

  it('returns all as body when no head', () => {
    const { head, body } = splitFragment('<footer>hi</footer>')
    expect(head).toBe('')
    expect(body).toBe('<footer>hi</footer>')
  })
})

describe('findEsiPaths', () => {
  it('finds all ESI paths', () => {
    const html = `<head>
      <!--esi-head:/fragments/header/index.html-->
      <!--esi-head:/fragments/footer/index.html-->
    </head>
    <body>
      <!--esi:/fragments/header/index.html-->
      <!--esi:/fragments/footer/index.html-->
    </body>`
    const paths = findEsiPaths(html)
    expect(paths).toHaveLength(2)
    expect(paths).toContain('/fragments/header/index.html')
    expect(paths).toContain('/fragments/footer/index.html')
  })

  it('returns empty for no ESI tags', () => {
    expect(findEsiPaths('<html><body>hello</body></html>')).toHaveLength(0)
  })
})

describe('assembleEsi', () => {
  const headerFragment = {
    head: '<link rel="stylesheet" href="/fragments/header/styles.abc.css">',
    body: '<nav>Gazetta</nav>',
  }
  const footerFragment = {
    head: '<link rel="stylesheet" href="/fragments/footer/styles.def.css">',
    body: '<footer>© 2026</footer>',
  }

  it('replaces ESI body tags with fragment body', () => {
    const html = '<body><!--esi:/fragments/header/index.html--><main>content</main><!--esi:/fragments/footer/index.html--></body>'
    const fragments = new Map([
      ['/fragments/header/index.html', headerFragment],
      ['/fragments/footer/index.html', footerFragment],
    ])
    const result = assembleEsi(html, fragments)
    expect(result).toContain('<nav>Gazetta</nav>')
    expect(result).toContain('<footer>© 2026</footer>')
    expect(result).not.toContain('<!--esi:')
  })

  it('collects fragment CSS in head', () => {
    const html = '<head><!--esi-head:/fragments/header/index.html--><!--esi-head:/fragments/footer/index.html--></head><body><!--esi:/fragments/header/index.html--></body>'
    const fragments = new Map([
      ['/fragments/header/index.html', headerFragment],
      ['/fragments/footer/index.html', footerFragment],
    ])
    const result = assembleEsi(html, fragments)
    expect(result).toContain('header/styles.abc.css')
    expect(result).toContain('footer/styles.def.css')
    expect(result).not.toContain('<!--esi-head:')
  })

  it('deduplicates identical head lines', () => {
    const sharedCss = { head: '<link rel="stylesheet" href="/shared.css">', body: '<div>A</div>' }
    const html = '<head><!--esi-head:/a.html--><!--esi-head:/b.html--></head><body><!--esi:/a.html--><!--esi:/b.html--></body>'
    const fragments = new Map([
      ['/a.html', sharedCss],
      ['/b.html', sharedCss],
    ])
    const result = assembleEsi(html, fragments)
    const matches = result.match(/shared\.css/g)
    expect(matches).toHaveLength(1)
  })

  it('puts CSS before JS', () => {
    const frag = {
      head: '<link rel="stylesheet" href="/styles.css">\n<script type="module" src="/script.js"></script>',
      body: '<div>content</div>',
    }
    const html = '<head><!--esi-head:/f.html--></head><body><!--esi:/f.html--></body>'
    const fragments = new Map([['/f.html', frag]])
    const result = assembleEsi(html, fragments)
    const cssPos = result.indexOf('styles.css')
    const jsPos = result.indexOf('script.js')
    expect(cssPos).toBeLessThan(jsPos)
  })

  it('handles missing fragments gracefully', () => {
    const html = '<body><!--esi:/missing/index.html--></body>'
    const result = assembleEsi(html, new Map())
    expect(result).toContain('<!-- fragment not found: /missing/index.html -->')
  })

  it('preserves fragment order', () => {
    const html = '<head><!--esi-head:/a.html--><!--esi-head:/b.html--></head><body><!--esi:/a.html--><!--esi:/b.html--></body>'
    const fragments = new Map([
      ['/a.html', { head: '<link rel="stylesheet" href="/a.css">', body: '<div>A</div>' }],
      ['/b.html', { head: '<link rel="stylesheet" href="/b.css">', body: '<div>B</div>' }],
    ])
    const result = assembleEsi(html, fragments)
    expect(result.indexOf('a.css')).toBeLessThan(result.indexOf('b.css'))
    expect(result.indexOf('<div>A</div>')).toBeLessThan(result.indexOf('<div>B</div>'))
  })
})
