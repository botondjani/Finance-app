import { describe, expect, it } from 'vitest'
import { detectPdf, detectTable, guessMapping, headerSignature } from './detect'

const pdfLine = (str: string) => ({ page: 1, y: 0, items: [{ x: 0, str }] })

describe('provider detection', () => {
  it('recognises OTP PDFs and rejects others', () => {
    expect(detectPdf([pdfLine('SZÁMLAVEZETŐ FIÓK NEVE'), pdfLine('OTP BANK NYRT. BPR')])).toBe('otp')
    expect(detectPdf([pdfLine('Some other bank statement')])).toBeNull()
  })

  it('recognises Lightyear, Revolut and falls back to generic', () => {
    expect(detectTable([['Date', 'Reference', 'Ticker', 'ISIN', 'Type', 'Quantity']])).toBe('lightyear')
    expect(detectTable([['Current Accounts Summaries'], [], ['Current Accounts Transaction Statements']])).toBe('revolut')
    expect(detectTable([['Dátum', 'Összeg']])).toBe('generic')
  })
})

describe('guessMapping', () => {
  it('finds header row, columns, decimal separator and date format', () => {
    const rows = [
      ['Számlatörténet'], [],
      ['Könyvelés dátuma', 'Partner', 'Összeg', 'Deviza'],
      ['2026.11.01', 'Bolt', '-1 234,50', 'HUF'],
      ['2026.11.02', 'Fizetés', '300 000,00', 'HUF'],
    ]
    expect(guessMapping(rows)).toEqual({ headerRow: 2, date: 0, description: 1, amount: 2, currency: 3, dateFormat: 'YYYY-MM-DD', decimal: ',' })
    expect(headerSignature(rows, 2)).toBe('könyvelés dátuma|partner|összeg|deviza')
  })

  it('handles English exports with day-first dates', () => {
    const rows = [['Date', 'Description', 'Amount'], ['23/11/2026', 'Shop', '-12.50'], ['24/11/2026', 'Cafe', '-3.20']]
    expect(guessMapping(rows)).toMatchObject({ headerRow: 0, date: 0, description: 1, amount: 2, currency: undefined, dateFormat: 'DD/MM/YYYY', decimal: '.' })
  })
})
