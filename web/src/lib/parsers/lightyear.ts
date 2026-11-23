import Papa from 'papaparse'
import type { PdfLine } from './pdfLines'
import { isoDate, parseNumber } from './util'

export interface LightyearRow {
  reference: string       // content key – identical for the CSV and the PDF export of the same row
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

const contentKey = (r: Omit<LightyearRow, 'reference'>) =>
  [r.executed_at.slice(0, 10), r.type, r.ticker ?? '', r.currency, r.quantity ?? '', r.gross_amount?.toFixed(2) ?? ''].join('|')
const withKey = (r: Omit<LightyearRow, 'reference'>): LightyearRow => ({ reference: contentKey(r), ...r })

export function parseLightyear(csv: string): { rows: LightyearRow[]; warnings: string[] } {
  const { data, meta } = Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, '').trim(), { header: true, skipEmptyLines: true })
  const missing = REQUIRED.filter(h => !meta.fields?.includes(h))
  if (missing.length) return { rows: [], warnings: [`Nem Lightyear CSV, hiányzó oszlopok: ${missing.join(', ')}`] }
  const warnings: string[] = []
  const rows: LightyearRow[] = []
  for (const r of data) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})$/.exec(r.Date)
    if (!m) { warnings.push(`Ismeretlen dátum: ${r.Date}`); continue }
    const num = (k: string) => (r[k] ? parseNumber(r[k]) : null)
    rows.push(withKey({
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
    }))
  }
  return { rows, warnings }
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const PDF_COLS = ['Date', 'Symbol', 'ISIN', 'Type', 'Quantity', 'CCY', 'Price/share', 'Gross amt.', 'FX Rate', 'Fee', 'Net amt.'] as const

/** Lightyear account statement PDF: transactions plus the portfolio total (HUF) on the statement date. */
export function parseLightyearPdf(lines: PdfLine[]) {
  const rows: LightyearRow[] = []
  const warnings: string[] = []
  let valuation: { date: string; value: number } | undefined
  let asOf: string | undefined
  let header: { name: string; x: number }[] | null = null

  for (const line of lines) {
    const text = line.items.map(i => i.str).join(' ').trim()
    const a = /^As of (\d{1,2}) ([A-Za-z]+) (\d{4})/.exec(text)
    if (a && MONTHS.includes(a[2].toLowerCase())) asOf = isoDate(+a[3], MONTHS.indexOf(a[2].toLowerCase()) + 1, +a[1])
    if (/^Portfolio total/.test(text) && asOf) {
      const v = parseNumber(line.items[line.items.length - 1].str)
      if (v !== null) valuation = { date: asOf, value: v }
    }
    if (['Date', 'Symbol', 'ISIN', 'Type'].every(h => line.items.some(i => i.str.trim() === h))) {
      header = line.items.map(i => ({ name: i.str.trim(), x: i.x })).filter(h => (PDF_COLS as readonly string[]).includes(h.name))
      continue
    }
    const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(line.items[0]?.str.trim() ?? '')
    if (!header || !d) continue
    const cell: Record<string, string> = {}
    for (const it of line.items.slice(1)) {
      const col = header.reduce((b, h) => (Math.abs(h.x - it.x) < Math.abs(b.x - it.x) ? h : b))
      cell[col.name] = it.str.trim()
    }
    const num = (k: string) => (cell[k] ? parseNumber(cell[k]) : null)
    if (!cell.Type || !cell.CCY) { warnings.push(`Nem értelmezhető sor: ${text}`); continue }
    rows.push(withKey({
      executed_at: `${d[3]}-${d[2]}-${d[1]}T00:00:00Z`,
      ticker: cell.Symbol || null, isin: cell.ISIN || null, type: cell.Type, quantity: num('Quantity'), currency: cell.CCY,
      price: num('Price/share'), gross_amount: num('Gross amt.'), fx_rate: num('FX Rate'), fee: num('Fee'), net_amount: num('Net amt.'),
    }))
  }
  if (!rows.length && !valuation) warnings.push('Nem találtam tranzakciót a Lightyear PDF-ben.')
  return { rows, warnings, valuation }
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
