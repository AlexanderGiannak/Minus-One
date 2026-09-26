"""Build small neighborhood graphs from Miami-Dade GeoStreets GeoJSON.
Usage: python3 scripts/prepare-streets.py /tmp/miami-streets*.geojson
Direction, speeds, capacities and demand are explicitly synthetic.
"""
import json, math, sys
from pathlib import Path
features={}
for path in sys.argv[1:]:
    data=json.load(open(path))
    for f in data['features']: features[f['id']]=f
areas={
 'downtown':('Downtown',(-80.200,25.770,-80.185,25.785)),
 'brickell':('Brickell',(-80.205,25.753,-80.187,25.770)),
 'overtown':('Overtown',(-80.210,25.782,-80.197,25.798)),
 'wynwood':('Wynwood',(-80.205,25.798,-80.192,25.813)),
}
def length(coords):
    return sum(math.hypot((b[0]-a[0])*100200,(b[1]-a[1])*111200) for a,b in zip(coords,coords[1:]))
result={}
for key,(name,box) in areas.items():
    nodes=[]; index={};segments=[];edges=[]
    def node(coord):
        # Snap sub-meter precision differences between centerline endpoints.
        k=tuple(round(v,5) for v in coord)
        if k not in index:index[k]=len(nodes);nodes.append([coord[1],coord[0]])
        return index[k]
    for f in features.values():
        p=f['properties'];street=' '.join(str(p.get(k) or '') for k in ['PRE_DIR','ST_NAME','ST_TYPE','SUF_DIR']).strip()
        if not p.get('ST_NAME') or p.get('ST_TYPE') in ['RAMP','EXPY','XWAY'] or 'I-95' in street or 'I 95' in street:continue
        g=f['geometry'];paths=[g['coordinates']] if g['type']=='LineString' else g['coordinates']
        for part,coords in enumerate(paths):
            if not all(box[0]<=c[0]<=box[2] and box[1]<=c[1]<=box[3] for c in [coords[0],coords[-1]]):continue
            meters=length(coords)
            if meters<8:continue
            u,v=node(coords[0]),node(coords[-1])
            if u==v:continue
            sid=str(f['id'])+'-'+str(part)
            capacity=650 if p.get('ST_TYPE') in ['AVE','BLVD'] else 400
            a=round(meters/500+.12,5)
            segments.append({'id':sid,'name':street,'from':u,'to':v,'length':round(meters),'capacity':capacity,'path':[[round(c[1],7),round(c[0],7)] for c in coords]})
            for start,end in [(u,v),(v,u)]:edges.append({'from':start,'to':end,'segment':sid,'a':a,'b':round(a*3/capacity,8)})
    # Retain the largest connected component; omitted fragments are not routable.
    adj=[[] for n in nodes]
    for e in edges:adj[e['from']].append(e['to'])
    components=[];seen=set()
    for start in range(len(nodes)):
        if start in seen:continue
        stack=[start];seen.add(start);component=[]
        while stack:
            u=stack.pop();component.append(u)
            for v in adj[u]:
                if v not in seen:seen.add(v);stack.append(v)
        components.append(component)
    keep=set(max(components,key=len));mapping={old:i for i,old in enumerate(sorted(keep))}
    segments=[s for s in segments if s['from'] in keep and s['to'] in keep]
    edges=[e for e in edges if e['from'] in keep and e['to'] in keep]
    for e in segments+edges:e['from']=mapping[e['from']];e['to']=mapping[e['to']]
    nodes=[n for i,n in enumerate(nodes) if i in keep]
    origin=min(range(len(nodes)),key=lambda i:nodes[i][0]+nodes[i][1])
    target=max(range(len(nodes)),key=lambda i:nodes[i][0]+nodes[i][1])
    result[key]={'name':name,'nodes':nodes,'segments':segments,'edges':edges,'demand':[{'from':origin,'to':target,'flow':1400}],'bounds':[[box[1],box[0]],[box[3],box[2]]]}
    print(key,len(nodes),'nodes',len(segments),'segments')
out=Path(__file__).resolve().parents[1]/'dist'/'miami-data.js'
out.write_text('/* Miami-Dade GeoStreets, downloaded 2026-09-26. Synthetic traffic assumptions. */\nconst MIAMI_DATA = '+json.dumps(result,separators=(',',':'))+';\nif(typeof module!=="undefined") module.exports=MIAMI_DATA;\n')
