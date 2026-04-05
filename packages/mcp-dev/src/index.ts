import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { chromium, type Browser } from 'playwright'
import { resolve } from 'node:path'

const server = new McpServer({ name: 'dev', version: '0.0.1' })

let browser: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (!browser) browser = await chromium.launch()
  return browser
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
    const b = await getBrowser()
    const page = await b.newPage({ viewport: { width, height } })

    try {
      await page.goto(fullUrl, { waitUntil: 'networkidle' })
      const buffer = await page.screenshot({ fullPage, type: 'png' })

      // Save to .tmp for reference
      const filename = `screenshot-${Date.now()}.png`
      const filepath = resolve(process.cwd(), '.tmp', filename)
      const { writeFile, mkdir } = await import('node:fs/promises')
      await mkdir(resolve(process.cwd(), '.tmp'), { recursive: true })
      await writeFile(filepath, buffer)

      return {
        content: [
          { type: 'image' as const, data: buffer.toString('base64'), mimeType: 'image/png' as const },
          { type: 'text' as const, text: `Screenshot saved to .tmp/${filename}` },
        ],
      }
    } finally {
      await page.close()
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
