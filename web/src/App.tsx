import { lazy, Suspense, useEffect, useState } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
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

// First four are the mobile tab bar, the rest live under "Több".
const ICONS: Record<string, string> = {
  '/': 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  '/transactions': 'M4 6h16M4 12h16M4 18h10',
  '/import': 'M12 16V4m0 0L7 9m5-5 5 5M4 20h16',
  '/budget': 'M12 3a9 9 0 1 0 9 9h-9z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
}
const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
)

const NAV = [
  ['/', 'Áttekintés'], ['/transactions', 'Tranzakciók'], ['/import', 'Import'], ['/budget', 'Budget'],
  ['/goals', 'Célok'], ['/investments', 'Befektetések'], ['/recurring', 'Ismétlődő'],
  ['/accounts', 'Számlák'], ['/categories', 'Kategóriák'],
] as const

function Nav() {
  const [more, setMore] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setMore(false), [pathname])
  const inMore = NAV.slice(4).some(([to]) => to === pathname)
  return (
    <>
      <header className="topbar">
        <nav>{NAV.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}</nav>
        <button className="link" onClick={() => supabase.auth.signOut()}>Kilépés</button>
      </header>
      <nav className="tabbar" aria-label="Fő menü">
        {NAV.slice(0, 4).map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/'}><Icon d={ICONS[to]} />{label}</NavLink>
        ))}
        <button className={inMore || more ? 'active' : ''} onClick={() => setMore(!more)} aria-expanded={more}>
          <Icon d={ICONS.more} />Több
        </button>
      </nav>
      {more && (
        <div className="sheet-backdrop" onClick={() => setMore(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            {NAV.slice(4).map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
            <button className="link danger" onClick={() => supabase.auth.signOut()}>Kilépés</button>
          </div>
        </div>
      )}
    </>
  )
}

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
      <Nav />
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
