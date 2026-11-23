import { useState } from 'react'
import { useData } from '../lib/data'
import { currentMonth, huf, monthEnd, monthStart } from '../lib/format'
import { budgetFor, expenseByCategory } from '../lib/stats'
import { must, supabase } from '../lib/supabase'

export default function Budget() {
  const { categories, budgets, txs, catMap, reload } = useData()
  const [month, setMonth] = useState(currentMonth())
  const spent = new Map(expenseByCategory(txs, catMap, monthStart(month), monthEnd(month)))
  const expenseCats = categories.filter(c => c.kind === 'expense')

  async function save(categoryId: string, monthValue: string | null, raw: string) {
    const existing = budgets.find(b => b.category_id === categoryId && b.month === monthValue)
    if (raw.trim() === '') {
      if (existing) must(await supabase.from('budgets').delete().eq('id', existing.id))
    } else {
      const amount = Number(raw)
      if (!(amount >= 0)) return
      if (existing) must(await supabase.from('budgets').update({ amount }).eq('id', existing.id))
      else must(await supabase.from('budgets').insert({ category_id: categoryId, month: monthValue, amount }))
    }
    await reload()
  }

  let totalBudget = 0, totalSpent = 0
  const rows = expenseCats.map(c => {
    const limit = budgetFor(budgets, c.id, month)
    const s = spent.get(c.id) ?? 0
    if (limit !== null) { totalBudget += Number(limit); totalSpent += s }
    return { c, limit, s }
  })

  return (
    <>
      <h1>Havi budget</h1>
      <div className="card row">
        <label>Hónap<input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} /></label>
        <span className="muted">Keretes kategóriák: {huf(totalSpent)} / {huf(totalBudget)}</span>
      </div>
      <div className="card list">
        {rows.map(({ c, limit, s }) => {
          const def = budgets.find(b => b.category_id === c.id && b.month === null)
          const ovr = budgets.find(b => b.category_id === c.id && b.month === monthStart(month))
          const pct = limit ? (s / Number(limit)) * 100 : 0
          return (
            <div key={c.id + month} className="list-item">
              <div className="line">
                <span className="title">{c.name}</span>
                <span className={`amount ${limit !== null && s > Number(limit) ? 'neg' : ''}`}>
                  {huf(s)}{limit !== null && <span className="muted"> / {huf(Number(limit))}</span>}
                </span>
              </div>
              {limit !== null && <>
                <div className={`bar ${pct > 100 ? 'over' : ''}`}><div style={{ width: `${Math.min(100, pct)}%` }} /></div>
                <span className={`small ${pct > 100 ? 'neg' : 'muted'}`}>
                  {pct > 100 ? `Túllépés: ${huf(s - Number(limit))}` : `Maradt: ${huf(Number(limit) - s)}`}</span>
              </>}
              <div className="inline-inputs small">
                <label>Alap keret<input type="number" inputMode="numeric" min={0} defaultValue={def?.amount ?? ''} placeholder="—"
                  onBlur={e => e.target.value !== String(def?.amount ?? '') && save(c.id, null, e.target.value)} /></label>
                <label>Csak ebben a hónapban<input type="number" inputMode="numeric" min={0} defaultValue={ovr?.amount ?? ''} placeholder="alap"
                  onBlur={e => e.target.value !== String(ovr?.amount ?? '') && save(c.id, monthStart(month), e.target.value)} /></label>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
