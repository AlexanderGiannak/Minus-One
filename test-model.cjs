const assert = require('node:assert/strict');
const { equilibrium: solve } = require('./dist/model.js');
assert.equal(solve(4000,true).time,80);
assert.equal(solve(4000,false).time,65);
assert.equal(solve(1000,true).time,20);
assert.equal(solve(1000,false).time,50);
assert.equal(solve(6000,true).time,90);
assert.equal(solve(6000,false).time,75);
assert.equal(solve(9000,true).time,90);
assert.equal(solve(12000,true).time,105);
assert.equal(solve(0,true).time,0);
// Conservation and Wardrop condition: every used route has minimum cost.
for(let demand=100; demand<=12000; demand+=100) {
  for(const shortcut of [false,true]) {
    const s=solve(demand,shortcut);
    assert.equal(s.routes.reduce((a,b)=>a+b,0),demand);
    const costs=[s.variableTime+45,shortcut?2*s.variableTime:Infinity,s.variableTime+45];
    const minimum=Math.min(...costs);
    s.routes.forEach((flow,i)=>{if(flow>0) assert.ok(Math.abs(costs[i]-minimum)<1e-9);});
    assert.ok(Math.abs(s.edges[0]*s.variableTime+s.edges[1]*45+s.edges[2]*45+s.edges[3]*s.variableTime-demand*s.time)<1e-6);
  }
}
console.log('Passed: reference cases, conservation, used-route optimality, and total travel time across all 240 slider/scenario combinations.');
