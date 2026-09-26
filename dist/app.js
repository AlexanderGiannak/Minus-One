const $ = id => document.getElementById(id);
const format = n => n.toLocaleString('en-US', {maximumFractionDigits:1});
let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
let particles = [];
let state;
function render() {
  const demand = Number($('density').value), shortcut = $('shortcut').checked;
  const open = Braess.equilibrium(demand, true), closed = Braess.equilibrium(demand, false);
  state = shortcut ? open : closed;
  const delta = open.time - closed.time;
  $('demand').textContent = format(demand);
  $('density-label').textContent = demand === 0 ? 'Empty' : demand < 3000 ? 'Light' : demand < 7000 ? 'Moderate' : 'Heavy';
  $('density').setAttribute('aria-valuetext', `${format(demand)} vehicles per hour`);
  $('shortcut-label').textContent = shortcut ? 'Open · A → B' : 'Closed · outer routes only';
  $('change-heading').textContent = shortcut ? 'IF YOU CLOSE THE SHORTCUT' : 'WITH THE SHORTCUT CLOSED';
  $('delta').textContent = format(Math.abs(delta));
  $('delta-unit').textContent = delta > 0 ? 'min faster' : delta < 0 ? 'min slower' : 'min change';
  $('change-detail').textContent = demand === 0 ? 'Add drivers to begin the experiment' : delta === 0 ? 'Closing the shortcut makes no difference' : `${format(Math.abs(delta) / open.time * 100)}% ${delta > 0 ? 'less' : 'more'} travel time per driver`;
  document.querySelector('.result').className = `result ${delta < 0 ? 'worse' : delta === 0 ? 'neutral' : ''}`;
  $('open-time').textContent = demand ? `${format(open.time)} min` : 'No trips';
  $('closed-time').textContent = demand ? `${format(closed.time)} min` : 'No trips';
  $('current-time').innerHTML = demand ? `${format(state.time)} <small>min</small>` : '—';
  $('cost0').textContent = $('cost3').textContent = `${format(state.variableTime)} min →`;
  state.edges.forEach((flow,i) => { $('flow'+i).textContent = `${format(flow)} veh/h`; $('road'+i).style.opacity = flow || i === 4 ? '1' : '.35'; });
  $('road4').classList.toggle('closed', !shortcut);
  $('shortcut-status').textContent = shortcut ? 'SHORTCUT ↓' : 'CLOSED';
  $('shortcut-time').textContent = shortcut ? '0 min' : 'No access';
  ['upper','cross','lower'].forEach((name,i) => { const share = demand ? state.routes[i] / demand * 100 : 0; $(name+'-share').textContent = `${format(share)}%`; $(name+'-bar').style.width = `${share}%`; });
  $('insight').textContent = demand === 0 ? 'No drivers, no congestion. Increase density to see routes fill up.' : delta < 0 ? 'At low demand, the shortcut really helps. Closing it forces drivers onto longer outer routes.' : delta === 0 ? (demand >= 9000 ? 'At this density, nobody uses the shortcut—even when it is open. Closing it changes nothing.' : 'At this density, both networks have the same average travel time.') : shortcut ? 'The shortcut draws drivers onto both congestible roads. Closing it spreads traffic across the two outer routes and lowers average travel time.' : 'Drivers now split evenly between the upper and lower routes. Each uses just one congestible road, so the average trip is faster.';
  $('network-description').textContent = `${format(demand)} vehicles per hour. Shortcut ${shortcut ? 'open' : 'closed'}. ${demand ? 'Average trip '+format(state.time)+' minutes.' : 'No trips.'} Upper route ${format(state.outer)}, shortcut route ${format(state.cross)}, lower route ${format(state.outer)} vehicles per hour.`;
  makeParticles();
}
function makeParticles() {
  $('cars').replaceChildren(); particles = [];
  state.edges.forEach((flow,i) => {
    if (!flow) return;
    const road = $('road'+i), length = road.getTotalLength(), count = Math.max(2, Math.round(flow / 240));
    for (let j=0;j<count;j++) {
      const dot = document.createElementNS('http://www.w3.org/2000/svg','circle');
      dot.setAttribute('r','3.4'); dot.setAttribute('fill',i===4 ? '#c3dcff' : '#f1ffff');
      $('cars').append(dot); particles.push({dot,road,length,offset:j/count});
    }
  });
  positionParticles();
}
let phase = 0, last = 0;
function positionParticles() { particles.forEach(p => { const point = p.road.getPointAtLength(((phase / p.length + p.offset) % 1) * p.length); p.dot.setAttribute('cx',point.x); p.dot.setAttribute('cy',point.y); }); }
function animate(time) { if (!paused && last) { phase += Math.min(time-last,50) * .035; positionParticles(); } last = time; requestAnimationFrame(animate); }
function updatePause() { $('pause').textContent = paused ? 'Play motion' : 'Pause motion'; $('pause').setAttribute('aria-pressed',String(paused)); }
$('density').addEventListener('input',render);
$('shortcut').addEventListener('change',render);
$('pause').addEventListener('click',() => {paused=!paused;updatePause();});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e => { paused=e.matches; updatePause(); });
render();updatePause();requestAnimationFrame(animate);
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  try {
    Promise.resolve(document.modelContext.registerTool({
      name: 'configure_braess_simulation',
      title: 'Configure Braess simulation',
      description: 'Set hourly traffic demand and shortcut access, then return the displayed travel-time comparison.',
      inputSchema: {type:'object',properties:{demand:{type:'integer',minimum:0,maximum:12000,multipleOf:100},shortcut:{type:'boolean'}},required:['demand','shortcut'],additionalProperties:false},
      annotations: {readOnlyHint:false,untrustedContentHint:false},
      execute(input) {
        if (!input || !Number.isInteger(input.demand) || input.demand<0 || input.demand>12000 || input.demand%100 || typeof input.shortcut!=='boolean' || Object.keys(input).some(k=>!['demand','shortcut'].includes(k))) throw new Error('Use demand from 0 to 12000 in steps of 100 and a boolean shortcut.');
        $('density').value=String(input.demand);$('shortcut').checked=input.shortcut;render();
        return {demand:input.demand,shortcut:input.shortcut,averageMinutes:state.demand?state.time:null,openMinutes:input.demand?Braess.equilibrium(input.demand,true).time:null,closedMinutes:input.demand?Braess.equilibrium(input.demand,false).time:null};
      }
    },{signal:lifecycle.signal})).catch(()=>{});
  } catch (_) { /* Browsers without WebMCP continue with native controls. */ }
  addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
