import { useRef, useState, type KeyboardEvent } from 'react'
import AssumptionsPanel from './panels/AssumptionsPanel'
import MiamiPanel from './panels/MiamiPanel'
import ParadoxPanel from './panels/ParadoxPanel'
import SandboxPanel from './panels/SandboxPanel'

const TABS = [
  { id: 'paradox', label: 'The Paradox' },
  { id: 'sandbox', label: 'Sandbox' },
  { id: 'miami', label: 'Miami' },
  { id: 'assumptions', label: 'Assumptions' },
] as const
type TabId = (typeof TABS)[number]['id']

export default function App() {
  const [tab, setTab] = useState<TabId>('paradox')
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  // Arrow keys / Home / End move between tabs (WAI-ARIA tabs pattern).
  function onKeyDown(e: KeyboardEvent, index: number) {
    const last = TABS.length - 1
    const next = { ArrowLeft: index ? index - 1 : last, ArrowRight: index === last ? 0 : index + 1, Home: 0, End: last }[e.key]
    if (next === undefined) return
    e.preventDefault()
    setTab(TABS[next].id)
    buttons.current[next]?.focus()
  }

  return (
    <>
      <header>
        <a className="brand" href="./"><span className="brand-mark">−1</span> MINUS ONE <span className="brand-detail">/ BRAESS LAB</span></a>
        <span className="header-note">SHELLHACKS 2026 · PROOF OF CONCEPT</span>
      </header>
      <nav className="page-tabs" role="tablist" aria-label="Sections">
        {TABS.map((t, i) => (
          <button key={t.id} id={`tab-${t.id}`} role="tab" aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1}
            ref={(el) => { buttons.current[i] = el }} onClick={() => setTab(t.id)} onKeyDown={(e) => onKeyDown(e, i)}>
            {t.label}
          </button>
        ))}
      </nav>
      {/* Paradox and Sandbox stay mounted so animation state and sandbox closures persist across tabs. */}
      <div hidden={tab !== 'paradox'}><ParadoxPanel /></div>
      <SandboxPanel active={tab === 'sandbox'} />
      {tab === 'miami' && <MiamiPanel />}
      {tab === 'assumptions' && <AssumptionsPanel />}
    </>
  )
}
