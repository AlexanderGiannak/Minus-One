// Assumptions tab: every modeling assumption (copy of pipeline/config.yaml).
import { useEffect, useState } from 'react'
import { getJson } from '../data'
import type { Assumptions } from '../types/contract'

export default function AssumptionsPanel() {
  const [assumptions, setAssumptions] = useState<Assumptions>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    getJson<Assumptions>('assumptions.json').then(setAssumptions).catch((e: Error) => setError(e.message))
  }, [])

  return (
    <main className="plain" role="tabpanel" aria-labelledby="tab-assumptions">
      <div className="eyebrow">ASSUMPTIONS</div>
      <h1>What the model assumes</h1>
      {assumptions?.meta.fake && <p className="banner">FAKE fixture data: placeholder numbers, not results.</p>}
      {error && <p className="banner">Could not load data: {error}</p>}
      {assumptions && <pre>{JSON.stringify(assumptions.config, null, 2)}</pre>}
    </main>
  )
}
