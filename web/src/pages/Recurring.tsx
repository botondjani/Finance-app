import { useData } from '../lib/data'
import { huf } from '../lib/format'
import { detectRecurring } from '../lib/stats'

export default function Recurring() {
  const { txs } = useData()
  const list = detectRecurring(txs)
  const total = list.reduce((s, r) => s + r.amount, 0)
  return (
    <>
      <h1>Ismétlődő tételek</h1>
      <p className="muted small">Felismerve: ugyanaz a partner legalább 3 különböző hónapban, kb. havonta, ±20%-on belüli összeggel.</p>
      <div className="card table-wrap">
        {list.length === 0 ? <p className="muted">Még nincs elég adat a felismeréshez.</p> : (
          <table>
            <thead><tr><th>Partner</th><th className="num">Havi összeg</th><th className="num">Hónapok</th><th>Utolsó</th><th>Következő (várható)</th></tr></thead>
            <tbody>
              {list.map(r => (
                <tr key={r.counterparty}><td>{r.counterparty}</td><td className="num">{huf(r.amount)}</td>
                  <td className="num">{r.months}</td><td>{r.lastDate}</td><td>{r.nextDate}</td></tr>
              ))}
              <tr><td><b>Összesen havonta</b></td><td className="num"><b>{huf(total)}</b></td><td colSpan={3} /></tr>
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
