import { useState, type ReactNode } from 'react'

/** A small ⓘ button that shows a plain-language explanation when tapped. */
export default function InfoTip({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="infotip">
      <button type="button" className="infotip-btn" aria-label="Mit jelent ez?" aria-expanded={open}
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(!open) }}>i</button>
      {open && <span className="infotip-text" role="note" onClick={() => setOpen(false)}>{children}</span>}
    </span>
  )
}
