import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import CategorySelect from '../components/CategorySelect'
import { useData } from '../lib/data'
import { huf, todayIso } from '../lib/format'
import { normalizeCounterparty } from '../lib/parsers/util'
import { must, supabase } from '../lib/supabase'
import type { Tx } from '../lib/types'

const parseTags = (s: string) => [...new Set(s.split(/[,\s]+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean))]
const PAGE = 300

export default function Transactions() {
  const { txs, accounts, accMap, catMap, reload } = useData()
  const [f, setF] = useState({ from: '', to: '', account: '', category: '', tag: '', q: '', transfers: true })
  const [limit, setLimit] = useState(PAGE)
  const [editing, setEditing] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = f.q.toLowerCase()
    return txs.filter(t =>
      (!f.from || t.date >= f.from) && (!f.to || t.date <= f.to) &&
      (!f.account || t.account_id === f.account) &&
      (!f.category || (f.category === 'none' ? !t.category_id && !t.is_transfer : t.category_id === f.category)) &&
      (!f.tag || t.tags.includes(f.tag.replace(/^#/, ''))) &&
      (f.transfers || !t.is_transfer) &&
      (!q || t.description.toLowerCase().includes(q) || (t.note ?? '').toLowerCase().includes(q)),
    ).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
  }, [txs, f])

  const total = filtered.reduce((s, t) => s + Number(t.amount), 0)
  const allTags = [...new Set(txs.flatMap(t => t.tags))].sort()

  async function setCategory(t: Tx, category_id: string | null) {
    must(await supabase.from('transactions').update({ category_id }).eq('id', t.id))
    const same = txs.filter(o => o.id !== t.id && o.counterparty && o.counterparty === t.counterparty && !o.category_id && !o.is_transfer)
    if (category_id && same.length && confirm(`További ${same.length} kategória nélküli „${t.counterparty}” tétel is ide kerüljön?`))
      must(await supabase.from('transactions').update({ category_id }).in('id', same.map(o => o.id)))
    await reload()
  }

  return (
    <>
      <h1>Tranzakciók</h1>
      {txs.some(t => !t.category_id && !t.is_transfer) && (
        <p className="warn small">{txs.filter(t => !t.category_id && !t.is_transfer).length} tételnek nincs kategóriája – <Link to="/categorize">rendezd őket egyszerre</Link>.</p>
      )}
      <div className="card">
        <input type="search" placeholder="Keresés…" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} style={{ width: '100%' }} />
        <details style={{ marginTop: 8 }}>
        <summary className="small muted">Szűrők</summary>
        <div className="row" style={{ marginTop: 8 }}>
        <label>Ettől<input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></label>
        <label>Eddig<input type="date" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></label>
        <label>Számla<select value={f.account} onChange={e => setF({ ...f, account: e.target.value })}>
          <option value="">Mind</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select></label>
        <label>Kategória
          <select value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>
            <option value="">Mind</option><option value="none">Kategorizálatlan</option>
            {[...catMap.values()].map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Címke<select value={f.tag} onChange={e => setF({ ...f, tag: e.target.value })}>
          <option value="">Mind</option>{allTags.map(t => <option key={t} value={t}>#{t}</option>)}
        </select></label>
        <label className="check">
          <input type="checkbox" checked={f.transfers} onChange={e => setF({ ...f, transfers: e.target.checked })} /> átvezetések
        </label>
        </div>
        </details>
      </div>

      <NewTx />

      <p className="muted small">{filtered.length} tétel, összesen <b className={total < 0 ? 'neg' : 'pos'}>{huf(total)}</b></p>
      <div className="card list">
        {filtered.slice(0, limit).map(t => editing === t.id
          ? <EditRow key={t.id} t={t} done={() => setEditing(null)} />
          : (
            <div key={t.id} className="list-item">
              <div className="line">
                <span className="title" title={t.description}>{t.counterparty || t.description}</span>
                <span className={`amount ${t.amount < 0 ? 'neg' : 'pos'}`}>{huf(t.amount)}</span>
              </div>
              <div className="line small muted">
                <span>{t.date} · {accMap.get(t.account_id)?.name}
                  {t.orig_currency && ` · ${t.orig_amount} ${t.orig_currency}`}</span>
                <button className="link" onClick={() => setEditing(t.id)}>Szerk.</button>
              </div>
              {(t.tags.length > 0 || t.note) && <div>
                {t.tags.map(g => <span key={g} className="tag">#{g}</span>)}
                {t.note && <span className="muted small">{t.note}</span>}
              </div>}
              {t.is_transfer
                ? <span className="muted small">Átvezetés{t.transfer_peer_id ? ' ↔ párosítva' : ''}</span>
                : <CategorySelect value={t.category_id} onChange={id => setCategory(t, id)} />}
            </div>
          ))}
        {filtered.length > limit && <button onClick={() => setLimit(limit + PAGE)}>Több ({filtered.length - limit})</button>}
      </div>
    </>
  )
}

function NewTx() {
  const { accounts, reload } = useData()
  const [t, setT] = useState({ date: todayIso(), account_id: '', amount: '', description: '', category_id: null as string | null, tags: '' })
  const [error, setError] = useState<string | null>(null)

  async function add() {
    setError(null)
    const amount = Number(t.amount.replace(',', '.').replace(/\s/g, ''))
    if (!t.account_id || !amount) return setError('Számla és nem nulla összeg kell.')
    must(await supabase.from('transactions').insert({
      date: t.date, account_id: t.account_id, amount, description: t.description,
      counterparty: normalizeCounterparty(t.description), category_id: t.category_id, tags: parseTags(t.tags),
    }))
    setT({ ...t, amount: '', description: '', tags: '' })
    await reload()
  }

  return (
    <details className="card">
      <summary>Új tranzakció</summary>
      <div className="row" style={{ marginTop: 12 }}>
        <label>Dátum<input type="date" value={t.date} onChange={e => setT({ ...t, date: e.target.value })} /></label>
        <label>Számla<select value={t.account_id} onChange={e => setT({ ...t, account_id: e.target.value })}>
          <option value="">Válassz…</option>{accounts.filter(a => !a.archived).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select></label>
        <label>Összeg (kiadás negatív)<input inputMode="decimal" value={t.amount} onChange={e => setT({ ...t, amount: e.target.value })} placeholder="-2500" /></label>
        <label>Leírás<input value={t.description} onChange={e => setT({ ...t, description: e.target.value })} /></label>
        <label>Kategória<CategorySelect value={t.category_id} onChange={id => setT({ ...t, category_id: id })} /></label>
        <label>Címkék<input value={t.tags} onChange={e => setT({ ...t, tags: e.target.value })} placeholder="#nyaralás2026" /></label>
        <button className="primary" onClick={add}>Mentés</button>
      </div>
      {error && <p className="error">{error}</p>}
    </details>
  )
}

function EditRow({ t, done }: { t: Tx; done: () => void }) {
  const { accounts, txs, accMap, reload } = useData()
  const [v, setV] = useState({ date: t.date, account_id: t.account_id, amount: String(t.amount), description: t.description,
    tags: t.tags.map(g => '#' + g).join(' '), note: t.note ?? '', is_transfer: t.is_transfer, peer: t.transfer_peer_id ?? '' })

  // Possible counterpart: opposite amount on another account within ±5 days.
  const peers = txs.filter(o => o.id !== t.id && o.account_id !== v.account_id && Math.abs(Number(o.amount) + Number(v.amount)) < 0.01 &&
    Math.abs(Date.parse(o.date) - Date.parse(v.date)) <= 5 * 86_400_000 && (!o.transfer_peer_id || o.transfer_peer_id === t.id))

  async function save() {
    const peer = v.is_transfer ? v.peer || null : null
    must(await supabase.from('transactions').update({
      date: v.date, account_id: v.account_id, amount: Number(v.amount), description: v.description,
      tags: parseTags(v.tags), note: v.note || null, is_transfer: v.is_transfer, transfer_peer_id: peer,
      ...(v.is_transfer ? { category_id: null } : {}),
    }).eq('id', t.id))
    if (t.transfer_peer_id && t.transfer_peer_id !== peer)
      must(await supabase.from('transactions').update({ is_transfer: false, transfer_peer_id: null }).eq('id', t.transfer_peer_id))
    if (peer) must(await supabase.from('transactions').update({ is_transfer: true, transfer_peer_id: t.id, category_id: null }).eq('id', peer))
    await reload(); done()
  }

  async function remove() {
    if (!confirm('Biztosan törlöd?')) return
    must(await supabase.from('transactions').delete().eq('id', t.id)); await reload(); done()
  }

  return (
    <div className="list-item">
      <div className="row">
        <label>Dátum<input type="date" value={v.date} onChange={e => setV({ ...v, date: e.target.value })} /></label>
        <label>Számla<select value={v.account_id} onChange={e => setV({ ...v, account_id: e.target.value })}>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label>Összeg<input value={v.amount} onChange={e => setV({ ...v, amount: e.target.value })} /></label>
        <label style={{ flex: 1 }}>Leírás<input value={v.description} onChange={e => setV({ ...v, description: e.target.value })} /></label>
        <label>Címkék<input value={v.tags} onChange={e => setV({ ...v, tags: e.target.value })} /></label>
        <label>Megjegyzés<input value={v.note} onChange={e => setV({ ...v, note: e.target.value })} /></label>
        <label className="check">
          <input type="checkbox" checked={v.is_transfer} onChange={e => setV({ ...v, is_transfer: e.target.checked })} /> átvezetés
        </label>
        {v.is_transfer && (
          <label>Párja<select value={v.peer} onChange={e => setV({ ...v, peer: e.target.value })}>
            <option value="">— nincs (külső) —</option>
            {peers.map(p => <option key={p.id} value={p.id}>{p.date} {accMap.get(p.account_id)?.name} {huf(p.amount)}</option>)}
          </select></label>
        )}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="primary" onClick={save}>Mentés</button>
        <button onClick={done}>Mégse</button>
        <button className="danger" onClick={remove}>Törlés</button>
      </div>
    </div>
  )
}
