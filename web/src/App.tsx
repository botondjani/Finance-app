import { lazy, Suspense, useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { DataProvider } from './lib/data'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Accounts from './pages/Accounts'
import Categories from './pages/Categories'
import Budget from './pages/Budget'
import Goals from './pages/Goals'
import Investments from './pages/Investments'
import Recurring from './pages/Recurring'

const Import = lazy(() => import('./pages/Import'))

const NAV = [
  ['/', 'Áttekintés'], ['/transactions', 'Tranzakciók'], ['/import', 'Import'], ['/budget', 'Budget'],
  ['/goals', 'Célok'], ['/investments', 'Befektetések'], ['/recurring', 'Ismétlődő'],
  ['/accounts', 'Számlák'], ['/categories', 'Kategóriák'],
] as const

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (!session) return <Login />

  return (
    <DataProvider>
      <header className="topbar">
        <nav>
          {NAV.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}
        </nav>
        <button className="link" onClick={() => supabase.auth.signOut()}>Kilépés</button>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/import" element={<Suspense fallback={<p className="muted">Betöltés…</p>}><Import /></Suspense>} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/investments" element={<Investments />} />
          <Route path="/recurring" element={<Recurring />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/categories" element={<Categories />} />
        </Routes>
      </main>
    </DataProvider>
  )
}
