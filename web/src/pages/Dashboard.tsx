import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useData } from '../lib/data'
import { addMonths, currentMonth, huf, monthEnd, monthLabel, monthStart, todayIso } from '../lib/format'
import { accountBalances, expenseByCategory, monthSummary, netWorthSeries, portfolioValue } from '../lib/stats'
import InfoTip from '../components/InfoTip'
import { GoalList } from './Goals'

function Kpi({ label, value, prev, invert = false, info }: { label: string; value: number; prev: number; invert?: boolean; info: string }) {
  const d = value - prev
  const good = invert ? d <= 0 : d >= 0
  return (
    <div className="kpi">
      <div className="label">{label}<InfoTip>{info}</InfoTip></div>
      <div className="value">{huf(value)}</div>
      <div className="delta">
        {d === 0 ? 'mint előző hónapban' : <><span className={good ? 'pos' : 'neg'}>{d > 0 ? '▲' : '▼'} {huf(Math.abs(d))}</span> az előző hónaphoz képest</>}
      </div>
    </div>
  )
}

function GettingStarted() {
  const { accounts, txs, budgets, goals } = useData()
  const steps: [boolean, ReactNode][] = [
    [accounts.length > 0, <><Link to="/import">Tölts fel egy kivonatot</Link> (OTP, Revolut, Lightyear vagy bármilyen CSV/Excel)</>],
    [accounts.length > 0 && !txs.some(t => !t.category_id && !t.is_transfer), <><Link to="/categorize">Rendezd a kategóriákat</Link> – a legtöbbet automatikusan besorolom</>],
    [budgets.length > 0, <><Link to="/budget">Állíts be havi keretet</Link> a fő kategóriákra</>],
    [goals.length > 0, <><Link to="/goals">Tűzz ki egy célt</Link> (megtakarítás vagy befektetés)</>],
  ]
  if (steps.every(([done]) => done)) return null
  return (
    <div className="card">
      <h2>Kezdő lépések ({steps.filter(([d]) => d).length}/{steps.length})</h2>
      <ul className="checklist">
        {steps.map(([done, text], i) => <li key={i}><span className={done ? 'done' : 'todo'}>{done ? '✓' : '○'}</span><span>{text}</span></li>)}
      </ul>
    </div>
  )
}

const axis = { fontSize: 12, stroke: 'var(--muted)' }
const kFmt = (v: number) => `${Math.round(v / 1000)}e`

export default function Dashboard() {
  const { txs, accounts, valuations, catMap } = useData()
  const [month, setMonth] = useState(currentMonth())
  const cur = monthSummary(txs, catMap, month)
  const prev = monthSummary(txs, catMap, addMonths(month, -1))
  const byCat = expenseByCategory(txs, catMap, monthStart(month), monthEnd(month))
    .map(([id, v]) => ({ name: id ? catMap.get(id)?.name ?? '?' : 'Kategorizálatlan', value: v }))
  const balances = accountBalances(accounts, txs)
  const cash = accounts.reduce((s, a) => s + (balances.get(a.id) ?? 0), 0)
  const portfolio = portfolioValue(valuations, todayIso()).value
  const nw = netWorthSeries(accounts, txs, valuations, currentMonth(), 12).map(p => ({ ...p, label: monthLabel(p.month) }))
  const uncategorized = txs.filter(t => !t.is_transfer && !t.category_id).length

  if (!accounts.length) return (
    <>
      <h1>Üdv! 👋</h1>
      <p className="muted">Ez az app megmutatja, mennyit keresel, mire költesz, és hogyan haladsz a céljaid felé. Kezdd egy kivonat feltöltésével.</p>
      <GettingStarted />
    </>
  )

  return (
    <>
      <h1>Áttekintés</h1>
      <div className="month-nav">
        <button aria-label="Előző hónap" onClick={() => setMonth(addMonths(month, -1))}>‹</button>
        <span>{monthLabel(month)}</span>
        <button aria-label="Következő hónap" disabled={month >= currentMonth()} onClick={() => setMonth(addMonths(month, 1))}>›</button>
      </div>
      <GettingStarted />
      {uncategorized > 0 && <p className="warn small">{uncategorized} tételnek nincs kategóriája, ezért a kimutatások pontatlanok – <Link to="/categorize">rendezd őket</Link>.</p>}
      <div className="kpis">
        <Kpi label="Bevétel" value={cur.income} prev={prev.income} info="Ami bejött a számláidra ebben a hónapban (a saját számlák közti átvezetés nélkül)." />
        <Kpi label="Kiadás" value={cur.expense} prev={prev.expense} invert info="Amit elköltöttél ebben a hónapban. A befektetésre utalt pénz és az átvezetések nem számítanak bele." />
        <Kpi label="Megtakarítás" value={cur.savings} prev={prev.savings} info="Bevétel mínusz kiadás. Ha pozitív, többet kerestél, mint amennyit elköltöttél." />
        <Kpi label="Ebből befektetve" value={cur.invested} prev={prev.invested} info="A megtakarításból ennyit utaltál befektetésre (Befektetés kategória, pl. Lightyear)." />
      </div>

      <div className="grid">
        <div className="card">
          <h2>Mire költöttél? <InfoTip>A hónap kiadásai kategóriánként, a legnagyobbtól. A visszatérítések már le vannak vonva.</InfoTip></h2>
          {byCat.length === 0 ? <p className="muted">Nincs kiadás ebben a hónapban.</p> : (
            <div style={{ height: Math.max(160, byCat.length * 32) }}>
              <ResponsiveContainer>
                <BarChart data={byCat} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" {...axis} tickFormatter={kFmt} />
                  <YAxis type="category" dataKey="name" width={120} {...axis} />
                  <Tooltip formatter={v => huf(Number(v))} cursor={{ fill: 'var(--bg)' }} />
                  <Bar dataKey="value" name="Kiadás" fill="var(--series-1)" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card">
          <h2>Mennyi pénzed van? <InfoTip>A számláid mai egyenlege és a befektetéseid legutóbb rögzített értéke. A kettő összege a nettó vagyonod.</InfoTip></h2>
          <table><tbody>
            {accounts.filter(a => !a.archived).map(a => (
              <tr key={a.id}><td>{a.name}</td><td className="num">{huf(balances.get(a.id) ?? 0)}</td></tr>
            ))}
            <tr><td>Befektetések</td><td className="num">{huf(portfolio)}</td></tr>
            <tr><td><b>Nettó vagyon</b></td><td className="num"><b>{huf(cash + portfolio)}</b></td></tr>
          </tbody></table>
        </div>
      </div>

      <div className="card">
        <h2>Nettó vagyon alakulása <InfoTip>Minden hónap végén: számlák egyenlege (kék) + befektetések értéke (narancs). Az oszlop magassága a teljes vagyonod.</InfoTip></h2>
        <div style={{ height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={nw}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="label" {...axis} />
              <YAxis {...axis} tickFormatter={kFmt} width={50} />
              <Tooltip formatter={v => huf(Number(v))} cursor={{ fill: 'var(--bg)' }} />
              <Legend />
              <Bar dataKey="cash" name="Számlák" stackId="nw" fill="var(--series-1)" stroke="var(--card)" strokeWidth={2} />
              <Bar dataKey="investments" name="Befektetések" stackId="nw" fill="var(--series-2)" stroke="var(--card)" strokeWidth={2} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h2>Célok</h2>
        <GoalList />
      </div>
    </>
  )
}
