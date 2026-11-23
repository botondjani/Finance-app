import Papa from 'papaparse'
import { parseNumber } from './util'

export interface LightyearRow {
  reference: string
  executed_at: string     // ISO timestamp
  ticker: string | null
  isin: string | null
  type: string
  quantity: number | null
  currency: string
  price: number | null
  gross_amount: number | null
  fx_rate: number | null
  fee: number | null
  net_amount: number | null
}

const REQUIRED = ['Date', 'Reference', 'Ticker', 'Type', 'Quantity', 'CCY', 'Gross Amount']

export function parseLightyear(csv: string): { rows: LightyearRow[]; warnings: string[] } {
  const { data, meta } = Papa.parse<Record<string, string>>(csv.trim(), { header: true, skipEmptyLines: true })
  const missing = REQUIRED.filter(h => !meta.fields?.includes(h))
  if (missing.length) return { rows: [], warnings: [`Nem Lightyear CSV, hiányzó oszlopok: ${missing.join(', ')}`] }
  const warnings: string[] = []
  const rows: LightyearRow[] = []
  for (const r of data) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})$/.exec(r.Date)
    if (!m) { warnings.push(`Ismeretlen dátum: ${r.Date}`); continue }
    const num = (k: string) => (r[k] ? parseNumber(r[k]) : null)
    rows.push({
      reference: r.Reference,
      executed_at: `${m[3]}-${m[2]}-${m[1]}T${m[4]}Z`,
      ticker: r.Ticker || null,
      isin: r.ISIN || null,
      type: r.Type,
      quantity: num('Quantity'),
      currency: r.CCY,
      price: num('Price/share'),
      gross_amount: num('Gross Amount'),
      fx_rate: num('FX Rate'),
      fee: num('Fee'),
      net_amount: num('Net Amt.'),
    })
  }
  return { rows, warnings }
}

export interface Position { ticker: string; isin: string | null; currency: string; quantity: number; cost: number }

/** Open positions with average cost basis in the trading currency. */
export function positionsFrom(rows: LightyearRow[]): Position[] {
  const map = new Map<string, Position>()
  const sorted = [...rows].sort((a, b) => a.executed_at.localeCompare(b.executed_at))
  for (const r of sorted) {
    if (!r.ticker || r.quantity == null || (r.type !== 'Buy' && r.type !== 'Sell')) continue
    const p = map.get(r.ticker) ?? { ticker: r.ticker, isin: r.isin, currency: r.currency, quantity: 0, cost: 0 }
    if (r.type === 'Buy') { p.quantity += r.quantity; p.cost += r.net_amount ?? r.gross_amount ?? 0 }
    else {
      const avg = p.quantity > 0 ? p.cost / p.quantity : 0
      p.quantity -= r.quantity
      p.cost -= avg * r.quantity
    }
    map.set(r.ticker, p)
  }
  return [...map.values()].filter(p => p.quantity > 1e-9)
}

/** Net HUF deposited (deposits minus withdrawals) – rows in other currencies are reported. */
export function netDeposits(rows: LightyearRow[]): { huf: number; other: LightyearRow[] } {
  let huf = 0
  const other: LightyearRow[] = []
  for (const r of rows) {
    if (r.type !== 'Deposit' && r.type !== 'Withdrawal') continue
    if (r.currency !== 'HUF') { other.push(r); continue }
    const v = Math.abs(r.gross_amount ?? 0)
    huf += r.type === 'Deposit' ? v : -v
  }
  return { huf, other }
}
