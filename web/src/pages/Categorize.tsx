import { useMemo, useState } from 'react'
import CategorySelect from '../components/CategorySelect'
import InfoTip from '../components/InfoTip'
import { updateIds, useData } from '../lib/data'
import { huf } from '../lib/format'
import type { Tx } from '../lib/types'

const PAGE = 40

export default function Categorize() {
  const { txs, categories, catMap, reload, autoCategorized } = useData()
  const [limit, setLimit] = useState(PAGE)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const open = useMemo(() => txs.filter(t => !t.category_id && !t.is_transfer), [txs])
  const groups = useMemo(() => {
    const g = new Map<string, Tx[]>()
    for (const t of open) {
      const key = t.counterparty || t.description || '(leírás nélkül)'
      g.set(key, [...(g.get(key) ?? []), t])
    }
    return [...g].map(([name, list]) => ({ name, list, total: list.reduce((s, t) => s + Number(t.amount), 0) }))
      .sort((a, b) => b.list.length - a.list.length || Math.abs(b.total) - Math.abs(a.total))
  }, [open])

  async function run(f: () => Promise<void>, done: string) {
    setBusy(true); setMsg(null)
    try { await f(); await reload(); setMsg(done) } catch (e) { setMsg(`Hiba: ${(e as Error).message}`) }
    setBusy(false)
  }

  const other = (name: string) => categories.find(c => c.name === name)?.id
  const restToOther = () => run(async () => {
    const out = other('Egyéb kiadás'), inc = other('Egyéb bevétel')
    if (out) await updateIds(open.filter(t => t.amount < 0).map(t => t.id), { category_id: out })
    if (inc) await updateIds(open.filter(t => t.amount >= 0).map(t => t.id), { category_id: inc })
  }, `${open.length} tétel az „Egyéb” kategóriákba sorolva.`)

  return (
    <>
      <h1>Kategóriák rendezése</h1>
      <p className="muted">
        Itt látod azokat a tételeket, amiknek még nincs kategóriájuk. Amit itt beállítasz, azt az app megjegyzi:
        a jövőbeli importoknál ugyanaz a partner automatikusan ugyanabba a kategóriába kerül.
      </p>
      {autoCategorized > 0 && <p className="pos small">✓ {autoCategorized} tételt automatikusan besoroltam.</p>}
      {msg && <p className={msg.startsWith('Hiba') ? 'error' : 'pos'}>{msg}</p>}

      {open.length === 0 ? (
        <div className="card"><p>✓ Minden tétel kategóriában van.</p></div>
      ) : (
        <>
          <div className="card">
            <h2>Gyors befejezés <InfoTip>A felismerhető tételeket (ismert boltok, korábbi döntéseid, saját számlák közti feltöltések) az app már magától besorolta. Ami itt maradt, azt nem lehet biztosan felismerni – vagy beállítod partnerenként lent, vagy egy gombbal az „Egyéb” kategóriákba teszed őket.</InfoTip></h2>
            <p className="small muted">A kiadások az „Egyéb kiadás”, a bejövő tételek az „Egyéb bevétel” kategóriába kerülnek. Később bármelyiket átírhatod.</p>
            <button disabled={busy} onClick={() => confirm(`Mind a ${open.length} tételt az „Egyéb” kategóriákba teszed?`) && restToOther()}>Maradék {open.length} tétel → Egyéb</button>
          </div>

          <div className="card">
            <h2>Partnerenként ({groups.length} csoport, {open.length} tétel)
              <InfoTip>Egy választással a csoport összes tétele megkapja a kategóriát. Ha a csoport pénzmozgás a saját számláid között (pl. feltöltés, váltás), jelöld átvezetésnek: az nem számít se bevételnek, se kiadásnak.</InfoTip>
            </h2>
            <div className="list">
              {groups.slice(0, limit).map(g => (
                <div key={g.name} className="list-item">
                  <div className="line">
                    <span className="title">{g.name}</span>
                    <span className={`amount ${g.total < 0 ? 'neg' : 'pos'}`}>{huf(g.total)}</span>
                  </div>
                  <div className="small muted">{g.list.length} tétel · {g.list[0].date}{g.list.length > 1 ? ` – ${g.list[g.list.length - 1].date}` : ''}</div>
                  <div className="row">
                    <CategorySelect value={null} empty="Kategória az összesnek…"
                      onChange={id => id && run(() => updateIds(g.list.map(t => t.id), { category_id: id }), `„${g.name}”: ${g.list.length} tétel → ${catMap.get(id)?.name}`)} />
                    <button className="link" disabled={busy}
                      onClick={() => run(() => updateIds(g.list.map(t => t.id), { is_transfer: true }), `„${g.name}” átvezetésnek jelölve.`)}>
                      Átvezetés
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {groups.length > limit && <button onClick={() => setLimit(limit + PAGE)}>Több ({groups.length - limit})</button>}
          </div>
        </>
      )}
    </>
  )
}
