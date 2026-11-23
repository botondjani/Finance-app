import { useEffect, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useData } from '../lib/data'
import { huf, todayIso } from '../lib/format'
import { netDeposits, positionsFrom, type LightyearRow } from '../lib/parsers/lightyear'
import { portfolioValue } from '../lib/stats'
import { must, supabase } from '../lib/supabase'
import { ASSET_TYPES, type Asset, type AssetType } from '../lib/types'

export default function Investments() {
  const { assets, valuations, reload } = useData()
  const [name, setName] = useState('')
  const [type, setType] = useState<AssetType>('stock_etf')
  const today = todayIso()
  const total = portfolioValue(valuations, today)
  const dates = [...new Set(valuations.map(v => v.date))].sort()
  const series = dates.map(d => ({ date: d, ...portfolioValue(valuations, d) }))

  async function add() {
    if (!name.trim()) return
    must(await supabase.from('assets').insert({ name: name.trim(), type })); setName(''); await reload()
  }

  return (
    <>
      <h1>Befektetések</h1>
      <div className="kpis">
        <div className="kpi"><div className="label">Portfólió értéke</div><div className="value">{huf(total.value)}</div></div>
        {total.invested !== null && <>
          <div className="kpi"><div className="label">Befektetett tőke</div><div className="value">{huf(total.invested)}</div></div>
          <div className="kpi"><div className="label">Eredmény</div>
            <div className={`value ${total.value >= total.invested ? 'pos' : 'neg'}`}>{huf(total.value - total.invested)}</div></div>
        </>}
      </div>
      {series.length > 1 && (
        <div className="card" style={{ height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={series}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="date" fontSize={12} />
              <YAxis fontSize={12} tickFormatter={v => `${Math.round(v / 1000)}e`} width={50} />
              <Tooltip formatter={v => huf(Number(v))} />
              <Legend />
              <Line dataKey="value" name="Érték" stroke="var(--series-1)" strokeWidth={2} dot={false} />
              <Line dataKey="invested" name="Befektetett" stroke="var(--series-2)" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {assets.map(a => <AssetCard key={a.id} asset={a} />)}
      <div className="card row">
        <label>Új eszköz<input value={name} onChange={e => setName(e.target.value)} placeholder="pl. PMÁP 2029, Nyugdíjpénztár" /></label>
        <label>Típus<select value={type} onChange={e => setType(e.target.value as AssetType)}>
          {Object.entries(ASSET_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></label>
        <button className="primary" onClick={add}>Hozzáadás</button>
        <span className="muted small">Lightyear portfólió az Import oldalon jön létre.</span>
      </div>
    </>
  )
}

function AssetCard({ asset }: { asset: Asset }) {
  const { valuations, reload } = useData()
  const history = valuations.filter(v => v.asset_id === asset.id).sort((a, b) => b.date.localeCompare(a.date))
  const [lyRows, setLyRows] = useState<LightyearRow[]>([])
  const [v, setV] = useState({ date: todayIso(), value: '', invested: '' })

  useEffect(() => {
    if (asset.source !== 'lightyear') return
    supabase.from('investment_transactions').select('*').eq('asset_id', asset.id).then(r => setLyRows((r.data ?? []) as LightyearRow[]))
  }, [asset, valuations])

  const deposits = asset.source === 'lightyear' ? netDeposits(lyRows) : null
  const positions = positionsFrom(lyRows)

  async function addValuation() {
    if (!(Number(v.value) >= 0) || v.value === '') return
    const invested = v.invested !== '' ? Number(v.invested) : deposits ? deposits.huf : null
    must(await supabase.from('asset_valuations').upsert({ asset_id: asset.id, date: v.date, value: Number(v.value), invested }, { onConflict: 'asset_id,date' }))
    setV({ ...v, value: '', invested: '' }); await reload()
  }

  async function removeAsset() {
    if (!confirm(`Törlöd: ${asset.name} (minden értékkel és tétellel)?`)) return
    must(await supabase.from('assets').delete().eq('id', asset.id)); await reload()
  }

  const latest = history[0]
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>{asset.name} <span className="muted small">{ASSET_TYPES[asset.type]}</span></h2>
        <span>{latest ? <><b>{huf(Number(latest.value))}</b> <span className="muted small">({latest.date})</span></> : <span className="muted">nincs érték</span>}</span>
      </div>

      {asset.source === 'lightyear' && (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <p className="small muted">Nettó befizetés: <b>{huf(deposits!.huf)}</b>
            {deposits!.other.length > 0 && <span className="warn"> · {deposits!.other.length} nem HUF befizetés nincs benne</span>}</p>
          {positions.length > 0 ? (
            <table>
              <thead><tr><th>Ticker</th><th className="num">Darab</th><th className="num">Bekerülési érték</th><th className="num">Átlagár</th></tr></thead>
              <tbody>{positions.map(p => (
                <tr key={p.ticker}><td>{p.ticker}</td><td className="num">{p.quantity.toFixed(4)}</td>
                  <td className="num">{p.cost.toFixed(2)} {p.currency}</td><td className="num">{(p.cost / p.quantity).toFixed(2)} {p.currency}</td></tr>
              ))}</tbody>
            </table>
          ) : <p className="muted small">Nincs importált pozíció.</p>}
          <p className="small muted">A pozíciók csak akkor pontosak, ha a teljes időszakot (számlanyitástól) importáltad.</p>
        </div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <label>Dátum<input type="date" value={v.date} onChange={e => setV({ ...v, date: e.target.value })} /></label>
        <label>Aktuális érték (Ft)<input type="number" min={0} value={v.value} onChange={e => setV({ ...v, value: e.target.value })} /></label>
        <label>Befektetett (Ft, opcionális)<input type="number" min={0} value={v.invested}
          placeholder={deposits ? String(deposits.huf) : ''} onChange={e => setV({ ...v, invested: e.target.value })} /></label>
        <button className="primary" onClick={addValuation}>Érték rögzítése</button>
        <button className="link danger" onClick={removeAsset}>Eszköz törlése</button>
      </div>

      {history.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="small muted">Előzmények ({history.length})</summary>
          <table><tbody>{history.map(h => (
            <tr key={h.id}><td>{h.date}</td><td className="num">{huf(Number(h.value))}</td>
              <td className="num muted">{h.invested != null ? huf(Number(h.invested)) : '—'}</td>
              <td><button className="link danger" onClick={async () => { must(await supabase.from('asset_valuations').delete().eq('id', h.id)); await reload() }}>×</button></td></tr>
          ))}</tbody></table>
        </details>
      )}
    </div>
  )
}
