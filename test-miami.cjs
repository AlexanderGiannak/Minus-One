const assert=require('node:assert/strict');
const {solve}=require('./dist/traffic-model.js');
const data=require('./dist/miami-data.js');
const near=(a,b,eps=1e-4)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const classic={nodes:[0,1,2,3],demand:[{from:0,to:3,flow:4000}],edges:[
  {from:0,to:1,a:0,b:.01,segment:'sa'}, {from:1,to:3,a:45,b:0,segment:'at'},
  {from:0,to:2,a:45,b:0,segment:'sb'}, {from:2,to:3,a:0,b:.01,segment:'bt'},
  {from:1,to:2,a:0,b:0,segment:'ab'}]};
near(solve(classic).time,80);near(solve(classic,['ab']).time,65);
assert.equal(solve(classic,['sa','sb']).reachable,false);
const light=structuredClone(classic);light.demand[0].flow=1000;
near(solve(light).time,20);near(solve(light,['ab']).time,50);
function conservation(n,r,closed=[]) {
  assert.ok(r.reachable&&r.converged);
  const balance=n.nodes.map(()=>0),expected=n.nodes.map(()=>0);
  n.demand.forEach(d=>{expected[d.from]+=d.flow;expected[d.to]-=d.flow;});
  n.edges.forEach((e,i)=>{assert.ok(r.flows[i]>=0);balance[e.from]+=r.flows[i];balance[e.to]-=r.flows[i];if(closed.includes(e.segment))near(r.flows[i],0);});
  balance.forEach((value,i)=>near(value,expected[i]));
  const total=n.edges.reduce((sum,e,i)=>sum+r.flows[i]*(e.a+e.b*r.flows[i]),0);
  near(total/n.demand.reduce((sum,d)=>sum+d.flow,0),r.time);
}
for(const [area,n]of Object.entries(data)) {
  const immutable=JSON.stringify(n),baseline=solve(n);
  conservation(n,baseline);near(baseline.time,n.baseline.time,.001);
  const removal=[n.demo.segment],after=solve(n,removal);
  conservation(n,after,removal);assert.ok(after.time<baseline.time-.01,`${area} has no verified Braess benefit`);
  const tight=solve(n,removal,{tolerance:1e-8,maxIterations:40000});
  near(after.time,tight.time,.001);
  assert.equal(solve(n,n.segments.map(s=>s.id)).reachable,false);
  const restored=solve(n);near(restored.time,baseline.time);
  assert.equal(JSON.stringify(n),immutable,'Solver mutated baseline or network');
  const colors=new Set(n.segments.map(s=>{const flow=n.edges.reduce((a,e,i)=>a+(e.segment===s.id?baseline.flows[i]:0),0);return flow/s.capacity>=1?'red':flow/s.capacity>=.5?'yellow':'green';}));
  assert.ok(colors.has('red')&&colors.has('yellow'),area+' lacks requested density colors');
  console.log(`${area}: ${(baseline.time-after.time)*60} sec improvement; gap ${after.gap}; conservation, restoration, disconnection, red/yellow density passed`);
}
console.log('All Miami and classic Braess model checks passed.');
