// Exact Wardrop equilibrium for the symmetric, four-node Braess network.
// Demand and flows: vehicles/hour. Costs: minutes. Shortcut: zero-cost idealization.
(function (root) {
  function equilibrium(demand, shortcut) {
    if (!Number.isFinite(demand) || demand < 0) throw new RangeError('Demand must be nonnegative');
    const outer = shortcut ? Math.min(demand / 2, Math.max(0, demand - 4500)) : demand / 2;
    const cross = shortcut ? demand - 2 * outer : 0;
    const congestedFlow = outer + cross;
    const variableTime = congestedFlow / 100;
    const time = demand === 0 ? 0 : shortcut && cross > 0 ? 2 * variableTime : variableTime + 45;
    return { demand, outer, cross, congestedFlow, variableTime, time,
      routes: [outer, cross, outer],
      edges: [congestedFlow, outer, outer, congestedFlow, cross] };
  }
  root.Braess = { equilibrium };
  if (typeof module !== 'undefined') module.exports = root.Braess;
})(typeof globalThis !== 'undefined' ? globalThis : window);
