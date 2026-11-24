import { useState } from 'react'
import { useData } from '../lib/data'
import InfoTip from '../components/InfoTip'
import { addMonths, currentMonth, huf, monthEnd, monthLabel, monthStart } from '../lib/format'
import { dataAsOf } from '../components/Insights'
import { budgetFor, expenseByCategory } from '../lib/stats'
import { must, supabase } from '../lib/supabase'
import type { Category } from '../lib/types'

interface Row { c: Category; limit: number | null; spent: number; avg: number }

export default function Budget() {
  const { categories, txs, catMap, budgets } = useData()
  const [month, setMonth] = useState(currentMonth())
  const [editing, setEditing] = useState<string | null>(null)
  const spentIn = (m: string) => new Map(expenseByCategory(txs, catMap, monthStart(m), monthEnd(m)))
  const spent = spentIn(month)
  const last3 = [1, 2, 3].map(i => spentIn(addMonths(month, -i)))

  const asOf = dataAsOf(txs.map(t => t.date))
  const pace = month === currentMonth() && asOf.startsWith(month) && +asOf.slice(8) >= 6
    ? (s: number) => s / +asOf.slice(8) * +monthEnd(month).slice(8) : null

  const rows: Row[] = categories.filter(c => c.kind === 'expense').map(c => ({
    c, limit: budgetFor(budgets, c.id, month), spent: spent.get(c.id) ?? 0,
    avg: Math.round(last3.reduce((s, m) => s + (m.get(c.id) ?? 0), 0) / 3),
  }))
  const withLimit = rows.filter(r => r.limit !== null).sort((a, b) => b.spent / b.limit! - a.spent / a.limit!)
  const without = rows.filter(r => r.limit === null).sort((a, b) => b.spent - a.spent || b.avg - a.avg)
  const totalBudget = withLimit.reduce((s, r) => s + Number(r.limit), 0)
  const totalSpent = withLimit.reduce((s, r) => s + r.spent, 0)

  return (
    <>
      <h1>Havi budget</h1>
      <p className="muted small">Adj meg kategóriánként egy havi költési keretet, és látod, mennyi maradt belőle.</p>
      <div className="month-nav">
        <button aria-label="Előző hónap" onClick={() => setMonth(addMonths(month, -1))}>‹</button>
        <span>{monthLabel(month)}</span>
        <button aria-label="Következő hónap" onClick={() => setMonth(addMonths(month, 1))}>›</button>
      </div>

      {totalBudget > 0 && (
        <div className="card">
          <div className="line"><b>Összesen</b><span><b>{huf(totalSpent)}</b> <span className="muted">/ {huf(totalBudget)}</span></span></div>
          <Meter spent={totalSpent} limit={totalBudget} />
          <div className="small muted">{totalSpent > totalBudget ? `Túllépés: ${huf(totalSpent - totalBudget)}` : `Maradt: ${huf(totalBudget - totalSpent)}`} · csak a keretes kategóriák</div>
        </div>
      )}

      {withLimit.length > 0 && <h2 className="section">Kereteid</h2>}
      {withLimit.map(r => {
        const projected = pace?.(r.spent)
        return (
          <div key={r.c.id} className="card budget-row">
            <div className="line">
              <span className="title">{r.c.name}</span>
              <span className="amount"><b className={r.spent > r.limit! ? 'neg' : ''}>{huf(r.spent)}</b> <span className="muted">/ {huf(Number(r.limit))}</span></span>
            </div>
            <Meter spent={r.spent} limit={Number(r.limit)} />
            <div className="line small">
              <span className={r.spent > r.limit! ? 'neg' : 'muted'}>
                {r.spent > r.limit! ? `Túllépés: ${huf(r.spent - r.limit!)}` : `Maradt: ${huf(r.limit! - r.spent)}`}
                {projected !== undefined && r.spent <= r.limit! && projected > r.limit! && <span className="warn"> · ezzel a tempóval kb. {huf(projected)}</span>}
              </span>
              <button className="link" onClick={() => setEditing(editing === r.c.id ? null : r.c.id)}>{editing === r.c.id ? 'Bezár' : 'Módosítás'}</button>
            </div>
            {editing === r.c.id && <Editor category={r.c} month={month} avg={r.avg} close={() => setEditing(null)} />}
          </div>
        )
      })}

      <h2 className="section">Keret nélkül <InfoTip>Ezekre a kategóriákra még nincs havi keret. Az „átlag” az előző 3 hónap költése – jó kiindulópont a kerethez.</InfoTip></h2>
      <div className="card list">
        {without.map(r => (
          <div key={r.c.id} className="list-item">
            <div className="line">
              <span className="title">{r.c.name}</span>
              <span className="amount">{huf(r.spent)}</span>
            </div>
            <div className="line small">
              <span className="muted">{r.avg > 0 ? `átlag: ${huf(r.avg)}/hó` : 'eddig nem költöttél rá'}</span>
              <button className="link" onClick={() => setEditing(editing === r.c.id ? null : r.c.id)}>{editing === r.c.id ? 'Bezár' : '+ Keret'}</button>
            </div>
            {editing === r.c.id && <Editor category={r.c} month={month} avg={r.avg} close={() => setEditing(null)} />}
          </div>
        ))}
      </div>
    </>
  )
}

function Meter({ spent, limit }: { spent: number; limit: number }) {
  const pct = limit > 0 ? spent / limit * 100 : 100
  return <div className={`bar meter ${pct > 100 ? 'over' : pct >= 80 ? 'near' : ''}`}><div style={{ width: `${Math.min(100, pct)}%` }} /></div>
}

function Editor({ category, month, avg, close }: { category: Category; month: string; avg: number; close: () => void }) {
  const { budgets, reload } = useData()
  const def = budgets.find(b => b.category_id === category.id && b.month === null)
  const ovr = budgets.find(b => b.category_id === category.id && b.month === monthStart(month))
  const [base, setBase] = useState(def ? String(def.amount) : avg > 0 ? String(Math.ceil(avg / 1000) * 1000) : '')
  const [only, setOnly] = useState(ovr ? String(ovr.amount) : '')
  const [busy, setBusy] = useState(false)

  async function put(existing: typeof def, monthValue: string | null, raw: string) {
    if (raw.trim() === '') { if (existing) must(await supabase.from('budgets').delete().eq('id', existing.id)); return }
    const amount = Number(raw)
    if (!(amount >= 0)) return
    if (existing) must(await supabase.from('budgets').update({ amount }).eq('id', existing.id))
    else must(await supabase.from('budgets').insert({ category_id: category.id, month: monthValue, amount }))
  }
  async function save() {
    setBusy(true)
    await put(def, null, base)
    await put(ovr, monthStart(month), only)
    await reload(); setBusy(false); close()
  }

  return (
    <div className="editor">
      <div className="inline-inputs">
        <label>Havi keret (minden hónapra)<input type="number" inputMode="numeric" min={0} value={base} onChange={e => setBase(e.target.value)} placeholder="nincs" /></label>
        <label><span>Csak {monthLabel(month)}<InfoTip>Erre az egy hónapra felülírja a havi keretet (pl. decemberben több jut ajándékra). Hagyd üresen, ha a havi keret jó.</InfoTip></span>
          <input type="number" inputMode="numeric" min={0} value={only} onChange={e => setOnly(e.target.value)} placeholder="mint a havi" /></label>
      </div>
      {avg > 0 && <p className="small muted">Az előző 3 hónapban átlagosan {huf(avg)}-ot költöttél erre.</p>}
      <div className="row">
        <button className="primary" disabled={busy} onClick={save}>{busy ? 'Mentés…' : 'Mentés'}</button>
        <span className="muted small">Üresen hagyva a keret törlődik.</span>
      </div>
    </div>
  )
}
