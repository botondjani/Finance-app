import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchAll } from './supabase'
import type { Account, Asset, Budget, Category, Goal, Tx, Valuation } from './types'

interface Data {
  accounts: Account[]; categories: Category[]; txs: Tx[]; budgets: Budget[]
  goals: Goal[]; assets: Asset[]; valuations: Valuation[]
  catMap: Map<string, Category>; accMap: Map<string, Account>
  reload: () => Promise<void>
}

const Ctx = createContext<Data | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<Data, 'reload' | 'catMap' | 'accMap'> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const [accounts, categories, txs, budgets, goals, assets, valuations] = await Promise.all([
        fetchAll<Account>('accounts', 'name'), fetchAll<Category>('categories', 'name'), fetchAll<Tx>('transactions', 'date'),
        fetchAll<Budget>('budgets'), fetchAll<Goal>('goals', 'name'), fetchAll<Asset>('assets', 'name'), fetchAll<Valuation>('asset_valuations', 'date'),
      ])
      setState({ accounts, categories, txs, budgets, goals, assets, valuations })
      setError(null)
    } catch (e) { setError((e as Error).message) }
  }, [])

  useEffect(() => { reload() }, [reload])

  const value = useMemo(() => state && {
    ...state, reload,
    catMap: new Map(state.categories.map(c => [c.id, c])),
    accMap: new Map(state.accounts.map(a => [a.id, a])),
  }, [state, reload])

  if (error) return <p className="error">Hiba az adatok betöltésekor: {error}</p>
  if (!value) return <p className="muted">Betöltés…</p>
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useData() {
  const d = useContext(Ctx)
  if (!d) throw new Error('useData outside DataProvider')
  return d
}
