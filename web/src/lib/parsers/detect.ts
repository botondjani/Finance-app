import type { PdfLine } from './pdfLines'
import { parseDate, type DateFormat, type MappingConfig } from './generic'

export type Provider = 'otp' | 'revolut' | 'lightyear' | 'generic'

export const PROVIDER_LABEL: Record<Provider, string> = {
  otp: 'OTP Bank számlakivonat',
  revolut: 'Revolut kivonat',
  lightyear: 'Lightyear befektetési kivonat',
  generic: 'Ismeretlen táblázat',
}

export function detectPdf(lines: PdfLine[]): Provider | null {
  const text = lines.slice(0, 80).map(l => l.items.map(i => i.str).join(' ')).join('\n')
  if (/Lightyear Statement|Lightyear Europe AS/i.test(text)) return 'lightyear'
  if (/Revolut Bank UAB|Current Accounts Summaries/i.test(text)) return 'revolut'
  if (/OTP BANK|OTPVHUHB/i.test(text)) return 'otp'
  return null
}

/** File kind from the first bytes – names/extensions are unreliable on mobile. */
export function sniffKind(head: Uint8Array): 'pdf' | 'xlsx' | 'xls' | 'text' {
  const s = String.fromCharCode(...head.slice(0, 4))
  if (s === '%PDF') return 'pdf'
  if (s === 'PK\u0003\u0004') return 'xlsx'
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return 'xls'
  return 'text'
}

export function detectTable(rows: unknown[][]): Provider {
  const first = (rows[0] ?? []).map(c => String(c ?? '').trim())
  if (['Date', 'Reference', 'Ticker', 'Type'].every(h => first.some(f => f.replace(/^\uFEFF/, '') === h))) return 'lightyear'
  if (rows.some(r => r?.[0] === 'Current Accounts Transaction Statements')) return 'revolut'
  return 'generic'
}

const KEYS = {
  date: /d[áa]tum|date|könyvel|booking|value date|értéknap/i,
  amount: /összeg|osszeg|amount|forgalom|value|érték/i,
  description: /le[íi]r[áa]s|description|közlemény|kozlemeny|megnevez|partner|details|narrative|payee|merchant/i,
  currency: /deviza|currency|pénznem|ccy/i,
}

/** Header-row text, used to recognise a previously saved mapping for the same bank. */
export const headerSignature = (rows: unknown[][], headerRow: number) =>
  (rows[headerRow] ?? []).map(c => String(c ?? '').trim().toLowerCase()).join('|')

/** Best-effort column mapping from header names and sample values. */
export function guessMapping(rows: unknown[][]): MappingConfig {
  let headerRow = 0, best = -1
  rows.slice(0, 15).forEach((r, i) => {
    const score = (r ?? []).filter(c => typeof c === 'string' && Object.values(KEYS).some(k => k.test(c))).length
    if (score > best) { best = score; headerRow = i }
  })
  const header = (rows[headerRow] ?? []).map(c => String(c ?? ''))
  const find = (re: RegExp, not: number[] = []) => header.findIndex((h, i) => re.test(h) && !not.includes(i))
  const date = Math.max(0, find(KEYS.date))
  const amount = Math.max(0, find(KEYS.amount, [date]))
  const descIdx = find(KEYS.description, [date, amount])
  const description = descIdx >= 0 ? descIdx : header.findIndex((_, i) => i !== date && i !== amount)
  const currencyIdx = find(KEYS.currency, [date, amount, description])

  const samples = rows.slice(headerRow + 1, headerRow + 30)
  const amounts = samples.map(r => String(r?.[amount] ?? ''))
  const decimal: ',' | '.' = amounts.some(a => /,\d{1,2}\s*[A-Z]*$/.test(a.trim())) ? ',' : '.'
  const formats: DateFormat[] = ['YYYY-MM-DD', 'YYYY.MM.DD', 'DD/MM/YYYY', 'MM/DD/YYYY']
  const dates = samples.map(r => r?.[date]).filter(v => v != null && v !== '')
  const dateFormat = formats.find(f => dates.length > 0 && dates.every(d => parseDate(d, f) !== null)) ?? 'YYYY-MM-DD'

  return { headerRow, date, amount, description: Math.max(0, description), currency: currencyIdx >= 0 ? currencyIdx : undefined, dateFormat, decimal }
}
