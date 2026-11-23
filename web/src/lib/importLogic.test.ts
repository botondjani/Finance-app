import { describe, expect, it } from 'vitest'
import { learnedCategories, suggestTransferPairs, withHashes } from './importLogic'

const tx = (date: string, amount: number, description = 'x') => ({ date, amount, description, counterparty: description })

describe('withHashes', () => {
  it('keeps identical same-day rows distinct but stable across re-imports', () => {
    const rows = [tx('2026-01-01', -100), tx('2026-01-01', -100), tx('2026-01-02', -100)]
    const a = withHashes('acc', rows).map(r => r.import_hash)
    expect(new Set(a).size).toBe(3)
    expect(withHashes('acc', rows).map(r => r.import_hash)).toEqual(a)
    expect(withHashes('other', rows)[0].import_hash).not.toBe(a[0])
  })
})

describe('learnedCategories', () => {
  it('uses the most recent category per counterparty', () => {
    const m = learnedCategories([
      { counterparty: 'lidl', category_id: 'food', date: '2026-01-01' },
      { counterparty: 'lidl', category_id: 'other', date: '2026-02-01' },
      { counterparty: 'bk', category_id: null, date: '2026-03-01' },
    ])
    expect(m.get('lidl')).toBe('other')
    expect(m.has('bk')).toBe(false)
  })
})

describe('suggestTransferPairs', () => {
  it('pairs equal opposite amounts across accounts within 2 days, closest first', () => {
    const pairs = suggestTransferPairs([
      { id: 'o1', account_id: 'otp', date: '2026-01-10', amount: -50000 },
      { id: 'r1', account_id: 'rev', date: '2026-01-11', amount: 50000 },
      { id: 'r2', account_id: 'rev', date: '2026-01-10', amount: 50000 },
      { id: 'r3', account_id: 'rev', date: '2026-01-20', amount: 7000 },
      { id: 'o3', account_id: 'otp', date: '2026-01-15', amount: -7000 }, // too far apart
      { id: 's1', account_id: 'otp', date: '2026-01-10', amount: 50000 }, // same account
    ])
    expect(pairs.map(([a, b]) => [a.id, b.id])).toEqual([['o1', 'r2']])
  })

  it('allows a 2% FX spread only when one side is a foreign-currency row', () => {
    const pairs = suggestTransferPairs([
      { id: 'h', account_id: 'huf', date: '2026-06-29', amount: -130067.32 },
      { id: 'e', account_id: 'eur', date: '2026-06-29', amount: 129330.45, orig_currency: 'EUR' },
      { id: 'x', account_id: 'otp', date: '2026-06-29', amount: -1000 },
      { id: 'y', account_id: 'rev', date: '2026-06-29', amount: 990 },
    ])
    expect(pairs.map(([a, b]) => [a.id, b.id])).toEqual([['h', 'e']])
  })
})
