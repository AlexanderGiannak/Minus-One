// Ported from emma1's test-model.cjs.
import { describe, expect, it } from 'vitest'
import { equilibrium as solve } from './braessClosedForm'

describe('closed-form 4-node Braess equilibrium', () => {
  it('matches reference cases', () => {
    expect(solve(4000, true).time).toBe(80)
    expect(solve(4000, false).time).toBe(65)
    expect(solve(1000, true).time).toBe(20)
    expect(solve(1000, false).time).toBe(50)
    expect(solve(6000, true).time).toBe(90)
    expect(solve(6000, false).time).toBe(75)
    expect(solve(9000, true).time).toBe(90)
    expect(solve(12000, true).time).toBe(105)
    expect(solve(0, true).time).toBe(0)
  })

  it('conserves flow, satisfies Wardrop, and totals match for every slider value', () => {
    for (let demand = 100; demand <= 12000; demand += 100) {
      for (const shortcut of [false, true]) {
        const s = solve(demand, shortcut)
        expect(s.routes.reduce((a, b) => a + b, 0)).toBe(demand)
        const costs = [s.variableTime + 45, shortcut ? 2 * s.variableTime : Infinity, s.variableTime + 45]
        const minimum = Math.min(...costs)
        s.routes.forEach((flow, i) => { if (flow > 0) expect(Math.abs(costs[i] - minimum)).toBeLessThan(1e-9) })
        const total = s.edges[0] * s.variableTime + s.edges[1] * 45 + s.edges[2] * 45 + s.edges[3] * s.variableTime
        expect(Math.abs(total - demand * s.time)).toBeLessThan(1e-6)
      }
    }
  })

  it('rejects negative demand', () => {
    expect(() => solve(-1, true)).toThrow(RangeError)
  })
})
