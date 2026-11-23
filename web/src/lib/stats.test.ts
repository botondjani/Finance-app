import { describe, expect, it } from 'vitest'
import { accountBalances, budgetFor, detectRecurring, expenseByCategory, goalProgress, monthSummary, netWorthSeries, portfolioValue } from './stats'
import type { Account, Category, Tx } from './types'

const cats = new Map<string, Category>([
  ['food', { id: 'food', name: 'Élelmiszer', kind: 'expense' }],
  ['sal', { id: 'sal', name: 'Fizetés', kind: 'income' }],
  ['inv', { id: 'inv', name: 'Befektetés', kind: 'investment' }],
])
let n = 0
const tx = (p: Partial<Tx>): Tx => ({
  id: String(n++), account_id: 'a', date: '2026-11-05', amount: 0, description: '', counterparty: '', category_id: null,
  tags: [], note: null, is_transfer: false, transfer_peer_id: null, orig_amount: null, orig_currency: null, import_batch_id: null, ...p,
})

const txs = [
  tx({ amount: 300000, category_id: 'sal' }),
  tx({ amount: -50000, category_id: 'food' }),
  tx({ amount: 2000, category_id: 'food' }),            // refund
  tx({ amount: -100000, category_id: 'inv' }),
  tx({ amount: -20000, is_transfer: true }),
  tx({ amount: -5000 }),                                // uncategorized expense
  tx({ amount: -9999, date: '2026-10-31', category_id: 'food' }),
]

describe('monthSummary', () => {
  it('excludes transfers, treats investments as savings, refunds reduce expense', () => {
    expect(monthSummary(txs, cats, '2026-11')).toEqual({ income: 300000, expense: 53000, invested: 100000, savings: 247000 })
  })
})

describe('expenseByCategory', () => {
  it('nets refunds and skips income / investment / transfers', () => {
    expect(expenseByCategory(txs, cats, '2026-11-01', '2026-11-30')).toEqual([['food', 48000], ['', 5000]])
  })
})

describe('budgetFor', () => {
  it('prefers month override over default', () => {
    const b = [{ id: '1', category_id: 'food', month: null, amount: 80000 }, { id: '2', category_id: 'food', month: '2026-12-01', amount: 120000 }]
    expect(budgetFor(b, 'food', '2026-11')).toBe(80000)
    expect(budgetFor(b, 'food', '2026-12')).toBe(120000)
    expect(budgetFor(b, 'sal', '2026-12')).toBeNull()
  })
})

describe('balances and net worth', () => {
  const accounts: Account[] = [{ id: 'a', name: 'OTP', kind: 'checking', opening_balance: 1000, archived: false }]
  it('sums opening balance and transactions up to a date', () => {
    expect(accountBalances(accounts, txs, '2026-10-31').get('a')).toBe(1000 - 9999)
  })
  it('uses latest valuation per asset', () => {
    const v = [
      { id: '1', asset_id: 'x', date: '2026-10-01', value: 100, invested: 90 },
      { id: '2', asset_id: 'x', date: '2026-11-01', value: 120, invested: 95 },
      { id: '3', asset_id: 'y', date: '2026-11-15', value: 50, invested: null },
    ]
    expect(portfolioValue(v, '2026-11-10')).toEqual({ value: 120, invested: 95 })
    expect(portfolioValue(v, '2026-11-30')).toEqual({ value: 170, invested: null })
    const s = netWorthSeries(accounts, txs, v, '2026-11', 2)
    expect(s.map(x => [x.month, x.investments])).toEqual([['2026-10', 100], ['2026-11', 170]])
  })
})

describe('goalProgress', () => {
  it('computes percentage and required monthly saving', () => {
    expect(goalProgress(1000, 250, '2027-02-01', '2026-11-23')).toEqual({ pct: 25, remaining: 750, monthly: 250 })
    expect(goalProgress(1000, 1500, null, '2026-11-23')).toEqual({ pct: 100, remaining: 0, monthly: null })
  })
})

describe('detectRecurring', () => {
  it('finds monthly similar outflows and ignores irregular ones', () => {
    const list = [
      ...['2026-08-07', '2026-09-07', '2026-10-07', '2026-11-07'].map(d => tx({ date: d, amount: -3000, counterparty: 'netflix' })),
      ...['2026-09-01', '2026-09-03', '2026-10-01'].map(d => tx({ date: d, amount: -1500, counterparty: 'lidl' })),
      ...['2026-08-10', '2026-09-10', '2026-10-10'].map((d, i) => tx({ date: d, amount: -[1000, 5000, 1000][i], counterparty: 'shop' })),
    ]
    const r = detectRecurring(list)
    expect(r.map(x => [x.counterparty, x.amount, x.months])).toEqual([['netflix', 3000, 4]])
    expect(r[0].nextDate).toBe('2026-12-07')
  })
})
