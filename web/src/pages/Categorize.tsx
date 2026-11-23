import { useMemo, useState } from 'react'
import CategorySelect from '../components/CategorySelect'
import InfoTip from '../components/InfoTip'
import { suggestCategory } from '../lib/autoCategory'
import { useData } from '../lib/data'
import { huf } from '../lib/format'
import { learnedCategories } from '../lib/importLogic'
import { must, supabase } from '../lib/supabase'
import type { Tx } from '../lib/types'

const PAGE = 40

async function updateIds(ids: string[], patch: Partial<Tx>) {
  for (let i = 0; i < ids.length; i += 200)
    must(await supabase.from('transactions').update(patch).in('id', ids.slice(i, i + 200)))
}

export default function Categorize() {
  const { txs, categories, catMap, reload } = useData()
  const [limit, setLimit] = useState(PAGE)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const open = useMemo(() => txs.filter(t => !t.category_id && !t.is_transfer), [txs])
  const suggestions = useMemo(() => {
    const learned = learnedCategories(txs)
    const byName = new Map(categories.map(c => [c.name, c.id]))
    const m = new Map<string, string[]>()
    for (const t of open) {
      const c = suggestCategory(t, learned, byName)
      if (c) m.set(c, [...(m.get(c) ?? []), t.id])
    }
    return m
  }, [open, txs, categories])
  const suggestedCount = [...suggestions.values()].reduce((s, ids) => s + ids.length, 0)

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

  const autoApply = () => run(async () => {
    for (const [cat, ids] of suggestions) await updateIds(ids, { category_id: cat })
  }, `${suggestedCount} tétel kategóriába sorolva.`)

  return (
    <>
      <h1>Kategóriák rendezése</h1>
      <p className="muted">
        Itt látod azokat a tételeket, amiknek még nincs kategóriájuk. Amit itt beállítasz, azt az app megjegyzi:
        a jövőbeli importoknál ugyanaz a partner automatikusan ugyanabba a kategóriába kerül.
      </p>
      {msg && <p className={msg.startsWith('Hiba') ? 'error' : 'pos'}>{msg}</p>}

      {open.length === 0 ? (
        <div className="card"><p>✓ Minden tétel kategóriában van.</p></div>
      ) : (
        <>
          {suggestedCount > 0 && (
            <div className="card">
              <h2>Automatikus besorolás <InfoTip>Ismert kereskedők (pl. Lidl, BKK, Netflix) és a korábbi döntéseid alapján. Utána bármelyik tételt átírhatod a Tranzakciók oldalon.</InfoTip></h2>
              <p>{suggestedCount} tételre van javaslatom ({open.length} rendezetlenből):</p>
              <ul className="small">
                {[...suggestions].sort((a, b) => b[1].length - a[1].length).map(([c, ids]) => (
                  <li key={c}>{catMap.get(c)?.name}: {ids.length} tétel</li>
                ))}
              </ul>
              <button className="primary" disabled={busy} onClick={autoApply}>{busy ? 'Folyamatban…' : `${suggestedCount} tétel besorolása`}</button>
            </div>
          )}

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
