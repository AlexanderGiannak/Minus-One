// Miami tab: precomputed pipeline results. TODO: LinkMap (src/map) and diff view.
import { useEffect, useState } from 'react'
import { getJson } from '../data'
import type { Base, Candidates } from '../types/contract'

export default function MiamiPanel() {
  const [base, setBase] = useState<Base>()
  const [cands, setCands] = useState<Candidates>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    Promise.all([getJson<Base>('base.json'), getJson<Candidates>('candidates.json')])
      .then(([b, c]) => { setBase(b); setCands(c) })
      .catch((e: Error) => setError(e.message))
  }, [])

  return (
    <main className="plain" role="tabpanel" aria-labelledby="tab-miami">
      <div className="eyebrow">MIAMI · PRECOMPUTED</div>
      <h1>Candidates for study</h1>
      {(base?.meta.fake || cands?.meta.fake) && (
        <p className="banner">FAKE fixture data: placeholder numbers, not results.</p>
      )}
      {error && <p className="banner">Could not load data: {error}</p>}
      {base && (
        <p>
          TSTT (UE) {base.tstt_ue.toLocaleString()} veh-min · TSTT (SO) {base.tstt_so.toLocaleString()} veh-min ·
          price of anarchy {base.price_of_anarchy}
        </p>
      )}
      <p className="micro">TODO: map (src/map) with the flow diff for each candidate.</p>
      {cands && (
        <ul className="candidate-list">
          {cands.candidates.map((c) => (
            <li key={c.link_id}>
              {c.link_id}: ΔTSTT {c.delta_tstt} veh-min ({c.delta_pct}%), SNR {c.snr}
              {c.flagged ? ' · flagged' : ''}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
