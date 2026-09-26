// Sandbox tab: close streets in four small Miami neighborhoods and re-solve.
// Real Miami-Dade street geometry, SYNTHETIC traffic costs chosen to exhibit
// Braess effects. Teaching examples only, never Miami findings.
// Ported from emmanguyen1's "Miami Streets" tab (emma1 branch, miami.js),
// with Leaflet + online OSM tiles replaced by MapLibre and no basemap (offline).
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GeoJSONSource, LngLatLike, Map as MlMap } from 'maplibre-gl'
import { maplibregl } from '../map/maplibre'
import { solve, type AffineResult } from '../solver/pathEquilibration'
import type { Neighborhood, Neighborhoods, Segment } from '../sandbox/types'
import type { SolveRequest } from '../sandbox/sandbox.worker'

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })
const COLORS = { high: '#e53935', medium: '#e6aa00', low: '#16856b', closed: '#657583' }
const AREAS = [['downtown', 'Downtown'], ['brickell', 'Brickell'], ['overtown', 'Overtown'], ['wynwood', 'Wynwood']] as const

interface AreaState {
  closed: Set<string>
  baseline: AffineResult | null
  result: AffineResult | null
  busy: boolean
  request: number
}
type WorkerReply = { id: number; area: string; result?: AffineResult; error?: string }

const lngLat = ([lat, lon]: [number, number]): [number, number] => [lon, lat]
const toBounds = (b: Neighborhood['bounds']): [[number, number], [number, number]] => [[b[0][1], b[0][0]], [b[1][1], b[1][0]]]
function segmentBounds(s: Segment): [[number, number], [number, number]] {
  const lons = s.path.map((p) => p[1]), lats = s.path.map((p) => p[0])
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]]
}

function metrics(n: Neighborhood, st: AreaState, segment: Segment) {
  let flow = 0
  n.edges.forEach((e, i) => { if (e.segment === segment.id) flow += st.result?.flows[i] ?? 0 })
  const density = flow / segment.capacity
  return { flow, density, level: density >= 1 ? 'high' as const : density >= 0.5 ? 'medium' as const : 'low' as const }
}

export default function SandboxPanel({ active }: { active: boolean }) {
  const [data, setData] = useState<Neighborhoods | null>(null)
  const [status, setStatus] = useState('Loading Miami streets…')
  const [area, setArea] = useState('downtown')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Per-neighborhood closures and results. Kept in React state for rendering;
  // statesRef mirrors it for event handlers and map callbacks.
  const [states, setStates] = useState<Record<string, AreaState>>({})
  const statesRef = useRef(states)
  useEffect(() => { statesRef.current = states }, [states])
  const request = useRef(0)
  const latestRequest = useRef<Record<string, number>>({})
  const worker = useRef<Worker | null>(null)
  const mapEl = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const markers = useRef<maplibregl.Marker[]>([])
  const popup = useRef<maplibregl.Popup | null>(null)
  const hover = useRef<maplibregl.Popup | null>(null)

  // Load the neighborhood graphs.
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}sandbox/neighborhoods.json`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d: Neighborhoods) => {
        setStates(Object.fromEntries(Object.entries(d).map(([key, n]) => [key, {
          closed: new Set<string>(), baseline: n.baseline ?? null, result: n.baseline ?? null, busy: false, request: 0,
        }])))
        setData(d)
        setStatus('')
      })
      .catch((e: Error) => setStatus(`Could not load street data: ${e.message}`))
  }, [])

  const receive = useCallback((reply: WorkerReply) => {
    if (latestRequest.current[reply.area] !== reply.id) return // superseded by a newer request
    if (reply.error || !reply.result) setStatus('Calculation failed. Restore streets and try again.')
    setStates((prev) => {
      const st = prev[reply.area]
      if (!st || st.request !== reply.id) return prev
      const next: AreaState = { ...st, busy: false }
      if (reply.result) {
        next.result = reply.result
        if (!next.baseline) next.baseline = reply.result
      }
      return { ...prev, [reply.area]: next }
    })
  }, [])

  const calculate = useCallback((key: string, closed: Set<string>) => {
    if (!data) return
    const id = ++request.current
    latestRequest.current[key] = id
    setStates((prev) => ({ ...prev, [key]: { ...prev[key], closed, busy: true, request: id } }))
    const payload: SolveRequest = { id, area: key, network: data[key], closed: [...closed] }
    if (worker.current) worker.current.postMessage(payload)
    else setTimeout(() => {
      try { receive({ id, area: key, result: solve(payload.network, payload.closed) }) }
      catch (error) { receive({ id, area: key, error: (error as Error).message }) }
    }, 20)
  }, [data, receive])

  const calcRef = useRef(calculate)
  useEffect(() => { calcRef.current = calculate }, [calculate])

  // Worker with a synchronous fallback, as in the original.
  useEffect(() => {
    try {
      const w = new Worker(new URL('../sandbox/sandbox.worker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (e: MessageEvent<WorkerReply>) => receive(e.data)
      w.onerror = () => {
        w.terminate()
        worker.current = null
        setStatus('Using the local calculation fallback.')
        // Re-run anything that was waiting on the worker.
        for (const [key, st] of Object.entries(statesRef.current)) if (st.busy) calcRef.current(key, st.closed)
      }
      worker.current = w
    } catch {
      worker.current = null
    }
    return () => worker.current?.terminate()
  }, [receive])

  const toggleClosure = useCallback((id: string) => {
    const st = statesRef.current[area]
    if (!st || st.busy) return
    popup.current?.remove() // its Delete/Restore label would be stale
    const closed = new Set(st.closed)
    if (closed.has(id)) closed.delete(id)
    else closed.add(id)
    calculate(area, closed)
  }, [area, calculate])
  const toggleRef = useRef(toggleClosure)
  useEffect(() => { toggleRef.current = toggleClosure }, [toggleClosure])

  const n = data?.[area]
  const st = states[area]
  const selected = n?.segments.find((s) => s.id === selectedId) ?? null

  const selectStreet = useCallback((id: string, at?: LngLatLike) => {
    setSelectedId(id || null)
    popup.current?.remove()
    const nb = data?.[area], s = nb?.segments.find((x) => x.id === id)
    const state = statesRef.current[area]
    if (!nb || !s || !state || !at || !map.current) return
    const content = document.createElement('div')
    const title = document.createElement('strong')
    const p = document.createElement('p')
    const button = document.createElement('button')
    button.className = 'popup-action'
    title.textContent = s.name
    p.textContent = `${s.length} m segment · ${state.closed.has(id) ? 'Closed' : `${metrics(nb, state, s).level} simulated density`}`
    button.textContent = state.closed.has(id) ? 'Restore street' : 'Delete street from simulation'
    button.disabled = state.busy
    button.onclick = () => { toggleRef.current(id); popup.current?.remove() }
    content.append(title, p, button)
    popup.current = new maplibregl.Popup({ closeOnClick: true }).setLngLat(at).setDOMContent(content).addTo(map.current)
  }, [area, data])

  // Keep the latest callback for map event handlers registered once.
  const selectRef = useRef(selectStreet)
  useEffect(() => { selectRef.current = selectStreet }, [selectStreet])

  // Create the map the first time the tab is shown (it needs a visible container).
  useEffect(() => {
    if (!active) return
    if (map.current) { map.current.resize(); return }
    if (!mapEl.current || !data) return
    const m = new maplibregl.Map({
      container: mapEl.current,
      style: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#dce4e6' } }] },
      center: [-80.193, 25.779],
      zoom: 15,
      attributionControl: false,
    })
    m.addControl(new maplibregl.AttributionControl({ compact: false, customAttribution: 'Street centerlines: Miami-Dade GeoStreets' }))
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }))
    m.on('load', () => {
      m.addSource('streets', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      const width: maplibregl.ExpressionSpecification = ['case', ['==', ['get', 'selected'], true], 10, 6]
      m.addLayer({ id: 'streets-open', type: 'line', source: 'streets', filter: ['!=', ['get', 'closed'], true],
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': ['to-color', ['get', 'color']], 'line-width': width, 'line-opacity': 0.9 } })
      m.addLayer({ id: 'streets-closed', type: 'line', source: 'streets', filter: ['==', ['get', 'closed'], true],
        paint: { 'line-color': COLORS.closed, 'line-width': width, 'line-opacity': 0.65, 'line-dasharray': [1, 1.5] } })
      for (const layer of ['streets-open', 'streets-closed']) {
        m.on('click', layer, (e) => {
          const id = e.features?.[0]?.properties?.id
          if (id) selectRef.current(String(id), e.lngLat)
        })
        m.on('mousemove', layer, (e) => {
          m.getCanvas().style.cursor = 'pointer'
          const name = e.features?.[0]?.properties?.name
          if (!name) return
          hover.current ??= new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 })
          hover.current.setLngLat(e.lngLat).setText(String(name)).addTo(m)
        })
        m.on('mouseleave', layer, () => { m.getCanvas().style.cursor = ''; hover.current?.remove() })
      }
      setMapReady(true)
    })
    map.current = m
  }, [active, data])

  useEffect(() => () => { map.current?.remove(); map.current = null }, [])

  // Redraw streets whenever the area, results, closures or selection change.
  useEffect(() => {
    const m = map.current
    if (!mapReady || !m || !n || !st) return
    const source = m.getSource('streets') as GeoJSONSource | undefined
    source?.setData({
      type: 'FeatureCollection',
      features: n.segments.map((s) => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: s.path.map(lngLat) },
        properties: {
          id: s.id, name: s.name, closed: st.closed.has(s.id), selected: s.id === selectedId,
          color: COLORS[metrics(n, st, s).level],
        },
      })),
    })
  })

  // On area change: markers, fit bounds, clear selection.
  useEffect(() => {
    const m = map.current
    if (!mapReady || !m || !n) return
    popup.current?.remove()
    markers.current.forEach((mk) => mk.remove())
    const trip = n.demand[0]
    markers.current = ([['S', trip.from, 'Trip origin'], ['T', trip.to, 'Trip destination']] as const).map(([label, node, title]) => {
      const el = document.createElement('div')
      el.className = 'endpoint'
      el.textContent = label
      el.title = title
      return new maplibregl.Marker({ element: el }).setLngLat(lngLat(n.nodes[node])).addTo(m)
    })
    m.fitBounds(toBounds(n.bounds), { padding: 22, animate: false })
  }, [mapReady, n])

  if (!data || !n || !st) {
    return (
      <main className="plain" role="tabpanel" aria-labelledby="tab-sandbox" hidden={!active}>
        <p>{status || 'Loading…'}</p>
      </main>
    )
  }

  const before = st.baseline, after = st.result
  let change = 'Loading street network…', changeClass = 'miami-change neutral', note = 'Same trips and demand in both scenarios.'
  let insight = 'Closing a road can help, hurt, or leave travel time unchanged. Test the network to find out.'
  if (st.busy) {
    change = 'Rerouting the same drivers…'
    note = 'Initial estimate stays fixed.'
  } else if (after && !after.reachable) {
    change = 'Trips disconnected'
    note = 'No time savings counted. Restore a street to reconnect the trip.'
    insight = 'These closures disconnect the origin and destination within this study area. A missing trip is not a faster trip.'
  } else if (before && after && before.time !== null && after.time !== null) {
    const delta = before.time - after.time, significant = Math.abs(delta) > 0.01
    const mag = Math.abs(delta)
    change = significant ? `${fmt(mag < 1 ? mag * 60 : mag)} ${mag < 1 ? 'sec' : 'min'} ${delta > 0 ? 'faster' : 'slower'}` : 'No meaningful change'
    changeClass = 'miami-change ' + (delta < -0.01 ? 'worse' : delta > 0.01 ? '' : 'neutral')
    note = `${fmt((mag / before.time) * 100)}% ${delta >= 0 ? 'less' : 'more'} travel time · ${st.closed.size} closed segment${st.closed.size === 1 ? '' : 's'}.`
    if (!after.converged) note += ' Approximate result; equilibrium tolerance not reached.'
    insight = !st.closed.size
      ? 'Your initial estimate is locked. Select a street to test its removal. Red and yellow reflect modeled demand, not live traffic.'
      : delta > 0.01 && after.converged
        ? 'A modeled Braess effect: removing this route option redistributed drivers and reduced average trip time at the same demand. This uses synthetic assumptions, not measured Miami traffic.'
        : delta < -0.01
          ? 'This closure makes the remaining routes slower. Braess’s paradox only occurs under particular network and demand conditions.'
          : 'The remaining routes deliver nearly the same travel time. Removing a street does not always create a Braess benefit.'
  }
  const selMetrics = selected ? metrics(n, st, selected) : null
  const sortedSegments = [...n.segments].sort((a, b) => a.name.localeCompare(b.name))
  const focusSegment = (s: Segment) => map.current?.fitBounds(segmentBounds(s), { maxZoom: 17, padding: 70, animate: false })

  return (
    <main id="miami-panel" role="tabpanel" aria-labelledby="tab-sandbox" hidden={!active}>
      <aside className="miami-sidebar">
        <div className="eyebrow">SANDBOX · MIAMI STREETS</div>
        <h1>Rethink the route.</h1>
        <p className="intro">Select a highlighted street segment to test a closure.</p>
        <p className="miami-model-label">Real streets · synthetic traffic · two-way model</p>
        <p className="sandbox-warning">Teaching example: traffic costs are synthetic and were tuned so each neighborhood shows a Braess effect. Results here are not findings about these Miami streets.</p>
        <label className="field-label" htmlFor="neighborhood">Neighborhood</label>
        <select id="neighborhood" value={area} onChange={(e) => { setArea(e.target.value); setSelectedId(null) }}>
          {AREAS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <section className="miami-comparison" aria-live="polite" aria-atomic="true">
          <div className="baseline"><span>Initial estimated time <small>FIXED BASELINE</small></span><strong>{before?.time != null ? `${fmt(before.time)} min` : 'Calculating…'}</strong></div>
          <div className="after"><span>After street closures</span><strong>{st.busy ? 'Calculating…' : !after ? '—' : after.reachable && after.time != null ? `${fmt(after.time)} min` : 'No route'}</strong></div>
          <div className={changeClass}>{change}</div>
          <p id="miami-result-note">{note}</p>
        </section>
        <section className="selected-street" aria-labelledby="street-title">
          <div className="eyebrow">SELECTED SEGMENT</div>
          <h2 id="street-title">{selected?.name ?? 'Choose a street'}</h2>
          <p id="street-detail">{selected && selMetrics
            ? `${selected.length} m · segment #${selected.id} · ${st.closed.has(selected.id) ? 'Closed' : `${fmt(selMetrics.flow)} vehicles/hour · ${selMetrics.level} modeled density`}`
            : 'Click a colored line on the map, or choose a segment below.'}</p>
          <label className="field-label" htmlFor="street-picker">Street segment</label>
          <select id="street-picker" value={selectedId ?? ''} disabled={st.busy} onChange={(e) => {
            const s = n.segments.find((x) => x.id === e.target.value)
            selectStreet(e.target.value)
            if (s) focusSegment(s)
          }}>
            <option value="">Choose a segment…</option>
            {sortedSegments.map((s) => <option key={s.id} value={s.id}>{`${s.name} · ${s.length} m · #${s.id}`}</option>)}
          </select>
          <button className="primary-action" disabled={!selected || st.busy} onClick={() => selected && toggleClosure(selected.id)}>
            {selected && st.closed.has(selected.id) ? 'Restore this street' : 'Delete street from simulation'}
          </button>
        </section>
        <section className="closure-section">
          <div className="label-row"><h2>Closed streets</h2><span>{st.closed.size}</span></div>
          <ul>
            {[...st.closed].map((id) => {
              const s = n.segments.find((x) => x.id === id)!
              return (
                <li key={id}>
                  <span>{`${s.name} · #${id}`}</span>
                  <button disabled={st.busy} aria-label={`Restore ${s.name} segment ${id}`} onClick={() => toggleClosure(id)}>Restore</button>
                </li>
              )
            })}
          </ul>
          <button disabled={!st.closed.size || st.busy} onClick={() => { if (!st.busy) { popup.current?.remove(); calculate(area, new Set()) } }}>Restore all streets</button>
        </section>
        <details className="model-details">
          <summary>How this estimate works</summary>
          <p>Actual Miami-Dade street centerlines, synthetic demand and road costs. Drivers choose their fastest route until the network reaches equilibrium. Every street is treated as two-way; a closure removes both modeled directions. Colors show modeled flow relative to assumed capacity, not live traffic.</p>
          <p>{`${n.nodes.length} intersections; ${n.segments.length} segments; ${fmt(n.demand.reduce((s, d) => s + d.flow, 0))} trips/hour from S to T. All centerlines are treated as two-way. Costs are synthetic affine functions, with a fixed cost plus a flow-dependent delay. Red: flow/capacity ≥ 1; yellow: ≥ 0.5; green: below 0.5. This teaching preset deliberately varies delay and congestion sensitivity to exhibit Braess’s paradox. No street costs are calibrated to observed traffic.`}</p>
          <p>Neighborhood boundaries limit detours. Real one-way rules, turn restrictions, traffic signals, queues and trip demand are not calibrated. A benefit here demonstrates the model, not a recommendation to close a Miami street.</p>
        </details>
      </aside>
      <section className="miami-stage">
        <div className="stage-top">
          <div><div className="eyebrow">STREET CLOSURE LAB</div><h2>{n.name} Miami</h2></div>
          <span className="simulation-badge">SIMULATED TRAFFIC</span>
        </div>
        <div className="map-shell">
          <div id="miami-map" ref={mapEl} aria-label="Interactive Miami street closure map" />
          <div id="map-status" role="status">{status}</div>
        </div>
        <div className="map-legend">
          <span><i className="high" />High density</span><span><i className="medium" />Medium density</span>
          <span><i className="low" />Low density</span><span><i className="closed" />Closed</span>
        </div>
        <div className="miami-insight">{insight}</div>
        <button className="example-link" onClick={() => {
          const s = n.segments.find((x) => x.id === n.demo.segment)
          if (!s) return
          focusSegment(s)
          const [[w, so], [e, no]] = segmentBounds(s)
          selectStreet(s.id, [(w + e) / 2, (so + no) / 2])
        }}>Locate an example Braess segment</button>
        <footer>Street centerlines: <a href="https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/73" target="_blank" rel="noopener">Miami-Dade GeoStreets</a>. No basemap, so the demo works offline. Educational what-if model. Each neighborhood keeps its own fixed baseline and closures.</footer>
      </section>
    </main>
  )
}
