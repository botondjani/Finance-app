import type { PdfLine } from './pdfLines'
import { parseNumber } from './util'

const SECTION = /^(Personal Account|Saving) \(([A-Z]{3})\)$/
const DATE = /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/
const NUMBER = /-?[€$£]?-?\d[\d,]*\.\d{2}/g
const SKIP = /Custom Statement|^Generated on|^Transaction statement$|^\/out|^Money in/
// pdf.js sometimes merges a long description with the category cell.
const CATEGORY_SUFFIX = / (Merchant|Others|Refund|Top up|ATM|Exchange|Transfer|Cashback|Reward|Interest|Fee|Card payment)$/

const joinWrapped = (parts: string[]) => parts.reduce((acc, p) => (/\S-$/.test(acc) ? acc + p : acc ? `${acc} ${p}` : p), '')

interface Rec { date: string; desc: string[]; cat: string[]; money: string[] }

/**
 * Converts the Revolut consolidated-statement PDF into the same row layout as its
 * .xlsx export, so parseRevolut (and its balance checks) handles both.
 */
export function revolutPdfToRows(lines: PdfLine[]): unknown[][] {
  const rows: unknown[][] = []
  let active = false
  let currency = 'HUF'
  let cols: { desc: number; cat: number; money: number; tax: number } | null = null
  let moneyX: number | null = null, taxX: number | null = null
  let rec: Rec | null = null

  const flush = () => {
    if (!rec) return
    const nums = (rec.money.join(' ').match(NUMBER) ?? []).map(n => parseNumber(n))
    let desc = joinWrapped(rec.desc).trim(), cat = joinWrapped(rec.cat).trim()
    const merged = !cat ? CATEGORY_SUFFIX.exec(desc) : null
    if (merged) { cat = merged[1]; desc = desc.slice(0, merged.index) }
    const base = [rec.date, desc, cat]
    rows.push(currency === 'HUF' ? [...base, nums[0] ?? null, nums[1] ?? null]
      : [...base, nums[0] ?? null, nums[2] ?? null, nums[1] ?? null, nums[3] ?? null])
    rec = null
  }

  for (const line of lines) {
    const text = line.items.map(i => i.str).join(' ').trim()
    if (text === 'Current Accounts Transaction Statements') { active = true; rows.push([text]); continue }
    if (!active) continue
    if (/Transaction Statements$|^Information about/.test(text)) { flush(); rows.push([text]); active = false; continue }

    const m = SECTION.exec(text)
    if (m) { flush(); currency = m[2]; rows.push([text]); continue }
    const moneyItem = line.items.find(i => i.str.trim() === 'Money in')
    if (moneyItem) { moneyX = moneyItem.x; taxX = line.items.find(i => i.str.trim() === 'Tax')?.x ?? null; continue }
    if (line.items.some(i => i.str.trim() === 'Description')) {
      const x = (s: string) => line.items.find(i => i.str.trim() === s)?.x ?? 0
      cols = { desc: x('Description'), cat: x('Category'), money: moneyX ?? x('Balance') - 50, tax: taxX ?? x('Balance') + 45 }
      rows.push(currency === 'HUF'
        ? ['Date', 'Description', 'Category', 'Money in/out', 'Balance']
        : ['Date', 'Description', 'Category', 'Money in/out', 'Money in/out', 'Balance', 'Balance'])
      continue
    }
    if (!cols || SKIP.test(text)) continue

    const first = line.items[0]
    const firstText = first.str.trim()
    if (first.x < cols.desc - 5 && (DATE.test(firstText) || firstText === 'Total')) {
      flush()
      if (firstText === 'Total') { rows.push(['Total']); continue }
      rec = { date: firstText, desc: [], cat: [], money: [] }
    }
    if (!rec) continue
    for (const it of line.items) {
      if (it.x < cols.desc - 5) continue
      if (it.x < cols.cat - 5) rec.desc.push(it.str.trim())
      else if (it.x < cols.money - 5) rec.cat.push(it.str.trim())
      else if (it.x < cols.tax - 5) rec.money.push(it.str.trim())
    }
  }
  flush()
  return rows
}
