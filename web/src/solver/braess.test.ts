// 4-node Braess network, run against src/solver/frankWolfe.ts.
// Same cases and expected values as pipeline/tests/test_braess.py (derivation there).
import { describe, expect, it } from 'vitest'
import { solve as fw } from './frankWolfe'

type Link = { id: string; a_node: string; b_node: string; free_time: number; coef: number; power: number }

const OD: [string, string, number][] = [['S', 'E', 4000]]
const LINKS: Link[] = [
  { id: 'SA', a_node: 'S', b_node: 'A', free_time: 0, coef: 0.01, power: 1 },
  { id: 'AE', a_node: 'A', b_node: 'E', free_time: 45, coef: 0, power: 1 },
  { id: 'SB', a_node: 'S', b_node: 'B', free_time: 45, coef: 0, power: 1 },
  { id: 'BE', a_node: 'B', b_node: 'E', free_time: 0, coef: 0.01, power: 1 },
]
const SHORTCUT: Link = { id: 'AB', a_node: 'A', b_node: 'B', free_time: 0, coef: 0, power: 1 }
const FLOW_TOL = 5 // vehicles

async function solve(links: Link[], mode: 'UE' | 'SO') {
  return fw({ links, od: OD, mode, maxIter: 5000, relGap: 1e-6 })
}

const near = (actual: number, expected: number, tol: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol)

describe('4-node Braess network', () => {
  it('UE without shortcut: 2000 per route, 65 min, TSTT 260,000', async () => {
    const r = await solve(LINKS, 'UE')
    for (const id of ['SA', 'AE', 'SB', 'BE']) near(r.flow[id], 2000, FLOW_TOL)
    near(r.time.SA + r.time.AE, 65, 0.01)
    near(r.tstt, 260_000, 26)
  })

  it('UE with shortcut: everyone takes S-A-B-E at 80 min, TSTT 320,000', async () => {
    const r = await solve([...LINKS, SHORTCUT], 'UE')
    near(r.flow.AB, 4000, FLOW_TOL)
    near(r.time.SA + r.time.AB + r.time.BE, 80, 0.01)
    near(r.tstt, 320_000, 32)
  })

  it('SO with shortcut: 1750 / 1750 / 500, TSTT 258,750', async () => {
    const r = await solve([...LINKS, SHORTCUT], 'SO')
    near(r.flow.AE, 1750, FLOW_TOL)
    near(r.flow.SB, 1750, FLOW_TOL)
    near(r.flow.AB, 500, FLOW_TOL)
    near(r.tstt, 258_750, 26)
  })

  it('SO without shortcut equals UE', async () => {
    near((await solve(LINKS, 'SO')).tstt, 260_000, 26)
  })
})

describe('frankWolfe edge cases', () => {
  it('splits flow evenly across parallel links', async () => {
    const par: Link[] = ['p1', 'p2'].map((id) => ({ id, a_node: 'A', b_node: 'B', free_time: 1, coef: 0.001, power: 1 }))
    const r = fw({ links: par, od: [['A', 'B', 1000]], mode: 'UE', maxIter: 500, relGap: 1e-8 })
    near(r.flow.p1, 500, 0.5)
    near(r.flow.p2, 500, 0.5)
  })
})
