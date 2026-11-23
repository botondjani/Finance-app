import type { ParseResult, ParsedSection } from './types'
import { excelOrJsDate, isoDate, normalizeCounterparty, parseNumber, round2 } from './util'

const SECTION = /^(Personal Account|Saving) \(([A-Z]{3})\)$/

function toDate(v: unknown): string | null {
  const d = excelOrJsDate(v)
  if (d) return d
  if (typeof v === 'string') {
    const t = new Date(v)
    if (!isNaN(+t)) return isoDate(t.getFullYear(), t.getMonth() + 1, t.getDate())
  }
  return null
}

/** Strips "Transfer from/to" style prefixes so the counterparty is the person / merchant. */
const counterpartyOf = (desc: string) =>
  normalizeCounterparty(desc.replace(/^(Transfer (from|to)|Payment from|To|From)\s+/i, ''))

/** Parses the Revolut "consolidated statement" .xlsx (rows as arrays, first sheet). */
export function parseRevolut(rows: unknown[][]): ParseResult {
  const warnings: string[] = []
  const sections: ParsedSection[] = []
  let inTransactions = false
  let sec: (ParsedSection & { dual: boolean; balances: number[]; origBalances: number[] }) | null = null

  for (const row of rows) {
    const c0 = typeof row?.[0] === 'string' ? (row[0] as string).trim() : row?.[0]
    if (c0 === 'Current Accounts Transaction Statements') { inTransactions = true; continue }
    if (typeof c0 === 'string' && /Transaction Statements$/.test(c0)) { inTransactions = false; sec = null; continue }
    if (!inTransactions) continue

    const m = typeof c0 === 'string' ? SECTION.exec(c0) : null
    if (m) {
      sec = { key: `Revolut ${m[1] === 'Saving' ? 'Megtakarítás' : ''} ${m[2]}`.replace(/\s+/g, ' '),
        currency: m[2], rows: [], dual: false, balances: [], origBalances: [] }
      sections.push(sec)
      continue
    }
    if (!sec) continue
    if (c0 === 'Date') { sec.dual = row.filter(c => c === 'Money in/out').length > 1; continue }
    if (c0 === 'Total') { sec = null; continue }

    const date = toDate(c0)
    if (!date) continue
    const description = String(row[1] ?? '').trim()
    const huf = parseNumber(sec.dual ? row[4] : row[3])
    const balance = parseNumber(sec.dual ? row[6] : row[4])
    if (huf === null) { warnings.push(`${sec.key}: összeg nélküli sor kihagyva (${date} ${description})`); continue }
    const tx = { date, amount: round2(huf), description, counterparty: counterpartyOf(description),
      bankCategory: String(row[2] ?? '') || undefined } as ParsedSection['rows'][number]
    if (sec.dual) {
      tx.origAmount = parseNumber(row[3]) ?? undefined
      tx.origCurrency = sec.currency
      const ob = parseNumber(row[5]); if (ob !== null) sec.origBalances.push(ob)
    }
    if (balance !== null) sec.balances.push(balance)
    sec.rows.push(tx)
  }

  for (const s of sections as (ParsedSection & { dual: boolean; balances: number[]; origBalances: number[] })[]) {
    if (s.rows.length && s.balances.length === s.rows.length) {
      s.openingBalance = round2(s.balances[0] - s.rows[0].amount)
      s.closingBalance = s.balances[s.balances.length - 1]
      // Reconcile in the pocket's own currency (HUF values of foreign pockets move with FX).
      const amounts = s.dual ? s.rows.map(r => r.origAmount ?? 0) : s.rows.map(r => r.amount)
      const bal = s.dual ? s.origBalances : s.balances
      for (let i = 1; i < amounts.length; i++)
        if (bal[i] !== undefined && Math.abs(bal[i - 1] + amounts[i] - bal[i]) > 0.011) {
          warnings.push(`${s.key}: egyenleg-ellentmondás ${s.rows[i].date} (${s.rows[i].description})`)
          break
        }
    }
    delete (s as Partial<typeof s>).dual
    delete (s as Partial<typeof s>).balances
    delete (s as Partial<typeof s>).origBalances
  }
  if (!sections.length) warnings.push('Nem találtam Revolut számlaszakaszt – biztos Revolut consolidated statement?')
  return { source: 'revolut', sections: sections.filter(s => s.rows.length), warnings }
}
