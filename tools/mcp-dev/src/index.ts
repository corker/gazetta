import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { chromium, type Browser, type Page } from 'playwright'
import { resolve } from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'

const server = new McpServer({ name: 'dev', version: '0.0.1' })

let browser: Browser | null = null
let page: Page | null = null
const tmpDir = resolve(process.cwd(), '.tmp')

async function getPage(width: number, height: number): Promise<Page> {
  if (!browser) browser = await chromium.launch()
  if (!page || page.isClosed()) {
    page = await browser.newPage({ viewport: { width, height } })
  } else {
    await page.setViewportSize({ width, height })
  }
  return page
}

server.tool(
  'screenshot',
  'Take a screenshot of a URL or local route. Returns the image.',
  {
    url: z.string().describe('Full URL or local path like / or /about'),
    width: z.number().optional().default(1440).describe('Viewport width'),
    height: z.number().optional().default(900).describe('Viewport height'),
    fullPage: z.boolean().optional().default(true).describe('Capture full page'),
  },
  async ({ url, width, height, fullPage }) => {
    const fullUrl = url.startsWith('http') ? url : `http://localhost:3000${url}`
    const p = await getPage(width, height)

    try {
      await p.goto(fullUrl, { waitUntil: 'load' })
      const buffer = await p.screenshot({ fullPage, type: 'jpeg', quality: 80 })

      await mkdir(tmpDir, { recursive: true })
      const filename = `screenshot-${Date.now()}.jpg`
      await writeFile(resolve(tmpDir, filename), buffer)

      return {
        content: [
          { type: 'image' as const, data: buffer.toString('base64'), mimeType: 'image/jpeg' as const },
          { type: 'text' as const, text: `Screenshot saved to .tmp/${filename}` },
        ],
      }
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Screenshot failed: ${(err as Error).message}` }],
      }
    }
  }
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Gazetta dev MCP server running')
}

main().catch((err) => {
  console.error('MCP server error:', err)
  process.exit(1)
})

process.on('SIGINT', async () => {
  if (browser) await browser.close()
  process.exit(0)
})
