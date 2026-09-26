// The Paradox tab: the 4-node Braess network with a demand slider and a shortcut
// toggle. Ported from emmanguyen1's simulator (emma1 branch, app.js + index.html).
import { useEffect, useMemo, useRef, useState } from 'react'
import { equilibrium } from '../solver/braessClosedForm'

const format = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 })
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface Particle { dot: SVGCircleElement; road: SVGPathElement; length: number; offset: number }

export default function ParadoxPanel() {
  const [demand, setDemand] = useState(4000)
  const [shortcut, setShortcut] = useState(true)
  const [paused, setPaused] = useState(reducedMotion)
  const roads = useRef<(SVGPathElement | null)[]>([])
  const cars = useRef<SVGGElement>(null)
  const particles = useRef<Particle[]>([])
  const phase = useRef(0)
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])

  const open = useMemo(() => equilibrium(demand, true), [demand])
  const closed = useMemo(() => equilibrium(demand, false), [demand])
  const state = shortcut ? open : closed
  const delta = open.time - closed.time

  // Follow the OS reduced-motion setting when it changes.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (e: MediaQueryListEvent) => setPaused(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Rebuild the moving dots whenever flows change.
  useEffect(() => {
    const g = cars.current
    if (!g) return
    g.replaceChildren()
    particles.current = []
    state.edges.forEach((flow, i) => {
      const road = roads.current[i]
      if (!flow || !road) return
      const length = road.getTotalLength()
      const count = Math.max(2, Math.round(flow / 240))
      for (let j = 0; j < count; j++) {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        dot.setAttribute('r', '3.4')
        dot.setAttribute('fill', i === 4 ? '#c3dcff' : '#f1ffff')
        g.append(dot)
        particles.current.push({ dot, road, length, offset: j / count })
      }
    })
    positionParticles()
  }, [state])

  function positionParticles() {
    for (const p of particles.current) {
      const point = p.road.getPointAtLength(((phase.current / p.length + p.offset) % 1) * p.length)
      p.dot.setAttribute('cx', String(point.x))
      p.dot.setAttribute('cy', String(point.y))
    }
  }

  useEffect(() => {
    let last = 0
    let frame = requestAnimationFrame(function animate(time) {
      if (!pausedRef.current && last) {
        phase.current += Math.min(time - last, 50) * 0.035
        positionParticles()
      }
      last = time
      frame = requestAnimationFrame(animate)
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  const densityLabel = demand === 0 ? 'Empty' : demand < 3000 ? 'Light' : demand < 7000 ? 'Moderate' : 'Heavy'
  const changeDetail = demand === 0
    ? 'Add drivers to begin the experiment'
    : delta === 0
      ? 'Closing the shortcut makes no difference'
      : `${format((Math.abs(delta) / open.time) * 100)}% ${delta > 0 ? 'less' : 'more'} travel time per driver`
  const insight = demand === 0
    ? 'No drivers, no congestion. Increase density to see routes fill up.'
    : delta < 0
      ? 'At low demand, the shortcut really helps. Closing it forces drivers onto longer outer routes.'
      : delta === 0
        ? demand >= 9000
          ? 'At this density, nobody uses the shortcut—even when it is open. Closing it changes nothing.'
          : 'At this density, both networks have the same average travel time.'
        : shortcut
          ? 'The shortcut draws drivers onto both congestible roads. Closing it spreads traffic across the two outer routes and lowers average travel time.'
          : 'Drivers now split evenly between the upper and lower routes. Each uses just one congestible road, so the average trip is faster.'
  const description = `${format(demand)} vehicles per hour. Shortcut ${shortcut ? 'open' : 'closed'}. ${demand ? `Average trip ${format(state.time)} minutes.` : 'No trips.'} Upper route ${format(state.outer)}, shortcut route ${format(state.cross)}, lower route ${format(state.outer)} vehicles per hour.`
  const roadPaths = ['M90 230 L370 85', 'M370 85 L710 230', 'M90 230 L430 375', 'M430 375 L710 230', 'M370 85 L430 375']
  const flowStyle = (i: number) => ({ opacity: state.edges[i] || i === 4 ? 1 : 0.35 })

  return (
    <main id="simulator-panel" role="tabpanel" aria-labelledby="tab-paradox">
      <aside>
        <div className="eyebrow">THE SHORTCUT EXPERIMENT</div>
        <h1>One less road. <br />A faster trip?</h1>
        <p className="intro">Change the traffic. Close the shortcut. Watch drivers find their fastest routes.</p>
        <section className="control">
          <div className="label-row"><label htmlFor="density">Traffic density</label><span>{densityLabel}</span></div>
          <div className="demand"><output htmlFor="density">{format(demand)}</output><span>vehicles / hour</span></div>
          <input id="density" type="range" min={0} max={12000} step={100} value={demand}
            aria-describedby="density-help" aria-valuetext={`${format(demand)} vehicles per hour`}
            onChange={(e) => setDemand(Number(e.target.value))} />
          <div className="range-labels"><span>Empty</span><span>Heavy</span></div>
          <p id="density-help" className="micro">Density controls how many drivers enter the network each hour.</p>
        </section>
        <section className="control shortcut-control">
          <div><label htmlFor="shortcut">Shortcut</label><p className="micro">{shortcut ? 'Open · A → B' : 'Closed · outer routes only'}</p></div>
          <label className="switch">
            <input id="shortcut" type="checkbox" role="switch" checked={shortcut} aria-label="Open shortcut"
              onChange={(e) => setShortcut(e.target.checked)} />
            <span className="switch-track" />
          </label>
        </section>
        <section className={`result ${delta < 0 ? 'worse' : delta === 0 ? 'neutral' : ''}`} aria-live="polite" aria-atomic="true">
          <div className="eyebrow">{shortcut ? 'IF YOU CLOSE THE SHORTCUT' : 'WITH THE SHORTCUT CLOSED'}</div>
          <div className="change"><span>{format(Math.abs(delta))}</span><span>{delta > 0 ? 'min faster' : delta < 0 ? 'min slower' : 'min change'}</span></div>
          <p>{changeDetail}</p>
          <div className="comparison">
            <div><span>Shortcut open</span><strong>{demand ? `${format(open.time)} min` : 'No trips'}</strong></div>
            <div><span>Shortcut closed</span><strong>{demand ? `${format(closed.time)} min` : 'No trips'}</strong></div>
          </div>
        </section>
        <p className="assumption">Same drivers. Same destinations. Only the shortcut changes.</p>
      </aside>

      <section className="stage" aria-labelledby="network-heading">
        <div className="stage-top">
          <div><div className="eyebrow">LIVE EQUILIBRIUM</div><h2 id="network-heading">The road network</h2></div>
          <div className="current"><span>Average trip</span><strong>{demand ? <>{format(state.time)} <small>min</small></> : '—'}</strong></div>
        </div>
        <div className="network-wrap">
          <svg viewBox="0 0 800 460" role="img" aria-labelledby="network-title network-description">
            <title id="network-title">Four-intersection Braess network</title>
            <desc id="network-description">{description}</desc>
            <defs><pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#263440" /></pattern></defs>
            <rect width="800" height="460" fill="url(#grid)" />
            <g className="roads">
              {roadPaths.map((d, i) => (
                <path key={i} id={`road${i}`} d={d} ref={(el) => { roads.current[i] = el }} style={flowStyle(i)}
                  className={i === 4 && !shortcut ? 'closed' : undefined} />
              ))}
            </g>
            <g ref={cars} aria-hidden="true" />
            <g className="edge-label">
              <g transform="translate(177 100)"><rect x="-62" y="-24" width="124" height="51" rx="8" /><text y="-3">{format(state.variableTime)} min →</text><text className="flow" y="16">{format(state.edges[0])} veh/h</text></g>
              <g transform="translate(581 102)"><rect x="-62" y="-24" width="124" height="51" rx="8" /><text y="-3">45 min →</text><text className="flow" y="16">{format(state.edges[1])} veh/h</text></g>
              <g transform="translate(208 370)"><rect x="-62" y="-24" width="124" height="51" rx="8" /><text y="-3">45 min →</text><text className="flow" y="16">{format(state.edges[2])} veh/h</text></g>
              <g transform="translate(622 351)"><rect x="-62" y="-24" width="124" height="51" rx="8" /><text y="-3">{format(state.variableTime)} min →</text><text className="flow" y="16">{format(state.edges[3])} veh/h</text></g>
              <g transform="translate(474 218)"><rect x="-60" y="-25" width="120" height="70" rx="8" /><text y="-5">{shortcut ? 'SHORTCUT ↓' : 'CLOSED'}</text><text y="16">{shortcut ? '0 min' : 'No access'}</text><text className="flow" y="34">{format(state.edges[4])} veh/h</text></g>
            </g>
            <g className="nodes">
              <circle cx="90" cy="230" r="24" /><circle cx="370" cy="85" r="22" /><circle cx="430" cy="375" r="22" /><circle cx="710" cy="230" r="24" />
              <text x="90" y="236">S</text><text x="370" y="91">A</text><text x="430" y="381">B</text><text x="710" y="236">T</text>
            </g>
            <g className="node-label"><text x="90" y="282">START</text><text x="710" y="282">FINISH</text></g>
          </svg>
        </div>
        <div className="legend">
          <span><i className="variable" />Congestible road · flow ÷ 100 min</span>
          <span><i className="fixed" />Fixed road · 45 min</span>
          <button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? 'Play motion' : 'Pause motion'}</button>
        </div>
        <div className="insight"><span className="insight-symbol">↳</span><p>{insight}</p></div>
        <div className="routes">
          {(['Upper route', 'Shortcut route', 'Lower route'] as const).map((label, i) => {
            const share = demand ? (state.routes[i] / demand) * 100 : 0
            return (
              <div key={label}>
                <span>{label} <small>{['S → A → T', 'S → A → B → T', 'S → B → T'][i]}</small></span>
                <strong>{format(share)}%</strong>
                <div className="bar"><i style={{ width: `${share}%` }} /></div>
              </div>
            )
          })}
        </div>
        <footer>Illustrative network, not Miami street data. Travel times are exact for this simplified route-choice model. Moving dots illustrate flow, not individual trip durations.</footer>
      </section>
    </main>
  )
}
