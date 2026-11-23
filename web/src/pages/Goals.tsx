import { useState } from 'react'
import InfoTip from '../components/InfoTip'
import { useData } from '../lib/data'
import { huf, todayIso } from '../lib/format'
import { accountBalances, goalCurrent, goalProgress } from '../lib/stats'
import { must, supabase } from '../lib/supabase'
import type { Goal, GoalKind } from '../lib/types'

const KIND_LABEL: Record<GoalKind, string> = { savings: 'Megtakarítási cél', investment: 'Befektetési cél' }

export function GoalList() {
  const { goals, accounts, txs, valuations, accMap, assets, reload } = useData()
  const balances = accountBalances(accounts, txs)
  const today = todayIso()
  if (!goals.length) return <p className="muted">Még nincs célod. A Célok oldalon adhatsz hozzá.</p>

  const source = (g: Goal) => g.kind === 'savings'
    ? `${accMap.get(g.account_id ?? '')?.name ?? '?'} egyenlege`
    : g.asset_id ? `${assets.find(a => a.id === g.asset_id)?.name ?? '?'} értéke` : 'teljes portfólió értéke'

  return (
    <div className="list">
      {goals.map(g => {
        const cur = goalCurrent(g, balances, valuations, today)
        const p = goalProgress(Number(g.target_amount), cur, g.deadline, today)
        return (
          <div key={g.id} className="list-item">
            <div className="line">
              <span className="title">{g.name}</span>
              <span className="small muted">{KIND_LABEL[g.kind]}</span>
            </div>
            <div className="bar"><div style={{ width: `${p.pct}%` }} /></div>
            <div className="line small">
              <span><b>{huf(cur)}</b> / {huf(Number(g.target_amount))}</span>
              <span className={p.remaining === 0 ? 'pos' : 'muted'}>{p.remaining === 0 ? 'Elérve 🎉' : `${p.pct.toFixed(0)}%`}</span>
            </div>
            <div className="small muted">
              Mérve: {source(g)}
              {p.remaining > 0 && ` · még ${huf(p.remaining)} hiányzik`}
              {p.monthly !== null && <> · <b>havonta {huf(p.monthly)}</b> kell {g.deadline! < today ? '(a határidő lejárt)' : `${g.deadline}-ig`}</>}
            </div>
            <details className="small">
              <summary className="muted">Szerkesztés</summary>
              <div className="inline-inputs" style={{ marginTop: 8 }}>
                <label>Célösszeg (Ft)<input type="number" inputMode="numeric" defaultValue={g.target_amount}
                  onBlur={async e => { const v = Number(e.target.value); if (v > 0 && v !== Number(g.target_amount)) { must(await supabase.from('goals').update({ target_amount: v }).eq('id', g.id)); await reload() } }} /></label>
                <label>Határidő<input type="date" defaultValue={g.deadline ?? ''}
                  onBlur={async e => { if ((e.target.value || null) !== g.deadline) { must(await supabase.from('goals').update({ deadline: e.target.value || null }).eq('id', g.id)); await reload() } }} /></label>
              </div>
              <button className="link danger" onClick={async () => {
                if (confirm(`Törlöd: ${g.name}?`)) { must(await supabase.from('goals').delete().eq('id', g.id)); await reload() }
              }}>Cél törlése</button>
            </details>
          </div>
        )
      })}
    </div>
  )
}

export default function Goals() {
  const { accounts, assets, reload } = useData()
  const [kind, setKind] = useState<GoalKind>('savings')
  const [g, setG] = useState({ name: '', target: '', account_id: '', asset_id: '', deadline: '' })
  const [error, setError] = useState<string | null>(null)

  async function add() {
    setError(null)
    if (!g.name.trim()) return setError('Adj nevet a célnak (pl. „Autó”).')
    if (!(Number(g.target) > 0)) return setError('A célösszeg legyen pozitív szám.')
    if (kind === 'savings' && !g.account_id) return setError('Válaszd ki, melyik számlán gyűjtöd a pénzt.')
    must(await supabase.from('goals').insert({
      name: g.name.trim(), target_amount: Number(g.target), kind, deadline: g.deadline || null,
      account_id: kind === 'savings' ? g.account_id : null,
      asset_id: kind === 'investment' && g.asset_id ? g.asset_id : null,
    }))
    setG({ name: '', target: '', account_id: '', asset_id: '', deadline: '' }); await reload()
  }

  return (
    <>
      <h1>Célok</h1>
      <div className="card"><GoalList /></div>
      <div className="card">
        <h2>Új cél</h2>
        <div className="segmented" role="tablist">
          {(Object.keys(KIND_LABEL) as GoalKind[]).map(k => (
            <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
          ))}
        </div>
        <p className="muted small">
          {kind === 'savings'
            ? 'Pénzt gyűjtesz valamire egy számlán (pl. autó, nyaralás, vésztartalék). A haladás a kiválasztott számla egyenlege.'
            : 'Befektetéssel érnél el egy összeget (pl. 5 millió Ft portfólió). A haladás a befektetés(ek) legutóbb rögzített értéke.'}
        </p>
        <div className="inline-inputs">
          <label>Megnevezés<input value={g.name} onChange={e => setG({ ...g, name: e.target.value })} placeholder={kind === 'savings' ? 'pl. Vésztartalék' : 'pl. Nyugdíj portfólió'} /></label>
          <label>Célösszeg (Ft)<input type="number" inputMode="numeric" min={1} value={g.target} onChange={e => setG({ ...g, target: e.target.value })} /></label>
          {kind === 'savings' ? (
            <label>Melyik számlán gyűjtöd?<select value={g.account_id} onChange={e => setG({ ...g, account_id: e.target.value })}>
              <option value="">Válassz…</option>{accounts.filter(a => !a.archived).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></label>
          ) : (
            <label>Mit mérjünk?<select value={g.asset_id} onChange={e => setG({ ...g, asset_id: e.target.value })}>
              <option value="">Teljes portfólió</option>{assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></label>
          )}
          <label><span>Határidő (nem kötelező)<InfoTip>Ha megadod, kiszámolom, havonta mennyit kell félretenned, hogy időre elérd.</InfoTip></span>
            <input type="date" value={g.deadline} onChange={e => setG({ ...g, deadline: e.target.value })} /></label>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="primary" style={{ marginTop: 12 }} onClick={add}>Cél hozzáadása</button>
      </div>
    </>
  )
}
