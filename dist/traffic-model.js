/* Static user equilibrium with affine link costs, solved by path equilibration.
 * Flows are vehicles/hour; a + b*flow is minutes. No removed demand.
 */
(function(root){
  function solve(network, closedIds=[], options={}) {
    const closed=new Set(closedIds), edges=network.edges, n=network.nodes.length;
    const adjacency=Array.from({length:n},()=>[]);
    edges.forEach((e,i)=>{if(!closed.has(e.segment))adjacency[e.from].push(i);});
    function assignment(costs) {
      const y=new Float64Array(edges.length),paths=[];let shortestTotal=0;
      for(const od of network.demand) {
        const dist=new Float64Array(n).fill(Infinity),prev=new Int32Array(n).fill(-1),done=new Uint8Array(n);
        dist[od.from]=0;
        for(let k=0;k<n;k++) {
          let u=-1,best=Infinity;
          for(let j=0;j<n;j++)if(!done[j]&&dist[j]<best){best=dist[j];u=j;}
          if(u<0||u===od.to)break;done[u]=1;
          for(const i of adjacency[u]) {const e=edges[i],d=best+costs[i];if(d<dist[e.to]){dist[e.to]=d;prev[e.to]=i;}}
        }
        if(!Number.isFinite(dist[od.to]))return null;
        shortestTotal+=dist[od.to]*od.flow;
        let v=od.to;const path=[];
        while(v!==od.from){const i=prev[v];if(i<0)return null;y[i]+=od.flow;path.push(i);v=edges[i].from;}
        paths.push(path);
      }
      return {y,shortestTotal,paths};
    }
    let initial=assignment(edges.map(e=>e.a));
    if(!initial)return {reachable:false,time:null,flows:edges.map(()=>0),gap:null,converged:false,iterations:0};
    let x=initial.y,gap=Infinity,iterations=0;
    const routes=initial.paths.map((path,i)=>new Map([[path.join(','),{path,flow:network.demand[i].flow}]]));
    const tolerance=options.tolerance??1e-6,maxIterations=options.maxIterations??6000;
    for(;iterations<maxIterations;iterations++) {
      const costs=edges.map((e,i)=>e.a+e.b*x[i]),next=assignment(costs);
      let total=0;
      for(let i=0;i<edges.length;i++)total+=x[i]*costs[i];
      gap=Math.max(0,(total-next.shortestTotal)/Math.max(total,1e-12));
      if(gap<tolerance)break;
      let best=null;
      routes.forEach((set,odIndex)=>{
        const shortest=next.paths[odIndex],shortestCost=shortest.reduce((s,i)=>s+costs[i],0);
        for(const route of set.values())if(route.flow>1e-10){
          const advantage=route.path.reduce((s,i)=>s+costs[i],0)-shortestCost;
          if(advantage>1e-10&&(!best||advantage>best.advantage))best={route,set,shortest,advantage};
        }
      });
      if(!best)break;
      const direction=new Map();
      best.shortest.forEach(i=>direction.set(i,(direction.get(i)||0)+1));
      best.route.path.forEach(i=>direction.set(i,(direction.get(i)||0)-1));
      let curvature=0;direction.forEach((d,i)=>curvature+=edges[i].b*d*d);
      const shift=Math.min(best.route.flow,curvature>0?best.advantage/curvature:best.route.flow);
      direction.forEach((d,i)=>x[i]=Math.max(0,x[i]+shift*d));
      best.route.flow-=shift;
      const key=best.shortest.join(',');
      if(!best.set.has(key))best.set.set(key,{path:best.shortest,flow:0});
      best.set.get(key).flow+=shift;
    }
    const costs=edges.map((e,i)=>e.a+e.b*x[i]);
    const total=x.reduce((s,f,i)=>s+f*costs[i],0),demand=network.demand.reduce((s,d)=>s+d.flow,0);
    const finalAssignment=assignment(costs);
    gap=Math.max(0,(total-finalAssignment.shortestTotal)/Math.max(total,1e-12));
    return {reachable:true,time:total/demand,flows:Array.from(x),costs,gap,converged:gap<tolerance,iterations};
  }
  root.MiamiTraffic={solve};if(typeof module!=='undefined')module.exports=root.MiamiTraffic;
})(typeof globalThis!=='undefined'?globalThis:window);
