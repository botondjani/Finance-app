import type { Account, Budget, Category, Goal, Tx, Valuation } from './types'
import { addMonths, monthEnd, monthKey, monthStart } from './format'

export interface MonthSummary { income: number; expense: number; invested: number; savings: number }

/**
 * Transfers are ignored. Investment-category outflows are not expenses: they count as savings.
 * savings = income - expense (so it includes what was invested).
 */
export function monthSummary(txs: Tx[], cats: Map<string, Category>, month: string): MonthSummary {
  let income = 0, expense = 0, invested = 0
  for (const t of txs) {
    if (t.is_transfer || monthKey(t.date) !== month) continue
    const kind = t.category_id ? cats.get(t.category_id)?.kind : undefined
    if (kind === 'investment') invested -= t.amount
    else if (kind === 'income') income += t.amount
    else if (kind === 'expense') expense -= t.amount           // refunds reduce expense
    else if (t.amount > 0) income += t.amount                  // uncategorized
    else expense -= t.amount
  }
  return { income, expense, invested, savings: income - expense }
}

/** Net spending per category (refunds reduce it) for a date range; uncategorized under key "". */
export function expenseByCategory(txs: Tx[], cats: Map<string, Category>, from: string, to: string) {
  const m = new Map<string, number>()
  for (const t of txs) {
    if (t.is_transfer || t.date < from || t.date > to) continue
    const kind = t.category_id ? cats.get(t.category_id)?.kind : undefined
    if (kind === 'income' || kind === 'investment') continue
    if (!t.category_id && t.amount > 0) continue  // uncategorized inflows are income
    m.set(t.category_id ?? '', (m.get(t.category_id ?? '') ?? 0) - t.amount)
  }
  return [...m].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
}

/** Month-specific budget overrides the default (month = null). */
export function budgetFor(budgets: Budget[], categoryId: string, month: string): number | null {
  const specific = budgets.find(b => b.category_id === categoryId && b.month === monthStart(month))
  const def = budgets.find(b => b.category_id === categoryId && b.month === null)
  return (specific ?? def)?.amount ?? null
}

export function accountBalances(accounts: Account[], txs: Tx[], upTo?: string) {
  const bal = new Map(accounts.map(a => [a.id, Number(a.opening_balance)]))
  for (const t of txs) if (!upTo || t.date <= upTo) bal.set(t.account_id, (bal.get(t.account_id) ?? 0) + Number(t.amount))
  return bal
}

/** Latest valuation per asset on or before `date`. */
export function portfolioValue(valuations: Valuation[], date: string) {
  const latest = new Map<string, Valuation>()
  for (const v of valuations)
    if (v.date <= date && (!latest.has(v.asset_id) || latest.get(v.asset_id)!.date < v.date)) latest.set(v.asset_id, v)
  let value = 0, invested = 0, investedKnown = true
  for (const v of latest.values()) {
    value += Number(v.value)
    if (v.invested == null) investedKnown = false
    else invested += Number(v.invested)
  }
  return { value, invested: investedKnown ? invested : null }
}

/** Month-end cash, investments and net worth for the last `months` months ending with `endMonth`. */
export function netWorthSeries(accounts: Account[], txs: Tx[], valuations: Valuation[], endMonth: string, months: number) {
  const out = []
  for (let i = months - 1; i >= 0; i--) {
    const m = addMonths(endMonth, -i)
    const end = monthEnd(m)
    const cash = [...accountBalances(accounts, txs, end).values()].reduce((s, v) => s + v, 0)
    const investments = portfolioValue(valuations, end).value
    out.push({ month: m, cash, investments, total: cash + investments })
  }
  return out
}

/** Current amount towards a goal: account balance (savings) or asset / whole-portfolio value (investment). */
export function goalCurrent(g: Goal, balances: Map<string, number>, valuations: Valuation[], today: string): number {
  if (g.kind === 'savings') return g.account_id ? balances.get(g.account_id) ?? 0 : 0
  return portfolioValue(g.asset_id ? valuations.filter(v => v.asset_id === g.asset_id) : valuations, today).value
}

export function goalProgress(target: number, balance: number, deadline: string | null, today: string) {
  const remaining = Math.max(0, target - balance)
  let monthly: number | null = null
  if (deadline && remaining > 0) {
    const [y1, m1] = today.split('-').map(Number), [y2, m2] = deadline.split('-').map(Number)
    const monthsLeft = Math.max(1, (y2 - y1) * 12 + (m2 - m1))
    monthly = deadline < today ? remaining : remaining / monthsLeft
  }
  return { pct: Math.min(100, Math.max(0, (balance / target) * 100)), remaining, monthly }
}

export interface Recurring { counterparty: string; amount: number; months: number; lastDate: string; nextDate: string }

/**
 * Recurring outflows: same counterparty in >= 3 different months, roughly monthly
 * (average gap 25–35 days), amounts within ±20% of the median.
 */
export function detectRecurring(txs: Tx[]): Recurring[] {
  const groups = new Map<string, Tx[]>()
  for (const t of txs) {
    if (t.is_transfer || t.amount >= 0 || !t.counterparty) continue
    groups.set(t.counterparty, [...(groups.get(t.counterparty) ?? []), t])
  }
  const out: Recurring[] = []
  for (const [cp, list] of groups) {
    const months = new Set(list.map(t => monthKey(t.date)))
    if (months.size < 3) continue
    const amounts = list.map(t => -t.amount).sort((a, b) => a - b)
    const median = amounts[Math.floor(amounts.length / 2)]
    if (amounts.some(a => Math.abs(a - median) > median * 0.2)) continue
    // one occurrence per month (a monthly item should not repeat within a month)
    if (months.size !== list.length) continue
    const dates = list.map(t => t.date).sort()
    const gaps = dates.slice(1).map((d, i) => (Date.parse(d) - Date.parse(dates[i])) / 86_400_000)
    const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length
    if (avg < 25 || avg > 35) continue
    const last = dates[dates.length - 1]
    const nm = addMonths(monthKey(last), 1)
    const next = `${nm}-${String(Math.min(+last.slice(8), +monthEnd(nm).slice(8))).padStart(2, '0')}`
    out.push({ counterparty: cp, amount: median, months: months.size, lastDate: last, nextDate: next })
  }
  return out.sort((a, b) => b.amount - a.amount)
}

export interface CategoryChange { categoryId: string; cur: number; prev: number; diff: number }

/** Biggest per-category spending changes versus the previous month (uncategorized under ""). */
export function categoryChanges(txs: Tx[], cats: Map<string, Category>, month: string, n = 3): CategoryChange[] {
  const p = addMonths(month, -1)
  const cur = new Map(expenseByCategory(txs, cats, monthStart(month), monthEnd(month)))
  const prev = new Map(expenseByCategory(txs, cats, monthStart(p), monthEnd(p)))
  return [...new Set([...cur.keys(), ...prev.keys()])]
    .map(id => ({ categoryId: id, cur: cur.get(id) ?? 0, prev: prev.get(id) ?? 0, diff: (cur.get(id) ?? 0) - (prev.get(id) ?? 0) }))
    .filter(c => c.diff !== 0)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, n)
}

export interface BudgetAlert { categoryId: string; spent: number; limit: number; projected: number; level: 'over' | 'near' | 'pace' }

/**
 * Budget warnings for the month containing `asOf` (the date the data is complete up to).
 * over: limit exceeded · near: >= 80% used · pace: at the current pace the month would exceed the limit
 * (only from day 6, so a single early purchase does not raise an alarm).
 */
export function budgetAlerts(txs: Tx[], cats: Map<string, Category>, budgets: Budget[], asOf: string): BudgetAlert[] {
  const month = monthKey(asOf)
  const day = +asOf.slice(8), days = +monthEnd(month).slice(8)
  const spent = new Map(expenseByCategory(txs, cats, monthStart(month), asOf))
  const out: BudgetAlert[] = []
  for (const id of new Set(budgets.map(b => b.category_id))) {
    const limit = budgetFor(budgets, id, month)
    if (!limit) continue
    const s = spent.get(id) ?? 0
    const projected = s / day * days
    const level = s > limit ? 'over' : s >= limit * 0.8 ? 'near' : day >= 6 && projected > limit ? 'pace' : null
    if (level) out.push({ categoryId: id, spent: s, limit: Number(limit), projected, level })
  }
  return out.sort((a, b) => b.spent / b.limit - a.spent / a.limit)
}
