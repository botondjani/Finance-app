import { useState } from 'react'
import { useData } from '../lib/data'
import { must, supabase } from '../lib/supabase'
import { CATEGORY_KINDS, type Category, type CategoryKind } from '../lib/types'

export default function Categories() {
  const { categories, txs, reload } = useData()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<CategoryKind>('expense')
  const [error, setError] = useState<string | null>(null)

  async function run(f: () => Promise<unknown>) {
    setError(null)
    try { await f(); await reload() } catch (e) { setError((e as Error).message) }
  }

  const add = () => name.trim() && run(async () => {
    must(await supabase.from('categories').insert({ name: name.trim(), kind })); setName('')
  })
  const update = (c: Category, patch: Partial<Category>) =>
    run(async () => must(await supabase.from('categories').update(patch).eq('id', c.id)))
  const remove = (c: Category) => {
    const n = txs.filter(t => t.category_id === c.id).length
    if (confirm(`Törlöd a(z) "${c.name}" kategóriát? ${n} tranzakció kategória nélkül marad.`))
      run(async () => must(await supabase.from('categories').delete().eq('id', c.id)))
  }

  return (
    <>
      <h1>Kategóriák</h1>
      <p className="muted small">A „Befektetés” típusú kategóriába tett kiadás nem számít költésnek, hanem megtakarításnak.</p>
      {error && <p className="error">{error}</p>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Név</th><th>Típus</th><th className="num">Tételek</th><th /></tr></thead>
          <tbody>
            {categories.map(c => (
              <tr key={c.id}>
                <td><input defaultValue={c.name} onBlur={e => e.target.value !== c.name && update(c, { name: e.target.value })} /></td>
                <td><select value={c.kind} onChange={e => update(c, { kind: e.target.value as CategoryKind })}>
                  {Object.entries(CATEGORY_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></td>
                <td className="num">{txs.filter(t => t.category_id === c.id).length}</td>
                <td><button className="link danger" onClick={() => remove(c)}>Törlés</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card row">
        <label>Új kategória<input value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Típus<select value={kind} onChange={e => setKind(e.target.value as CategoryKind)}>
          {Object.entries(CATEGORY_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></label>
        <button className="primary" onClick={add}>Hozzáadás</button>
      </div>
    </>
  )
}
