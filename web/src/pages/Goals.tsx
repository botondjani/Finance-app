import { useState } from 'react'
import { useData } from '../lib/data'
import { huf, todayIso } from '../lib/format'
import { accountBalances, goalProgress } from '../lib/stats'
import { must, supabase } from '../lib/supabase'

export function GoalList() {
  const { goals, accounts, txs, accMap, reload } = useData()
  const balances = accountBalances(accounts, txs)
  if (!goals.length) return <p className="muted">Még nincs megtakarítási cél.</p>
  return (
    <>
      {goals.map(g => {
        const bal = balances.get(g.account_id) ?? 0
        const p = goalProgress(Number(g.target_amount), bal, g.deadline, todayIso())
        return (
          <div key={g.id} style={{ marginBottom: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b>{g.name}</b>
              <span className="small muted">{accMap.get(g.account_id)?.name}{g.deadline && ` · határidő: ${g.deadline}`}</span>
            </div>
            <div className="bar"><div style={{ width: `${p.pct}%` }} /></div>
            <div className="small muted">
              {huf(bal)} / {huf(Number(g.target_amount))} ({p.pct.toFixed(0)}%)
              {p.remaining > 0 ? ` · hiányzik ${huf(p.remaining)}` : ' · elérve 🎉'}
              {p.monthly !== null && ` · havonta ${huf(p.monthly)} kell`}
              {' '}<button className="link danger" onClick={async () => {
                if (confirm(`Törlöd: ${g.name}?`)) { must(await supabase.from('goals').delete().eq('id', g.id)); await reload() }
              }}>Törlés</button>
            </div>
          </div>
        )
      })}
    </>
  )
}

export default function Goals() {
  const { accounts, reload } = useData()
  const [g, setG] = useState({ name: '', target: '', account_id: '', deadline: '' })
  const [error, setError] = useState<string | null>(null)

  async function add() {
    setError(null)
    if (!g.name || !(Number(g.target) > 0) || !g.account_id) return setError('Név, pozitív célösszeg és számla kell.')
    must(await supabase.from('goals').insert({ name: g.name, target_amount: Number(g.target), account_id: g.account_id, deadline: g.deadline || null }))
    setG({ name: '', target: '', account_id: '', deadline: '' }); await reload()
  }

  return (
    <>
      <h1>Megtakarítási célok</h1>
      <p className="muted small">Egy cél haladása a hozzá rendelt számla egyenlege.</p>
      <div className="card"><GoalList /></div>
      <div className="card">
        <h2>Új cél</h2>
        <div className="row">
          <label>Név<input value={g.name} onChange={e => setG({ ...g, name: e.target.value })} placeholder="pl. Autó" /></label>
          <label>Célösszeg (Ft)<input type="number" min={1} value={g.target} onChange={e => setG({ ...g, target: e.target.value })} /></label>
          <label>Számla<select value={g.account_id} onChange={e => setG({ ...g, account_id: e.target.value })}>
            <option value="">Válassz…</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></label>
          <label>Határidő (opcionális)<input type="date" value={g.deadline} onChange={e => setG({ ...g, deadline: e.target.value })} /></label>
          <button className="primary" onClick={add}>Hozzáadás</button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </>
  )
}
