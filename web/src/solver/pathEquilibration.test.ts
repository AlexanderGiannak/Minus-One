// Ported from emma1's test-miami.cjs.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { solve, type AffineNetwork, type AffineResult } from './pathEquilibration'
import type { Neighborhoods } from '../sandbox/types'

const data: Neighborhoods = JSON.parse(
  readFileSync(new URL('../../public/sandbox/neighborhoods.json', import.meta.url), 'utf8'),
)
const near = (a: number, b: number, eps = 1e-4) => expect(Math.abs(a - b), `${a} != ${b}`).toBeLessThan(eps)

const classic: AffineNetwork = {
  nodes: [0, 1, 2, 3],
  demand: [{ from: 0, to: 3, flow: 4000 }],
  edges: [
    { from: 0, to: 1, a: 0, b: 0.01, segment: 'sa' }, { from: 1, to: 3, a: 45, b: 0, segment: 'at' },
    { from: 0, to: 2, a: 45, b: 0, segment: 'sb' }, { from: 2, to: 3, a: 0, b: 0.01, segment: 'bt' },
    { from: 1, to: 2, a: 0, b: 0, segment: 'ab' },
  ],
}

function checkConservation(n: AffineNetwork, r: AffineResult, closed: string[] = []) {
  expect(r.reachable && r.converged).toBe(true)
  const balance = n.nodes.map(() => 0), expected = n.nodes.map(() => 0)
  n.demand.forEach((d) => { expected[d.from] += d.flow; expected[d.to] -= d.flow })
  n.edges.forEach((e, i) => {
    expect(r.flows[i]).toBeGreaterThanOrEqual(0)
    balance[e.from] += r.flows[i]
    balance[e.to] -= r.flows[i]
    if (closed.includes(e.segment)) near(r.flows[i], 0)
  })
  balance.forEach((value, i) => near(value, expected[i]))
  const total = n.edges.reduce((sum, e, i) => sum + r.flows[i] * (e.a + e.b * r.flows[i]), 0)
  near(total / n.demand.reduce((sum, d) => sum + d.flow, 0), r.time!)
}

describe('path equilibration: classic Braess', () => {
  it('reproduces 80 min with the shortcut and 65 without', () => {
    near(solve(classic).time!, 80)
    near(solve(classic, ['ab']).time!, 65)
  })
  it('reports disconnected trips as unreachable', () => {
    expect(solve(classic, ['sa', 'sb']).reachable).toBe(false)
  })
  it('light demand: 20 min with the shortcut, 50 without', () => {
    const light = structuredClone(classic)
    light.demand[0].flow = 1000
    near(solve(light).time!, 20)
    near(solve(light, ['ab']).time!, 50)
  })
})

describe.each(Object.entries(data))('sandbox neighborhood %s', (area, n) => {
  it('baseline, teaching closure, tight tolerance, disconnection, restoration, colors', () => {
    const immutable = JSON.stringify(n)
    const baseline = solve(n)
    checkConservation(n, baseline)
    near(baseline.time!, n.baseline.time!, 0.001)

    const removal = [n.demo.segment]
    const after = solve(n, removal)
    checkConservation(n, after, removal)
    expect(after.time!, `${area} has no verified Braess benefit`).toBeLessThan(baseline.time! - 0.01)
    near(after.time!, solve(n, removal, { tolerance: 1e-8, maxIterations: 40000 }).time!, 0.001)

    expect(solve(n, n.segments.map((s) => s.id)).reachable).toBe(false)
    near(solve(n).time!, baseline.time!)
    expect(JSON.stringify(n), 'solver mutated the network').toBe(immutable)

    const colors = new Set(n.segments.map((s) => {
      const flow = n.edges.reduce((a, e, i) => a + (e.segment === s.id ? baseline.flows[i] : 0), 0)
      return flow / s.capacity >= 1 ? 'red' : flow / s.capacity >= 0.5 ? 'yellow' : 'green'
    }))
    expect(colors.has('red') && colors.has('yellow'), `${area} lacks density colors`).toBe(true)
  })
})
