import { describe, it, expect } from 'vitest'
import { mapLimit, mapLimitSettled } from '../src/concurrency.js'

describe('mapLimit', () => {
  it('returns results in input order', async () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const r = await mapLimit(items, async (n) => {
      // Random delay to shuffle completion order
      await new Promise(res => setTimeout(res, Math.random() * 10))
      return n * 2
    }, 3)
    expect(r).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20])
  })

  it('respects the concurrency limit', async () => {
    let inFlight = 0
    let peak = 0
    const items = Array.from({ length: 50 }, (_, i) => i)
    await mapLimit(items, async () => {
      inFlight++
      if (inFlight > peak) peak = inFlight
      await new Promise(res => setTimeout(res, 5))
      inFlight--
    }, 4)
    expect(peak).toBeLessThanOrEqual(4)
  })

  it('handles empty input', async () => {
    const r = await mapLimit([], async () => 1)
    expect(r).toEqual([])
  })

  it('handles limit larger than items', async () => {
    const r = await mapLimit([1, 2, 3], async (n) => n + 1, 100)
    expect(r).toEqual([2, 3, 4])
  })

  it('rejects on first error', async () => {
    await expect(mapLimit([1, 2, 3], async (n) => {
      if (n === 2) throw new Error('bad')
      return n
    })).rejects.toThrow('bad')
  })
})

describe('mapLimitSettled', () => {
  it('reports per-item success/failure without aborting', async () => {
    const r = await mapLimitSettled([1, 2, 3, 4], async (n) => {
      if (n % 2 === 0) throw new Error(`bad ${n}`)
      return n * 10
    }, 2)
    expect(r[0]).toEqual({ ok: true, value: 10 })
    expect(r[1]).toMatchObject({ ok: false })
    expect(r[2]).toEqual({ ok: true, value: 30 })
    expect(r[3]).toMatchObject({ ok: false })
  })
})
