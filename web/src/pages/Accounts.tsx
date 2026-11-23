import { useState } from 'react'
import { useData } from '../lib/data'
import { huf } from '../lib/format'
import { accountBalances } from '../lib/stats'
import { must, supabase } from '../lib/supabase'
import { ACCOUNT_KINDS, type Account, type AccountKind } from '../lib/types'

export default function Accounts() {
  const { accounts, txs, reload } = useData()
  const balances = accountBalances(accounts, txs)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<AccountKind>('checking')
  const [opening, setOpening] = useState('0')

  async function add() {
    if (!name.trim()) return
    must(await supabase.from('accounts').insert({ name: name.trim(), kind, opening_balance: Number(opening) || 0 }))
    setName(''); setOpening('0'); await reload()
  }

  async function update(a: Account, patch: Partial<Account>) {
    must(await supabase.from('accounts').update(patch).eq('id', a.id)); await reload()
  }

  async function remove(a: Account) {
    const n = txs.filter(t => t.account_id === a.id).length
    if (!confirm(`Törlöd a(z) "${a.name}" számlát és ${n} tranzakcióját?`)) return
    must(await supabase.from('accounts').delete().eq('id', a.id)); await reload()
  }

  return (
    <>
      <h1>Számlák</h1>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Név</th><th>Típus</th><th className="num">Nyitóegyenleg</th><th className="num">Egyenleg</th><th /></tr></thead>
          <tbody>
            {accounts.map(a => (
              <tr key={a.id} className={a.archived ? 'muted' : ''}>
                <td><input defaultValue={a.name} onBlur={e => e.target.value !== a.name && update(a, { name: e.target.value })} /></td>
                <td>
                  <select value={a.kind} onChange={e => update(a, { kind: e.target.value as AccountKind })}>
                    {Object.entries(ACCOUNT_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td className="num"><input type="number" step="0.01" defaultValue={a.opening_balance} style={{ width: 130 }}
                  onBlur={e => Number(e.target.value) !== Number(a.opening_balance) && update(a, { opening_balance: Number(e.target.value) })} /></td>
                <td className="num">{huf(balances.get(a.id) ?? 0)}</td>
                <td>
                  <button className="link" onClick={() => update(a, { archived: !a.archived })}>{a.archived ? 'Visszaállít' : 'Archivál'}</button>
                  <button className="link danger" onClick={() => remove(a)}>Törlés</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2>Új számla</h2>
        <div className="row">
          <label>Név<input value={name} onChange={e => setName(e.target.value)} placeholder="pl. OTP folyószámla" /></label>
          <label>Típus<select value={kind} onChange={e => setKind(e.target.value as AccountKind)}>
            {Object.entries(ACCOUNT_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
          <label>Nyitóegyenleg (Ft)<input type="number" step="0.01" value={opening} onChange={e => setOpening(e.target.value)} /></label>
          <button className="primary" onClick={add}>Hozzáadás</button>
        </div>
      </div>
    </>
  )
}
