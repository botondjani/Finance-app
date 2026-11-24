import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { autoAssignments } from './autoCategory'
import { fetchAll, must, supabase } from './supabase'
import type { Account, Asset, Budget, Category, Goal, Tx, Valuation } from './types'

interface Data {
  accounts: Account[]; categories: Category[]; txs: Tx[]; budgets: Budget[]
  goals: Goal[]; assets: Asset[]; valuations: Valuation[]
  catMap: Map<string, Category>; accMap: Map<string, Account>
  reload: () => Promise<void>
  /** How many transactions the automatic pass categorized in this session. */
  autoCategorized: number
}

export async function updateIds(ids: string[], patch: Partial<Tx>) {
  for (let i = 0; i < ids.length; i += 200)
    must(await supabase.from('transactions').update(patch).in('id', ids.slice(i, i + 200)))
}

const Ctx = createContext<Data | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<Data, 'reload' | 'catMap' | 'accMap' | 'autoCategorized'> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoCategorized, setAutoCategorized] = useState(0)

  const reload = useCallback(async () => {
    try {
      const [accounts, categories, txs, budgets, goals, assets, valuations] = await Promise.all([
        fetchAll<Account>('accounts', 'name'), fetchAll<Category>('categories', 'name'), fetchAll<Tx>('transactions', 'date'),
        fetchAll<Budget>('budgets'), fetchAll<Goal>('goals', 'name'), fetchAll<Asset>('assets', 'name'), fetchAll<Valuation>('asset_valuations', 'date'),
      ])
      // Uncategorized rows get the automatic category on every load: rules improve and earlier choices
      // teach new counterparties, so nobody has to press a button for already imported data.
      const auto = autoAssignments(txs, categories)
      if (auto.count) {
        for (const [category_id, ids] of auto.byCategory) await updateIds(ids, { category_id })
        await updateIds(auto.transfers, { is_transfer: true })
        const ids = new Map<string, Partial<Tx>>()
        for (const [category_id, list] of auto.byCategory) for (const id of list) ids.set(id, { category_id })
        for (const id of auto.transfers) ids.set(id, { is_transfer: true })
        txs.forEach((t, i) => { const p = ids.get(t.id); if (p) txs[i] = { ...t, ...p } })
        setAutoCategorized(n => n + auto.count)
      }
      setState({ accounts, categories, txs, budgets, goals, assets, valuations })
      setError(null)
    } catch (e) { setError((e as Error).message) }
  }, [])

  useEffect(() => { reload() }, [reload])

  const value = useMemo(() => state && {
    ...state, reload, autoCategorized,
    catMap: new Map(state.categories.map(c => [c.id, c])),
    accMap: new Map(state.accounts.map(a => [a.id, a])),
  }, [state, reload, autoCategorized])

  if (error) return <p className="error">Hiba az adatok betöltésekor: {error}</p>
  if (!value) return <p className="muted">Betöltés…</p>
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useData() {
  const d = useContext(Ctx)
  if (!d) throw new Error('useData outside DataProvider')
  return d
}
