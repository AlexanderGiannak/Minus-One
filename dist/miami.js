(() => {
  const el=id=>document.getElementById(id), fmt=n=>n.toLocaleString('en-US',{maximumFractionDigits:2});
  let area='downtown',map,layers=new Map(),endpoints=[],selected=null,worker,request=0;
  const states={};
  const colors={high:'#e53935',medium:'#e6aa00',low:'#16856b',closed:'#657583'};
  for(const [key,network] of Object.entries(MIAMI_DATA))states[key]={closed:new Set(),baseline:network.baseline??null,result:network.baseline??null,busy:false};
  function activateTab(name) {
    ['simulator','miami'].forEach(id=>{const active=id===name;el(id+'-tab').setAttribute('aria-selected',String(active));el(id+'-tab').tabIndex=active?0:-1;el(id+'-panel').hidden=!active;});
    if(name==='miami'){if(!map)initMap();requestAnimationFrame(()=>map?.invalidateSize());}
  }
  ['simulator','miami'].forEach((name,index)=>{
    el(name+'-tab').addEventListener('click',()=>activateTab(name));
    el(name+'-tab').addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'simulator':event.key==='End'?'miami':index?'simulator':'miami';activateTab(next);el(next+'-tab').focus();}});
  });
  function initMap() {
    if(typeof L==='undefined'){el('map-status').textContent='Map library could not load. Reload this page.';return;}
    map=L.map('miami-map',{scrollWheelZoom:true,preferCanvas:false}).setView([25.779,-80.193],15);
    const tile=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
    tile.on('tileerror',()=>{el('map-status').textContent='Basemap tiles unavailable. Street geometry and closure controls still work.';});
    try {worker=new Worker('traffic-worker.js');worker.onmessage=receive;worker.onerror=()=>{worker?.terminate();worker=null;states[area].busy=false;el('map-status').textContent='Using the local calculation fallback.';calculate();};} catch(_){worker=null;}
    drawArea();
  }
  function drawArea() {
    layers.forEach(l=>map.removeLayer(l));layers.clear();endpoints.forEach(l=>map.removeLayer(l));endpoints=[];selected=null;
    const network=MIAMI_DATA[area];
    el('miami-area-title').textContent=network.name+' Miami';
    el('street-picker').replaceChildren(new Option('Choose a segment…',''));
    for(const s of [...network.segments].sort((a,b)=>a.name.localeCompare(b.name))) {
      const line=L.polyline(s.path,{weight:6,opacity:.9}).addTo(map);
      line.on('click',event=>selectStreet(s.id,event.latlng));
      const path=line.getElement();path.setAttribute('role','button');path.setAttribute('aria-label',`${s.name} segment ${s.id}`);path.setAttribute('tabindex','-1');
      path.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectStreet(s.id,line.getBounds().getCenter());}});
      line.bindTooltip(s.name,{sticky:true});layers.set(s.id,line);
      el('street-picker').append(new Option(`${s.name} · ${s.length} m · #${s.id}`,s.id));
    }
    const trip=network.demand[0];
    [['S',trip.from,'Trip origin'],['T',trip.to,'Trip destination']].forEach(([label,node,title])=>endpoints.push(L.marker(network.nodes[node],{icon:L.divIcon({className:'endpoint',html:label,iconSize:[28,28],iconAnchor:[14,14]}),title}).addTo(map).bindTooltip(title)));
    map.fitBounds(network.bounds,{padding:[22,22]});
    el('scenario-detail').textContent=`${network.nodes.length} intersections; ${network.segments.length} segments; ${fmt(network.demand.reduce((s,d)=>s+d.flow,0))} trips/hour from S to T. All centerlines are treated as two-way. Costs are synthetic affine functions, with a fixed cost plus a flow-dependent delay. Red: flow/capacity ≥ 1; yellow: ≥ 0.5; green: below 0.5. ${network.demo ? 'This teaching preset deliberately varies delay and congestion sensitivity to exhibit Braess’s paradox. No street costs are calibrated to observed traffic.' : ''}`;
    el('example-street').hidden=!network.demo;
    render();if(!states[area].baseline)calculate();else if(el('map-status').textContent==='Loading Miami streets…')el('map-status').textContent='';
  }
  function metrics(segment) {
    const network=MIAMI_DATA[area],state=states[area];let flow=0;
    network.edges.forEach((e,i)=>{if(e.segment===segment.id)flow+=state.result?.flows[i]??0;});
    const density=flow/segment.capacity;
    return {flow,density,level:density>=1?'high':density>=.5?'medium':'low'};
  }
  function selectStreet(id,latlng) {
    selected=MIAMI_DATA[area].segments.find(s=>s.id===id)??null;
    el('street-picker').value=selected?.id??'';renderSelection();paint();
    if(selected&&latlng){
      const content=document.createElement('div'),title=document.createElement('strong'),p=document.createElement('p'),button=document.createElement('button');
      title.textContent=selected.name;p.textContent=`${selected.length} m segment · ${states[area].closed.has(id)?'Closed':metrics(selected).level+' simulated density'}`;
      button.textContent=states[area].closed.has(id)?'Restore street':'Delete street from simulation';button.disabled=states[area].busy;
      button.onclick=()=>{toggleClosure(id);map.closePopup();};content.append(title,p,button);
      L.popup({autoPan:false}).setLatLng(latlng).setContent(content).openOn(map);
    }
  }
  function renderSelection() {
    const state=states[area];
    el('street-title').textContent=selected?.name??'Choose a street';
    el('street-detail').textContent=selected?`${selected.length} m · segment #${selected.id} · ${state.closed.has(selected.id)?'Closed':fmt(metrics(selected).flow)+' vehicles/hour · '+metrics(selected).level+' modeled density'}`:'Click a colored line on the map, or choose a segment below.';
    el('delete-street').disabled=!selected||state.busy;
    el('delete-street').textContent=selected&&state.closed.has(selected.id)?'Restore this street':'Delete street from simulation';
  }
  function paint() {
    const state=states[area];
    MIAMI_DATA[area].segments.forEach(s=>{const closed=state.closed.has(s.id);layers.get(s.id)?.setStyle({color:closed?colors.closed:colors[metrics(s).level],weight:selected?.id===s.id?10:6,dashArray:closed?'6 9':null,opacity:closed?.65:.9});});
  }
  function render() {
    const state=states[area],before=state.baseline,after=state.result;
    el('miami-before').textContent=before?`${fmt(before.time)} min`:'Calculating…';
    el('miami-after').textContent=state.busy?'Calculating…':!after?'—':after.reachable?`${fmt(after.time)} min`:'No route';
    el('miami-change').className='miami-change neutral';
    if(state.busy){el('miami-change').textContent='Rerouting the same drivers…';el('miami-result-note').textContent='Initial estimate stays fixed.';}
    else if(after&&!after.reachable){el('miami-change').textContent='Trips disconnected';el('miami-result-note').textContent='No time savings counted. Restore a street to reconnect the trip.';el('miami-insight').textContent='These closures disconnect the origin and destination within this study area. A missing trip is not a faster trip.';}
    else if(before&&after){
      const delta=before.time-after.time,significant=Math.abs(delta)>.01;
      el('miami-change').textContent=significant?`${fmt(Math.abs(delta)<1?Math.abs(delta)*60:Math.abs(delta))} ${Math.abs(delta)<1?'sec':'min'} ${delta>0?'faster':'slower'}`:'No meaningful change';
      el('miami-change').className='miami-change '+(delta<-.01?'worse':delta>.01?'':'neutral');
      el('miami-result-note').textContent=`${fmt(Math.abs(delta)/before.time*100)}% ${delta>=0?'less':'more'} travel time · ${state.closed.size} closed segment${state.closed.size===1?'':'s'}.`;
      if(!after.converged)el('miami-result-note').textContent+=' Approximate result; equilibrium tolerance not reached.';
      el('miami-insight').textContent=!state.closed.size?'Your initial estimate is locked. Select a street to test its removal. Red and yellow reflect modeled demand, not live traffic.':delta>.01&&after.converged?'A modeled Braess effect: removing this route option redistributed drivers and reduced average trip time at the same demand. This uses synthetic assumptions, not measured Miami traffic.':delta<-.01?'This closure makes the remaining routes slower. Braess’s paradox only occurs under particular network and demand conditions.':'The remaining routes deliver nearly the same travel time. Removing a street does not always create a Braess benefit.';
    }
    el('closure-count').textContent=String(state.closed.size);
    el('closed-streets').replaceChildren();
    for(const id of state.closed){const s=MIAMI_DATA[area].segments.find(s=>s.id===id),li=document.createElement('li'),label=document.createElement('span'),button=document.createElement('button');label.textContent=`${s.name} · #${id}`;button.textContent='Restore';button.setAttribute('aria-label',`Restore ${s.name} segment ${id}`);button.disabled=state.busy;button.onclick=()=>toggleClosure(id);li.append(label,button);el('closed-streets').append(li);}
    el('restore-streets').disabled=!state.closed.size||state.busy;el('street-picker').disabled=state.busy;
    renderSelection();paint();
  }
  function toggleClosure(id) {const state=states[area];if(state.busy)return;if(state.closed.has(id))state.closed.delete(id);else state.closed.add(id);calculate();}
  function calculate() {
    const state=states[area],id=++request;state.request=id;state.busy=true;render();
    const payload={id,area,closed:[...state.closed]};
    if(worker)worker.postMessage(payload);
    else setTimeout(()=>{try{receive({data:{...payload,result:MiamiTraffic.solve(MIAMI_DATA[payload.area],payload.closed)}});}catch(error){receive({data:{...payload,error:error.message}});}},20);
  }
  function receive({data}) {
    const state=states[data.area];if(state.request!==data.id)return;
    state.busy=false;
    if(data.error){if(data.area===area){el('map-status').textContent='Calculation failed. Restore streets and try again.';render();}return;}
    state.result=data.result;if(!state.baseline)state.baseline=data.result;
    if(data.area===area){if(el('map-status').textContent==='Loading Miami streets…')el('map-status').textContent='';render();}
  }
  el('neighborhood').addEventListener('change',()=>{map?.closePopup();area=el('neighborhood').value;drawArea();});
  el('street-picker').addEventListener('change',()=>{selectStreet(el('street-picker').value);if(selected)map.fitBounds(layers.get(selected.id).getBounds(),{maxZoom:17,padding:[70,70],animate:false});});
  el('delete-street').addEventListener('click',()=>{if(selected)toggleClosure(selected.id);});
  el('restore-streets').addEventListener('click',()=>{if(states[area].busy)return;states[area].closed.clear();calculate();});
  el('example-street').addEventListener('click',()=>{const s=MIAMI_DATA[area].segments.find(s=>s.id===MIAMI_DATA[area].demo.segment);map.fitBounds(layers.get(s.id).getBounds(),{maxZoom:17,padding:[70,70],animate:false});selectStreet(s.id,layers.get(s.id).getBounds().getCenter());});
})();
