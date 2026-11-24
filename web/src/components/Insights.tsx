import { Link } from 'react-router-dom'
import { useData } from '../lib/data'
import { currentMonth, huf, monthKey, todayIso } from '../lib/format'
import { budgetAlerts, categoryChanges, monthSummary } from '../lib/stats'
import InfoTip from './InfoTip'

const shortDate = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('hu-HU', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** Date the imported data is complete up to: the newest transaction, never after today. */
export function dataAsOf(dates: string[]) {
  const today = todayIso()
  const last = dates.reduce((m, d) => (d > m ? d : m), '')
  return last && last < today ? last : today
}

export function BudgetAlerts() {
  const { txs, budgets, catMap } = useData()
  if (!budgets.length) return null
  const asOf = dataAsOf(txs.map(t => t.date))
  if (monthKey(asOf) !== currentMonth()) return null
  const alerts = budgetAlerts(txs, catMap, budgets, asOf)
  if (!alerts.length) return null
  const name = (id: string) => catMap.get(id)?.name ?? '?'
  return (
    <div className="card alerts">
      <h2>Figyelem: kereteid <InfoTip>A havi budget alapján. „Ezzel a tempóval”: ha a hónap hátralévő részében is ugyanígy költesz, ennyi lesz a hónap végére. Az adatok az utolsó importált tételig ({shortDate(asOf)}) számolnak.</InfoTip></h2>
      <ul>
        {alerts.map(a => (
          <li key={a.categoryId} className={a.level === 'over' ? 'neg' : 'warn'}>
            <b>{name(a.categoryId)}</b>:{' '}
            {a.level === 'over' && <>túllépted a keretet {huf(a.spent - a.limit)}-tal ({huf(a.spent)} / {huf(a.limit)})</>}
            {a.level === 'near' && <>a keret {Math.round(a.spent / a.limit * 100)}%-a elfogyott, még {huf(a.limit - a.spent)} maradt</>}
            {a.level === 'pace' && <>ezzel a tempóval a hónap végére kb. {huf(a.projected)} lesz ({huf(a.limit)} a keret)</>}
          </li>
        ))}
      </ul>
      <Link to="/budget" className="small">Keretek megnyitása</Link>
    </div>
  )
}

export function MonthReport({ month, prevMonth }: { month: string; prevMonth: string }) {
  const { txs, catMap } = useData()
  const cur = monthSummary(txs, catMap, month), prev = monthSummary(txs, catMap, prevMonth)
  const rate = (s: typeof cur) => (s.income > 0 ? Math.round(s.savings / s.income * 100) : null)
  const changes = categoryChanges(txs, catMap, month)
  const biggest = txs.filter(t => monthKey(t.date) === month && t.amount < 0 && !t.is_transfer && catMap.get(t.category_id ?? '')?.kind !== 'investment')
    .sort((a, b) => a.amount - b.amount)[0]
  const name = (id: string) => (id ? catMap.get(id)?.name ?? '?' : 'Kategorizálatlan')
  if (!cur.income && !cur.expense) return null
  const r = rate(cur), rp = rate(prev)
  return (
    <div className="card">
      <h2>Havi összefoglaló <InfoTip>A hónap legfontosabb számai az előző hónaphoz képest. Átvezetések nélkül; a befektetésre utalt pénz megtakarításnak számít.</InfoTip></h2>
      <ul className="report">
        {r !== null && <li>A bevételed <b>{r}%-át</b> tetted félre ({huf(cur.savings)}){rp !== null && <span className="muted">, előző hónapban {rp}% volt</span>}.</li>}
        {cur.expense !== prev.expense && prev.expense > 0 && <li>Összesen <b className={cur.expense > prev.expense ? 'neg' : 'pos'}>{huf(Math.abs(cur.expense - prev.expense))}-tal {cur.expense > prev.expense ? 'többet' : 'kevesebbet'}</b> költöttél, mint előző hónapban.</li>}
        {changes.map(c => (
          <li key={c.categoryId}>{name(c.categoryId)}: <b className={c.diff > 0 ? 'neg' : 'pos'}>{c.diff > 0 ? '+' : '−'}{huf(Math.abs(c.diff))}</b> <span className="muted">({huf(c.prev)} → {huf(c.cur)})</span></li>
        ))}
        {biggest && <li>Legnagyobb kiadás: <b>{huf(-biggest.amount)}</b> – {biggest.counterparty || biggest.description} <span className="muted">({shortDate(biggest.date)})</span></li>}
      </ul>
    </div>
  )
}
