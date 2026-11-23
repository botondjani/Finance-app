import type { PdfLine } from './pdfLines'
import type { ParseResult, ParsedTx } from './types'
import { isoDate, normalizeCounterparty, parseNumber } from './util'

const DATE = /^(\d{2})\.(\d{2})\.(\d{2})$/
const AMOUNT = /^-?\d{1,3}(\.\d{3})*$/

const toIso = (s: string) => {
  const m = DATE.exec(s)!
  return isoDate(2000 + +m[1], +m[2], +m[3])
}

/** Extracts merchant / partner name and original currency info from an OTP description. */
export function otpDetails(desc: string): Pick<ParsedTx, 'counterparty' | 'origAmount' | 'origCurrency'> & { txDate?: string } {
  const parts = desc.split(',').map(s => s.trim())
  const type = parts[0]
  const card = /Tranzakció: (\d{2}\.\d{2}\.\d{2})/.exec(desc)
  if (card) {
    const after = desc.slice(card.index + card[0].length).replace(/^,\s*/, '')
    const fx = /^(\d+(?:,\d+)?) ([A-Z]{3}),\s*/.exec(after)
    const rest = fx ? after.slice(fx[0].length) : after
    const name = rest.split(',')[0].replace(/\s*-\s*(GOOGLE|ÉRINTŐ|APPLE[^,]*)?\s*$/i, '').trim()
    return {
      counterparty: normalizeCounterparty(name || type),
      txDate: toIso(card[1]),
      ...(fx ? { origAmount: -(parseNumber(fx[1], ',') ?? 0), origCurrency: fx[2] } : {}),
    }
  }
  // Transfers: "TYPE, F.xxxx, account, Partner name, ..."
  if (parts[1]?.startsWith('F.') && parts[3]) return { counterparty: normalizeCounterparty(parts[3]) }
  return { counterparty: normalizeCounterparty(type) }
}

export function parseOtp(lines: PdfLine[]): ParseResult {
  const warnings: string[] = []
  let accountNo = '', currency = 'HUF'
  let opening: number | undefined, closing: number | undefined
  const rows: (ParsedTx & { bookDate: string })[] = []
  let current: { desc: string[]; descX: number; date: string; amount: number } | null = null

  const flush = () => {
    if (!current) return
    const description = current.desc.join(' ').replace(/\s+/g, ' ').replace(/ ,/g, ',').trim()
    const { txDate, ...details } = otpDetails(description)
    rows.push({ date: txDate ?? current.date, bookDate: current.date, amount: current.amount, description, ...details })
    current = null
  }

  for (const line of lines) {
    const texts = line.items.map(i => i.str.trim())
    const joined = texts.join(' ')
    const acc = /SZÁMLASZÁM:\s*([\d-]+)/.exec(joined)
    if (acc && !accountNo) accountNo = acc[1]
    const cur = /DEVIZANEM:\s*([A-Z]{3})/.exec(joined)
    if (cur) currency = cur[1]

    const first = line.items[0]
    if (DATE.test(texts[0] ?? '')) {
      flush()
      const descStart = line.items.findIndex(i => !DATE.test(i.str.trim()))
      const last = line.items[line.items.length - 1]
      const amount = AMOUNT.test(last.str.trim()) && descStart < line.items.length - 1 ? parseNumber(last.str, ',') : null
      const descItems = line.items.slice(descStart, amount === null ? undefined : -1)
      const descText = descItems.map(i => i.str).join('')
      if (/NYITÓ EGYENLEG/.test(descText)) { opening = amount ?? undefined; continue }
      if (/ZÁRÓ EGYENLEG/.test(descText)) { closing = amount ?? undefined; continue }
      if (amount === null) { warnings.push(`Összeg nélküli sor kihagyva: ${joined}`); continue }
      current = { desc: [descText], descX: descItems[0].x, date: toIso(texts[0]), amount }
    } else if (current && first && Math.abs(first.x - current.descX) < 3) {
      current.desc.push(line.items.map(i => i.str).join(''))
    } else {
      flush()
    }
  }
  flush()

  if (!accountNo) warnings.push('Nem találtam OTP számlaszámot – biztos OTP kivonat?')
  if (opening !== undefined && closing !== undefined) {
    const sum = rows.reduce((s, r) => s + r.amount, 0)
    if (Math.round(opening + sum - closing) !== 0)
      warnings.push(`Egyeztetési hiba: nyitó ${opening} + tételek ${sum} ≠ záró ${closing}`)
  }
  return {
    source: 'otp',
    sections: [{
      key: `OTP ${accountNo}`, currency, openingBalance: opening, closingBalance: closing,
      rows: rows.map(({ bookDate: _b, ...r }) => r),
    }],
    warnings,
  }
}
