import { z } from 'zod'
import type { TemplateFunction } from 'gazetta'

export const schema = z.object({
  lines: z.array(z.object({
    command: z.string().optional().describe('Command to type (with $ prefix)'),
    output: z.string().optional().describe('Command output (not typed, appears instantly)'),
    delay: z.number().optional().describe('Delay before this line in ms'),
  })).describe('Terminal lines'),
  title: z.string().optional().describe('Window title'),
})

type Content = z.infer<typeof schema>

const template: TemplateFunction<Content> = ({ content }) => {
  const { lines = [], title = 'Terminal' } = content ?? {}
  const id = `term-${Math.random().toString(36).slice(2, 8)}`

  const linesHtml = lines.map((line, i) => {
    if (line.command) {
      return `<div class="term-line" data-idx="${i}" data-type="command" style="opacity:0"><span class="term-prompt">$</span> <span class="term-cmd"></span><span class="term-cursor">▋</span></div>`
    }
    return `<div class="term-line" data-idx="${i}" data-type="output" style="opacity:0"><span class="term-output"></span></div>`
  }).join('\n')

  const linesJson = JSON.stringify(lines)

  return {
    html: `<div class="terminal" id="${id}">
  <div class="term-bar">
    <span class="term-dot term-dot-red"></span>
    <span class="term-dot term-dot-yellow"></span>
    <span class="term-dot term-dot-green"></span>
    <span class="term-title">${title}</span>
  </div>
  <div class="term-body">
${linesHtml}
  </div>
</div>`,
    css: `.terminal { max-width: 40rem; margin: 0 auto; border-radius: 8px; overflow: hidden; border: 1px solid #27272a; background: #0a0a0a; }
.term-bar { display: flex; align-items: center; gap: 6px; padding: 0.75rem 1rem; background: #18181b; border-bottom: 1px solid #27272a; }
.term-dot { width: 10px; height: 10px; border-radius: 50%; }
.term-dot-red { background: #ef4444; }
.term-dot-yellow { background: #eab308; }
.term-dot-green { background: #22c55e; }
.term-title { margin-left: 0.5rem; font-size: 0.75rem; color: #52525b; }
.term-body { padding: 1rem 1.25rem; font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.875rem; line-height: 1.8; min-height: 12rem; }
.term-line { white-space: pre; }
.term-prompt { color: #22c55e; }
.term-cmd { color: #e4e4e7; }
.term-output { color: #71717a; }
.term-cursor { color: #22c55e; animation: blink 0.8s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }`,
    js: `{
  const el = document.getElementById('${id}')
  const lines = ${linesJson}
  let lineIdx = 0

  async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

  async function typeLine(lineEl, text) {
    const cmdEl = lineEl.querySelector('.term-cmd')
    const cursorEl = lineEl.querySelector('.term-cursor')
    lineEl.style.opacity = '1'
    for (let i = 0; i <= text.length; i++) {
      cmdEl.textContent = text.slice(0, i)
      await sleep(30 + Math.random() * 40)
    }
    if (cursorEl) cursorEl.style.display = 'none'
  }

  async function showOutput(lineEl, text) {
    lineEl.style.opacity = '1'
    const outEl = lineEl.querySelector('.term-output')
    outEl.textContent = text
  }

  async function run() {
    await sleep(800)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const lineEl = el.querySelector('[data-idx="' + i + '"]')
      if (!lineEl) continue
      if (line.delay) await sleep(line.delay)
      if (line.command) {
        await typeLine(lineEl, line.command)
        await sleep(200)
      } else if (line.output) {
        await showOutput(lineEl, line.output)
        await sleep(100)
      }
    }
  }

  // Start when visible
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) { observer.disconnect(); run() }
  }, { threshold: 0.3 })
  observer.observe(el)
}`,
  }
}

export default template
