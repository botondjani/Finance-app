import type { ParseResult, ParsedTx } from './types'
import { excelOrJsDate, isoDate, normalizeCounterparty, parseNumber, round2 } from './util'

export type DateFormat = 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY.MM.DD'

export interface MappingConfig {
  headerRow: number          // 0-based index of the header row
  date: number               // column indexes
  amount: number
  description: number
  currency?: number          // optional column; missing = HUF
  dateFormat: DateFormat
  decimal: '.' | ','
}

export function parseDate(v: unknown, fmt: DateFormat): string | null {
  const d = excelOrJsDate(v)
  if (d) return d
  const nums = String(v ?? '').match(/\d+/g)?.map(Number)
  if (!nums || nums.length < 3) return null
  const [a, b, c] = nums
  const [y, m, day] =
    fmt === 'DD/MM/YYYY' ? [c, b, a] :
    fmt === 'MM/DD/YYYY' ? [c, a, b] : [a, b, c]
  if (m < 1 || m > 12 || day < 1 || day > 31) return null
  return isoDate(y < 100 ? 2000 + y : y, m, day)
}

/**
 * Applies a column mapping. Non-HUF rows get their HUF amount from `toHuf`
 * (returns null when no rate is available – the row is then skipped with a warning).
 */
export function parseGeneric(
  rows: unknown[][], cfg: MappingConfig, key: string,
  toHuf: (amount: number, currency: string, date: string) => number | null,
): ParseResult {
  const warnings: string[] = []
  const out: ParsedTx[] = []
  rows.slice(cfg.headerRow + 1).forEach((r, i) => {
    if (!r || r.every(c => c == null || String(c).trim() === '')) return
    const line = cfg.headerRow + i + 2
    const date = parseDate(r[cfg.date], cfg.dateFormat)
    const amount = parseNumber(r[cfg.amount], cfg.decimal)
    if (!date || amount === null) { warnings.push(`${line}. sor kihagyva (dátum/összeg nem értelmezhető)`); return }
    const description = String(r[cfg.description] ?? '').trim()
    const currency = cfg.currency != null ? String(r[cfg.currency] ?? '').trim().toUpperCase() || 'HUF' : 'HUF'
    let huf = amount
    if (currency !== 'HUF') {
      const v = toHuf(amount, currency, date)
      if (v === null) { warnings.push(`${line}. sor kihagyva: nincs ${currency} árfolyam (${date})`); return }
      huf = v
    }
    out.push({
      date, amount: round2(huf), description, counterparty: normalizeCounterparty(description),
      ...(currency !== 'HUF' ? { origAmount: amount, origCurrency: currency } : {}),
    })
  })
  return { source: 'generic', sections: [{ key, currency: 'HUF', rows: out }], warnings }
}
