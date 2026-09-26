// Exact Wardrop equilibrium for the symmetric 4-node Braess network (Paradox tab).
// S-A and B-T cost flow/100 min, S-B and A-T cost 45 min, A-B (shortcut) costs 0.
// Demand and flows: vehicles/hour. Costs: minutes.
// With the shortcut open, each outer route carries min(q/2, max(0, q - 4500))
// and the shortcut route the rest; without it, each outer route carries q/2.

export interface BraessState {
  demand: number
  outer: number // flow on each outer route (S-A-T and S-B-T)
  cross: number // flow on S-A-B-T
  congestedFlow: number // flow on S-A and on B-T
  variableTime: number // minutes on S-A and on B-T
  time: number // average trip, minutes (0 when demand is 0)
  routes: [upper: number, shortcut: number, lower: number]
  edges: [sa: number, at: number, sb: number, bt: number, ab: number]
}

export function equilibrium(demand: number, shortcut: boolean): BraessState {
  if (!Number.isFinite(demand) || demand < 0) throw new RangeError('Demand must be nonnegative')
  const outer = shortcut ? Math.min(demand / 2, Math.max(0, demand - 4500)) : demand / 2
  const cross = shortcut ? demand - 2 * outer : 0
  const congestedFlow = outer + cross
  const variableTime = congestedFlow / 100
  const time = demand === 0 ? 0 : shortcut && cross > 0 ? 2 * variableTime : variableTime + 45
  return {
    demand, outer, cross, congestedFlow, variableTime, time,
    routes: [outer, cross, outer],
    edges: [congestedFlow, outer, outer, congestedFlow, cross],
  }
}
