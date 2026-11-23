// Fixtures are synthetic data in the real export formats (no personal data).
import { describe, expect, it } from 'vitest'
import { otpDetails, parseOtp } from './otp'
import type { PdfLine } from './pdfLines'
import { parseRevolut } from './revolut'
import { netDeposits, parseLightyear, positionsFrom } from './lightyear'
import { parseDate, parseGeneric } from './generic'
import { parseNumber } from './util'

const line = (y: number, ...items: [number, string][]): PdfLine =>
  ({ page: 1, y, items: items.map(([x, str]) => ({ x, str })) })

describe('parseNumber', () => {
  it('handles bank formats', () => {
    expect(parseNumber('-6,400.00 HUF')).toBe(-6400)
    expect(parseNumber('-19.990', ',')).toBe(-19990)
    expect(parseNumber('22,86', ',')).toBe(22.86)
    expect(parseNumber(365)).toBe(365)
    expect(parseNumber('')).toBeNull()
  })
})

describe('OTP', () => {
  it('extracts card merchant, transaction date and foreign amount', () => {
    expect(otpDetails('VÁSÁRLÁS KÁRTYÁVAL, 1111, 0001, Tranzakció: 26.10.22, 22,86 EUR, ACME* SUB, 22,86EUR 370.1'))
      .toEqual({ counterparty: 'acme* sub', txDate: '2026-10-22', origAmount: -22.86, origCurrency: 'EUR' })
    expect(otpDetails('VÁSÁRLÁS KÁRTYÁVAL, 1111, 0002, Tranzakció: 26.10.08, TEST SHOP 12 -GOOGLE').counterparty)
      .toBe('test shop 12')
    expect(otpDetails('AZONNALI FIZETÉS, F.0300, 1111-2222, Példa Kft, Teszt Elek, ref').counterparty).toBe('példa kft')
  })

  it('parses a statement with continuation lines and reconciles balances', () => {
    const r = parseOtp([
      line(600, [36, 'SZÁMLASZÁM:'], [87, '11111111-22222222'], [511, 'DEVIZANEM: HUF']),
      line(529, [35, '26.10.02'], [120, 'NYITÓ EGYENLEG'], [565, '1.000']),
      line(519, [35, '26.10.05'], [70, '26.10.05'], [120, 'AZONNALI FIZETÉS'], [187, ', F.0300, 1-2, Példa Kft, Teszt,'], [548, '50.000']),
      line(510, [120, 'közlemény: bér']),
      line(500, [35, '26.10.09'], [70, '26.10.09'], [120, 'VÁSÁRLÁS KÁRTYÁVAL'], [204, ', 1, 2, Tranzakció: 26.10.08, BOLT -'], [546, '-1.500']),
      line(490, [120, 'GOOGLE']),
      line(480, [35, '26.11.01'], [120, 'ZÁRÓ EGYENLEG'], [548, '49.500']),
      line(400, [34, 'Tájékoztatjuk, hogy ...']),
    ])
    expect(r.warnings).toEqual([])
    const s = r.sections[0]
    expect(s).toMatchObject({ key: 'OTP 11111111-22222222', openingBalance: 1000, closingBalance: 49500 })
    expect(s.rows.map(x => [x.date, x.amount, x.counterparty])).toEqual([
      ['2026-10-05', 50000, 'példa kft'],
      ['2026-10-08', -1500, 'bolt'],
    ])
    expect(s.rows[0].description).toContain('közlemény: bér')
  })

  it('warns when balances do not reconcile', () => {
    const r = parseOtp([
      line(600, [36, 'SZÁMLASZÁM: 1-2']),
      line(529, [35, '26.10.02'], [120, 'NYITÓ EGYENLEG'], [565, '0']),
      line(519, [35, '26.10.05'], [70, '26.10.05'], [120, 'X'], [548, '100']),
      line(480, [35, '26.11.01'], [120, 'ZÁRÓ EGYENLEG'], [548, '200']),
    ])
    expect(r.warnings[0]).toMatch(/Egyeztetési hiba/)
  })
})

describe('Revolut', () => {
  const rows: unknown[][] = [
    ['Current Accounts Summaries'], ['Personal Account (HUF)'],
    ['Current Accounts Transaction Statements'],
    ['Personal Account (HUF)'], ['Transaction statement'],
    ['Date', 'Description', 'Category', 'Money in/out', 'Balance', 'Tax withheld', 'Other taxes', 'Fees'],
    [new Date(2026, 0, 1), 'Coffee Shop', 'Merchant', '-1,000.00 HUF', '9,000.00 HUF'],
    [new Date(2026, 0, 2), 'Transfer from TEST PERSON', 'Others', '500.00 HUF', '9,500.00 HUF'],
    ['Total', null, null, '-500.00 HUF'],
    ['Personal Account (EUR)'], ['Transaction statement'],
    ['Date', 'Description', 'Category', 'Money in/out', 'Money in/out', 'Balance', 'Balance'],
    [new Date(2026, 5, 29), 'Exchanged to EUR', 'Exchange', 10, '4,000.00 HUF', 10, '4,000.00 HUF'],
    [new Date(2026, 5, 30), 'Shop', 'Merchant', -2.5, '-1,000.00 HUF', 7.5, '3,000.00 HUF'],
    ['Total'],
    ['Investment Services Transaction Statements'],
  ]

  it('splits pockets, uses HUF values and computes balances', () => {
    const r = parseRevolut(rows)
    expect(r.warnings).toEqual([])
    expect(r.sections.map(s => [s.key, s.openingBalance, s.closingBalance, s.rows.length])).toEqual([
      ['Revolut HUF', 10000, 9500, 2],
      ['Revolut EUR', 0, 3000, 2],
    ])
    expect(r.sections[0].rows[1]).toMatchObject({ date: '2026-01-02', amount: 500, counterparty: 'test person' })
    expect(r.sections[1].rows[1]).toMatchObject({ amount: -1000, origAmount: -2.5, origCurrency: 'EUR', bankCategory: 'Merchant' })
  })

  it('detects a broken balance chain', () => {
    const broken = rows.map(r => (r[1] === 'Transfer from TEST PERSON' ? [...r.slice(0, 4), '1.00 HUF'] : r))
    expect(parseRevolut(broken).warnings[0]).toMatch(/Revolut HUF: egyenleg-ellentmondás/)
  })
})

describe('Lightyear', () => {
  const csv = `"Date","Reference","Ticker","ISIN","Type","Quantity","CCY","Price/share","Gross Amount","FX Rate","Fee","Net Amt.","Tax Amt."
"03/01/2026 10:00:00","OR-3","AAA","US0000000001","Sell","1","USD","120","120.00","","1.00","119.00",""
"02/01/2026 10:00:00","OR-2","AAA","US0000000001","Buy","2","USD","100","200.00","","1.00","199.00",""
"02/01/2026 09:59:00","CN-1","HUF","","Conversion","","HUF","","-70000.00","0.0028","100.00","-69900.00",""
"01/01/2026 09:00:00","DT-1","","","Deposit","","HUF","","100000.00","","0.00","100000.00",""`

  it('parses rows, positions with average cost, and net deposits', () => {
    const { rows, warnings } = parseLightyear(csv)
    expect(warnings).toEqual([])
    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({ reference: '2026-01-03|Sell|AAA|USD|1|120.00', executed_at: '2026-01-03T10:00:00Z', quantity: 1 })
    expect(positionsFrom(rows)).toEqual([{ ticker: 'AAA', isin: 'US0000000001', currency: 'USD', quantity: 1, cost: 99.5 }])
    expect(netDeposits(rows).huf).toBe(100000)
  })

  it('rejects other CSVs', () => {
    expect(parseLightyear('a,b\n1,2').warnings[0]).toMatch(/Nem Lightyear/)
  })
})

describe('generic mapping', () => {
  it('parses date formats', () => {
    expect(parseDate('23/11/2026', 'DD/MM/YYYY')).toBe('2026-11-23')
    expect(parseDate('11/23/2026', 'MM/DD/YYYY')).toBe('2026-11-23')
    expect(parseDate('2026.11.23.', 'YYYY.MM.DD')).toBe('2026-11-23')
    expect(parseDate('2026-13-01', 'YYYY-MM-DD')).toBeNull()
  })

  it('maps columns and converts foreign currency', () => {
    const r = parseGeneric(
      [['Dátum', 'Leírás', 'Összeg', 'Deviza'], ['2026.11.01', 'Bolt', '-1 234,50', 'HUF'], ['2026.11.02', 'Shop', '-10,00', 'EUR'], ['rossz', 'x', 'y', 'HUF']],
      { headerRow: 0, date: 0, description: 1, amount: 2, currency: 3, dateFormat: 'YYYY.MM.DD', decimal: ',' },
      'Saját bank', (a, c) => (c === 'EUR' ? a * 400 : null),
    )
    expect(r.sections[0].rows.map(x => [x.date, x.amount, x.origCurrency])).toEqual([
      ['2026-11-01', -1234.5, undefined], ['2026-11-02', -4000, 'EUR'],
    ])
    expect(r.warnings).toHaveLength(1)
  })
})
