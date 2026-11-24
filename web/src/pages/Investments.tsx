import { useEffect, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import InfoTip from '../components/InfoTip'
import { useData } from '../lib/data'
import { huf, todayIso } from '../lib/format'
import { investedAt, netDeposits, positionsFrom, type LightyearRow } from '../lib/parsers/lightyear'
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
      <p className="muted small">Itt követed a befektetéseid értékét. A Lightyear kivonatból az értéket automatikusan rögzítem; más eszköznél (állampapír, kripto, nyugdíjpénztár) időnként írd be az aktuális értéket.</p>
      <div className="kpis">
        <div className="kpi"><div className="label">Portfólió értéke<InfoTip>Az összes befektetésed legutóbb rögzített értéke forintban.</InfoTip></div><div className="value">{huf(total.value)}</div></div>
        {total.invested !== null && <>
          <div className="kpi"><div className="label">Befektetett tőke<InfoTip>Mennyi saját pénzt tettél be összesen (befizetések mínusz kivétek).</InfoTip></div><div className="value">{huf(total.invested)}</div></div>
          <div className="kpi"><div className="label">Eredmény<InfoTip>Érték mínusz befektetett tőke: ennyit nyertél vagy vesztettél. Csak akkor pontos, ha minden befizetésed rögzítve van.</InfoTip></div>
            <div className={`value ${total.value >= total.invested ? 'pos' : 'neg'}`}>{huf(total.value - total.invested)}
              {total.invested > 0 && <span className="small"> ({((total.value / total.invested - 1) * 100).toFixed(1)}%)</span>}</div></div>
        </>}
      </div>
      {total.value > 0 && total.invested === null && <p className="warn small">Az eredményhez add meg az eszközöknél, mennyit fizettél be eddig összesen („Befektetett tőke”).</p>}
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
    const prev = history.find(h => h.date < v.date && h.invested != null)
    const invested = v.invested !== '' ? Number(v.invested)
      : prev ? investedAt(lyRows, { date: prev.date, invested: Number(prev.invested) }, v.date) : null
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

      {latest && (
        <label className="small" style={{ marginTop: 12 }}><span>Befektetett tőke {latest.date}-n (Ft)<InfoTip>Eddig összesen mennyi saját pénzt fizettél be ebbe az eszközbe (befizetések mínusz kivétek), a számlanyitástól. Egyszer add meg – a későbbi Lightyear importoknál az új befizetésekkel automatikusan továbbvezetem.</InfoTip></span>
          <input key={latest.id + String(latest.invested)} type="number" inputMode="numeric" min={0} defaultValue={latest.invested ?? ''} placeholder="pl. 1 500 000"
            onBlur={async e => { const n = e.target.value === '' ? null : Number(e.target.value); if (n !== (latest.invested == null ? null : Number(latest.invested))) { must(await supabase.from('asset_valuations').update({ invested: n }).eq('id', latest.id)); await reload() } }} /></label>
      )}

      {asset.source === 'lightyear' && (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <p className="small muted">Befizetés az importált kivonatokban: <b>{huf(deposits!.huf)}</b>
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
          onChange={e => setV({ ...v, invested: e.target.value })} /></label>
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
