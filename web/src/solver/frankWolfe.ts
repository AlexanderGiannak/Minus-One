// Static traffic assignment: conjugate Frank-Wolfe for UE and SO.
// TS port of pipeline/lib/assign.py; keep the two in sync.
// Link cost t(x) = free_time + coef * x^power (minutes). SO is UE on the
// marginal cost t(x) + x t'(x). Dijkstra with a binary heap, bisection line search.

export interface FwLink {
  id: string
  a_node: string
  b_node: string
  free_time: number
  coef: number
  power: number
}

export interface FwInput {
  links: FwLink[]
  od: [origin: string, destination: string, demand: number][]
  mode?: 'UE' | 'SO'
  maxIter?: number
  relGap?: number
}

export interface FwResult {
  flow: Record<string, number>
  time: Record<string, number>
  tstt: number
  relativeGap: number
  iterations: number
}

const DELTA = 1e-6 // keeps the conjugate weight away from 1

class MinHeap {
  private keys: number[] = []
  private vals: number[] = []
  get size() { return this.keys.length }
  push(key: number, val: number) {
    const k = this.keys, v = this.vals
    let i = k.length
    k.push(key); v.push(val)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (k[p] <= key) break
      k[i] = k[p]; v[i] = v[p]; i = p
    }
    k[i] = key; v[i] = val
  }
  pop(): [number, number] {
    const k = this.keys, v = this.vals
    const top: [number, number] = [k[0], v[0]]
    const lastK = k.pop()!, lastV = v.pop()!
    if (k.length > 0) {
      let i = 0
      const n = k.length
      for (;;) {
        let c = 2 * i + 1
        if (c >= n) break
        if (c + 1 < n && k[c + 1] < k[c]) c++
        if (k[c] >= lastK) break
        k[i] = k[c]; v[i] = v[c]; i = c
      }
      k[i] = lastK; v[i] = lastV
    }
    return top
  }
}

export function solve({ links, od, mode = 'UE', maxIter = 500, relGap = 1e-5 }: FwInput): FwResult {
  const marginal = mode === 'SO'
  const nodeIndex = new Map<string, number>()
  const idx = (name: string) => {
    let i = nodeIndex.get(name)
    if (i === undefined) { i = nodeIndex.size; nodeIndex.set(name, i) }
    return i
  }
  const m = links.length
  const tail = new Int32Array(m), head = new Int32Array(m)
  const free = new Float64Array(m), coef = new Float64Array(m), power = new Float64Array(m)
  links.forEach((l, k) => {
    tail[k] = idx(l.a_node); head[k] = idx(l.b_node)
    free[k] = l.free_time; coef[k] = l.coef; power[k] = l.power
  })
  const n = nodeIndex.size
  const out: number[][] = Array.from({ length: n }, () => [])
  for (let k = 0; k < m; k++) out[tail[k]].push(k)

  // Group OD demand by origin.
  const byOrigin = new Map<number, Map<number, number>>()
  for (const [o, d, q] of od) {
    if (o === d || q <= 0) continue
    for (const name of [o, d]) if (!nodeIndex.has(name)) throw new Error(`OD node ${name} is not in the network`)
    const oi = nodeIndex.get(o)!, di = nodeIndex.get(d)!
    const row = byOrigin.get(oi) ?? new Map<number, number>()
    row.set(di, (row.get(di) ?? 0) + q)
    byOrigin.set(oi, row)
  }

  const cost = (x: Float64Array) => {
    const c = new Float64Array(m)
    for (let k = 0; k < m; k++) {
      const xp = coef[k] * x[k] ** power[k]
      c[k] = free[k] + (marginal ? (1 + power[k]) * xp : xp)
    }
    return c
  }
  const costDerivative = (x: Float64Array) => {
    const h = new Float64Array(m)
    for (let k = 0; k < m; k++) {
      const d = coef[k] * power[k] * (power[k] === 1 ? 1 : x[k] ** (power[k] - 1))
      h[k] = Number.isFinite(d) ? (marginal ? d * (1 + power[k]) : d) : 0
    }
    return h
  }

  const allOrNothing = (c: Float64Array): [Float64Array, number] => {
    const flow = new Float64Array(m)
    let sptt = 0
    const dist = new Float64Array(n)
    const predLink = new Int32Array(n)
    for (const [origin, dests] of byOrigin) {
      dist.fill(Infinity); predLink.fill(-1)
      dist[origin] = 0
      const heap = new MinHeap()
      heap.push(0, origin)
      // Settle order is a valid tree order even with zero-cost links (a child is
      // only pushed after its parent is settled), unlike sorting by distance.
      const settled: number[] = []
      const isSettled = new Uint8Array(n)
      while (heap.size) {
        const [du, u] = heap.pop()
        if (du > dist[u] || isSettled[u]) continue
        isSettled[u] = 1
        settled.push(u)
        for (const k of out[u]) {
          const dv = du + c[k]
          const v = head[k]
          if (dv < dist[v]) { dist[v] = dv; predLink[v] = k; heap.push(dv, v) }
        }
      }
      // Push demand up the shortest-path tree, children before parents.
      const load = new Float64Array(n)
      for (const [d, q] of dests) {
        if (!Number.isFinite(dist[d])) throw new Error(`destination ${d} unreachable from origin ${origin}`)
        load[d] += q
        sptt += q * dist[d]
      }
      for (let i = settled.length - 1; i >= 0; i--) {
        const v = settled[i]
        const k = predLink[v]
        if (k < 0 || load[v] === 0) continue
        flow[k] += load[v]
        load[tail[k]] += load[v]
      }
    }
    return [flow, sptt]
  }

  const dot = (a: Float64Array, b: Float64Array) => {
    let s = 0
    for (let k = 0; k < m; k++) s += a[k] * b[k]
    return s
  }

  const lineSearch = (x: Float64Array, dir: Float64Array) => {
    const trial = new Float64Array(m)
    const slope = (lam: number) => {
      for (let k = 0; k < m; k++) trial[k] = x[k] + lam * dir[k]
      return dot(dir, cost(trial))
    }
    if (slope(1) <= 0) return 1
    let lo = 0, hi = 1
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi)
      if (slope(mid) > 0) hi = mid
      else lo = mid
    }
    return 0.5 * (lo + hi)
  }

  let [x] = allOrNothing(cost(new Float64Array(m)))
  let sPrev: Float64Array | null = null
  let gap = Infinity
  let it = 0
  for (it = 1; it <= maxIter; it++) {
    const c = cost(x)
    const [y, sptt] = allOrNothing(c)
    const total = dot(x, c)
    gap = total > 0 ? (total - sptt) / total : 0
    if (gap <= relGap) break

    // Conjugate direction: mix the previous target with the new AON solution.
    let s = y
    if (sPrev) {
      const h = costDerivative(x)
      let num = 0, den = 0
      for (let k = 0; k < m; k++) {
        const w = (sPrev[k] - x[k]) * h[k]
        num += w * (y[k] - x[k])
        den += w * (y[k] - sPrev[k])
      }
      let alpha = 0
      if (den !== 0) {
        alpha = num / den
        alpha = alpha > 1 - DELTA ? 1 - DELTA : Math.max(alpha, 0)
      }
      s = new Float64Array(m)
      for (let k = 0; k < m; k++) s[k] = alpha * sPrev[k] + (1 - alpha) * y[k]
    }
    const dir = new Float64Array(m)
    for (let k = 0; k < m; k++) dir[k] = s[k] - x[k]
    const step = lineSearch(x, dir)
    const nextX = new Float64Array(m)
    for (let k = 0; k < m; k++) nextX[k] = x[k] + step * dir[k]
    x = nextX
    sPrev = s
  }
  if (it > maxIter) it = maxIter

  const flow: Record<string, number> = {}
  const time: Record<string, number> = {}
  let tstt = 0
  links.forEach((l, k) => {
    const t = free[k] + coef[k] * x[k] ** power[k]
    flow[l.id] = x[k]
    time[l.id] = t
    tstt += x[k] * t
  })
  return { flow, time, tstt, relativeGap: gap, iterations: it }
}
