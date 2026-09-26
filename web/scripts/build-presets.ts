// Apply the Sandbox teaching presets to public/sandbox/neighborhoods.json.
// Run after pipeline/sandbox/prepare_streets.py:  node web/scripts/build-presets.ts
// (Node 24 runs TypeScript directly.) Originally written by emmanguyen1.
//
// These presets DELIBERATELY vary fixed delay and congestion sensitivity, with
// seeds chosen so each neighborhood shows a Braess effect. They are not inferred
// capacities, travel times, or measured Miami traffic, and must never be shown
// as Miami findings. Multiplying all costs by 0.25 changes the displayed time
// units without changing equilibrium route shares.
import { readFileSync, writeFileSync } from 'node:fs'
import { solve } from '../src/solver/pathEquilibration.ts'

const file = new URL('../public/sandbox/neighborhoods.json', import.meta.url)
const data = JSON.parse(readFileSync(file, 'utf8'))
const presets: Record<string, { seed: number; segment: string }> = {
  downtown: { seed: 4, segment: '20728-0' },
  brickell: { seed: 1, segment: '22865-0' },
  overtown: { seed: 3, segment: '43107-0' },
  wynwood: { seed: 1, segment: '24258-0' },
}

for (const [key, n] of Object.entries<any>(data)) {
  if (n.demo) throw new Error('Regenerate raw neighborhood graphs before applying presets again.')
  const preset = presets[key]
  n.edges = n.edges.map((e: any) => {
    const r = ((Math.imul(Number(e.segment.split('-')[0]), 2654435761) ^ Math.imul(preset.seed, 2246822519)) >>> 0) / 4294967296
    return { ...e, a: (e.a + (r < 0.45 ? 3 + r * 8 : 0)) * 0.25, b: (r < 0.45 ? 0.00001 : e.b * 3) * 0.25 }
  })
  n.demo = { seed: preset.seed, segment: preset.segment, synthetic: true }
  n.baseline = solve(n, [], { tolerance: 1e-8, maxIterations: 40000 })
  const closed = solve(n, [preset.segment], { tolerance: 1e-8, maxIterations: 40000 })
  if (!closed.converged || !n.baseline.converged || closed.time! >= n.baseline.time - 0.01) {
    throw new Error('Demonstration failed verification: ' + key)
  }
  n.demo.closedMinutes = closed.time
  n.demo.savedSeconds = (n.baseline.time - closed.time!) * 60
  console.log(key, n.baseline.time.toFixed(4), '→', closed.time!.toFixed(4), 'minutes;', n.demo.savedSeconds.toFixed(2), 'seconds saved')
}
writeFileSync(file, JSON.stringify(data))
