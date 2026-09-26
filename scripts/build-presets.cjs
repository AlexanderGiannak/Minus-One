// Educational scenarios deliberately vary fixed delay and congestion sensitivity.
// These are not inferred capacities, travel times, or measured Miami traffic.
// Run after prepare-streets.py. Multiplying all costs by 0.25 changes units of
// displayed travel time without changing equilibrium route shares.
const fs=require('node:fs'),path=require('node:path');
const data=require('../dist/miami-data.js'),{solve}=require('../dist/traffic-model.js');
const presets={downtown:{seed:4,segment:'20728-0'},brickell:{seed:1,segment:'22865-0'},overtown:{seed:3,segment:'43107-0'},wynwood:{seed:1,segment:'24258-0'}};
for(const [key,n]of Object.entries(data)) {
  if(n.demo)throw new Error('Regenerate raw neighborhood graphs before applying presets again.');
  const preset=presets[key];
  n.edges=n.edges.map(e=>{
    const r=((Math.imul(Number(e.segment.split('-')[0]),2654435761)^Math.imul(preset.seed,2246822519))>>>0)/4294967296;
    return {...e,a:(e.a+(r<.45?3+r*8:0))*.25,b:(r<.45?.00001:e.b*3)*.25};
  });
  n.demo={seed:preset.seed,segment:preset.segment,synthetic:true};
  n.baseline=solve(n,[],{tolerance:1e-8,maxIterations:40000});
  const closed=solve(n,[preset.segment],{tolerance:1e-8,maxIterations:40000});
  if(!closed.converged||!n.baseline.converged||closed.time>=n.baseline.time-.01)throw new Error('Demonstration failed verification: '+key);
  n.demo.closedMinutes=closed.time;n.demo.savedSeconds=(n.baseline.time-closed.time)*60;
  console.log(key,n.baseline.time.toFixed(4),'→',closed.time.toFixed(4),'minutes;',n.demo.savedSeconds.toFixed(2),'seconds saved');
}
fs.writeFileSync(path.join(__dirname,'../dist/miami-data.js'),'/* Source: Miami-Dade GeoStreets 2026-09-26. Synthetic two-way traffic presets. */\nconst MIAMI_DATA = '+JSON.stringify(data)+';\nif(typeof module!=="undefined")module.exports=MIAMI_DATA;\n');
