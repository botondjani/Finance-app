// Synthetic data in the real PDF layouts (no personal data).
import { describe, expect, it } from 'vitest'
import type { PdfLine } from './pdfLines'
import { parseRevolut } from './revolut'
import { revolutPdfToRows } from './revolutPdf'
import { parseLightyear, parseLightyearPdf } from './lightyear'
import { detectTable, sniffKind } from './detect'

let y = 1000
const L = (page: number, ...items: [number, string][]): PdfLine => ({ page, y: y--, items: items.map(([x, str]) => ({ x, str })) })
const header = (p: number) => [
  L(p, [384, 'Custom Statement']), L(p, [457, 'Jan 1, 2026 - Nov 23, 2026']),
  L(p, [338, 'Money in'], [430, 'Tax'], [472, 'Other']),
  L(p, [40, 'Date'], [123, 'Description'], [254, 'Category'], [385, 'Balance'], [537, 'Fees']),
  L(p, [338, '/out'], [430, 'withheld'], [472, 'taxes']),
]

describe('Revolut PDF', () => {
  const lines = [
    L(1, [40, 'Current Accounts Summaries']),
    L(1, [40, 'Current Accounts Transaction Statements']),
    L(1, [40, 'Personal Account (HUF)']), L(1, [40, 'Transaction statement']), ...header(1),
    L(1, [40, 'Jan 1, 2026'], [123, 'Coffee Shop'], [254, 'Merchant'], [338, '-1,000.00'], [385, '9,000.00'], [430, '0.00 HUF']),
    L(1, [338, 'HUF'], [385, 'HUF']),
    L(1, [40, 'Jan 2, 2026'], [123, 'Refund Shop'], [254, 'Refund'], [338, '500.00 HUF 9,500.00'], [430, '0.00 HUF']),
    L(1, [385, 'HUF']),
    L(1, [40, 'Jan 3, 2026'], [254, 'Others'], [430, '0.00 HUF']),          // row continues on the next page
    ...header(2),
    L(2, [123, 'Transfer from TEST'], [338, '2,000.00'], [385, '11,500.00']),
    L(2, [123, 'PERSON'], [338, 'HUF'], [385, 'HUF']),
    L(2, [40, 'Jan 4, 2026'], [123, 'Transfer from ANNA KISS- Others'], [338, '100.00'], [385, '11,600.00']),
    L(2, [40, 'Total'], [338, '1,600.00']),
    L(3, [40, 'Personal Account (EUR)']), L(3, [40, 'Transaction statement']), ...header(3),
    L(3, [40, 'Jun 29, 2026'], [123, 'Exchanged to EUR'], [254, 'Exchange'], [338, '€10.00'], [385, '€10.00'], [430, '€0.00']),
    L(3, [338, '4,000.00 HUF'], [385, '4,000.00 HUF'], [430, '0.00 HUF']),
    L(3, [40, 'Total'], [338, '€10.00']),
    L(4, [40, 'Information about Current Accounts statement']),
  ]

  it('produces the same result as the Excel parser would', () => {
    const r = parseRevolut(revolutPdfToRows(lines))
    expect(r.warnings).toEqual([])
    const [huf, eur] = r.sections
    expect([huf.key, huf.openingBalance, huf.closingBalance]).toEqual(['Revolut HUF', 10000, 11600])
    expect(huf.rows.map(x => [x.date, x.amount, x.description, x.bankCategory])).toEqual([
      ['2026-01-01', -1000, 'Coffee Shop', 'Merchant'],
      ['2026-01-02', 500, 'Refund Shop', 'Refund'],
      ['2026-01-03', 2000, 'Transfer from TEST PERSON', 'Others'],
      ['2026-01-04', 100, 'Transfer from ANNA KISS-', 'Others'],
    ])
    expect(eur.rows[0]).toMatchObject({ amount: 4000, origAmount: 10, origCurrency: 'EUR' })
  })
})

describe('Lightyear PDF', () => {
  const lines = [
    L(1, [34, 'Your Lightyear Statement']),
    L(1, [34, 'As of 22 November 2026']),
    L(1, [34, 'Portfolio total'], [485, 'Ft2,140,279']),
    L(2, [34, 'Date'], [80, 'Symbol'], [112, 'ISIN'], [181, 'Type'], [260, 'Quantity'], [292, 'CCY'], [322, 'Price/share'],
      [372, 'Gross amt.'], [426, 'FX Rate'], [468, 'Fee'], [502, 'Net amt.']),
    L(2, [34, '11/11/2026'], [80, 'AAA'], [112, 'US0000000001'], [181, 'Buy'], [252, '2.5'], [293, 'USD'], [337, '$100.00'], [378, '$250.00'], [462, '$1.00'], [502, '$249.00']),
    L(2, [34, '11/11/2026'], [80, 'HUF'], [181, 'Conversion'], [293, 'HUF'], [371, '-Ft90,000'], [423, '0.002741'], [460, 'Ft200'], [495, '-Ft89,800']),
    L(2, [34, '10/11/2026'], [181, 'Deposit'], [293, 'HUF'], [373, 'Ft100,000'], [458, 'Ft0'], [497, 'Ft100,000']),
  ]
  const csv = `﻿"Date","Reference","Ticker","ISIN","Type","Quantity","CCY","Price/share","Gross Amount","FX Rate","Fee","Net Amt.","Tax Amt."
"11/11/2026 19:26:10","OR-1","AAA","US0000000001","Buy","2.5","USD","100","250.00","","1.00","249.00",""
"10/11/2026 08:00:00","DT-1","","","Deposit","","HUF","","100000.00","","0.00","100000.00",""`

  it('parses transactions and the portfolio total', () => {
    const r = parseLightyearPdf(lines)
    expect(r.warnings).toEqual([])
    expect(r.valuation).toEqual({ date: '2026-11-22', value: 2140279 })
    expect(r.rows.map(x => [x.type, x.ticker, x.currency, x.quantity, x.gross_amount, x.fee])).toEqual([
      ['Buy', 'AAA', 'USD', 2.5, 250, 1], ['Conversion', 'HUF', 'HUF', null, -90000, 200], ['Deposit', null, 'HUF', null, 100000, 0],
    ])
  })

  it('gives CSV and PDF rows the same dedupe key (CSV with BOM)', () => {
    const fromCsv = parseLightyear(csv)
    expect(fromCsv.warnings).toEqual([])
    const pdfKeys = new Set(parseLightyearPdf(lines).rows.map(r => r.reference))
    expect(fromCsv.rows.every(r => pdfKeys.has(r.reference))).toBe(true)
    expect(detectTable([['﻿Date', 'Reference', 'Ticker', 'ISIN', 'Type']])).toBe('lightyear')
  })
})

describe('sniffKind', () => {
  const b = (s: string) => new Uint8Array([...s].map(c => c.charCodeAt(0)))
  it('detects file kind from content', () => {
    expect(sniffKind(b('%PDF-1.7'))).toBe('pdf')
    expect(sniffKind(b('PK\u0003\u0004xx'))).toBe('xlsx')
    expect(sniffKind(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toBe('xls')
    expect(sniffKind(b('"Date",'))).toBe('text')
  })
})
