import { useEffect, useState } from 'react'
import type { Assumptions, Base, Candidates } from './types/contract'

// Minimal shell: tabs + fixture loading. Panels live in src/panels (TODO).
const TABS = ['The Paradox', 'Sandbox', 'Miami', 'Assumptions'] as const
type Tab = (typeof TABS)[number]

async function getJson<T>(name: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}`)
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export default function App() {
  const [tab, setTab] = useState<Tab>('The Paradox')
  const [base, setBase] = useState<Base>()
  const [cands, setCands] = useState<Candidates>()
  const [assumptions, setAssumptions] = useState<Assumptions>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    Promise.all([
      getJson<Base>('base.json'),
      getJson<Candidates>('candidates.json'),
      getJson<Assumptions>('assumptions.json'),
    ])
      .then(([b, c, a]) => { setBase(b); setCands(c); setAssumptions(a) })
      .catch((e: Error) => setError(e.message))
  }, [])

  return (
    <main>
      <h1>Minus One</h1>
      {base?.meta.fake && (
        <p className="banner">FAKE fixture data: placeholder numbers, not results.</p>
      )}
      {error && <p className="banner">Could not load data: {error}</p>}
      <nav>
        {TABS.map((t) => (
          <button key={t} aria-pressed={t === tab} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>

      {tab === 'The Paradox' && <p>TODO: 4-node Braess demo (src/panels, src/solver).</p>}
      {tab === 'Sandbox' && <p>TODO: editable small network.</p>}

      {tab === 'Miami' && base && cands && (
        <section>
          <p>
            TSTT (UE) {base.tstt_ue.toLocaleString()} veh-min · TSTT (SO){' '}
            {base.tstt_so.toLocaleString()} veh-min · price of anarchy {base.price_of_anarchy}
          </p>
          <p>TODO: map (src/map). Candidates for study:</p>
          <ul>
            {cands.candidates.map((c) => (
              <li key={c.link_id}>
                {c.link_id}: ΔTSTT {c.delta_tstt} veh-min ({c.delta_pct}%), SNR {c.snr}
                {c.flagged ? ' · flagged' : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'Assumptions' && assumptions && (
        <pre>{JSON.stringify(assumptions.config, null, 2)}</pre>
      )}
    </main>
  )
}
