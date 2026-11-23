import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useData } from '../lib/data'
import { addMonths, currentMonth, huf, monthEnd, monthLabel, monthStart, todayIso } from '../lib/format'
import { accountBalances, expenseByCategory, monthSummary, netWorthSeries, portfolioValue } from '../lib/stats'
import { GoalList } from './Goals'

function Kpi({ label, value, prev, invert = false }: { label: string; value: number; prev: number; invert?: boolean }) {
  const d = value - prev
  const good = invert ? d <= 0 : d >= 0
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value">{huf(value)}</div>
      <div className="delta">
        <span className={d === 0 ? '' : good ? 'pos' : 'neg'}>{d > 0 ? '▲' : d < 0 ? '▼' : '='} {huf(Math.abs(d))}</span> előző hónaphoz
      </div>
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
    <div className="card">
      <h1>Üdv!</h1>
      <p>Kezdd egy <Link to="/import">kivonat importálásával</Link>, vagy hozz létre egy <Link to="/accounts">számlát</Link>.</p>
    </div>
  )

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Áttekintés</h1>
        <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} />
      </div>
      {uncategorized > 0 && <p className="warn small">{uncategorized} tétel kategorizálatlan – <Link to="/transactions">rendezd őket</Link>.</p>}
      <div className="kpis">
        <Kpi label="Bevétel" value={cur.income} prev={prev.income} />
        <Kpi label="Kiadás" value={cur.expense} prev={prev.expense} invert />
        <Kpi label="Megtakarítás" value={cur.savings} prev={prev.savings} />
        <Kpi label="Ebből befektetve" value={cur.invested} prev={prev.invested} />
      </div>

      <div className="grid">
        <div className="card">
          <h2>Kiadás kategóriánként – {monthLabel(month)}</h2>
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
          <h2>Számlák</h2>
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
        <h2>Nettó vagyon alakulása (hónap végén)</h2>
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
        <h2>Megtakarítási célok</h2>
        <GoalList />
      </div>
    </>
  )
}
