import { describe, expect, it } from 'vitest'
import { isOwnTransfer as _own, ruleCategory, suggestCategory } from "./autoCategory"

const cat = (cp: string, desc = '', amount = -1000) => ruleCategory(cp, desc, amount)

describe('ruleCategory', () => {
  it('maps common merchants', () => {
    expect(cat('lidl hu 346 budapest')).toBe('Élelmiszer')
    expect(cat('spar food & fuel')).toBe('Élelmiszer')
    expect(cat("mcdonald's")).toBe('Étterem, kávé')
    expect(cat('burgerpoint-o\'buda/ham')).toBe('Étterem, kávé')
    expect(cat('bem kavezo')).toBe('Étterem, kávé')
    expect(cat('budapestgo')).toBe('Közlekedés')
    expect(cat('bp tankstelle')).toBe('Közlekedés')
    expect(cat('spotify')).toBe('Előfizetések')
    expect(cat('anthropic* claude sub')).toBe('Előfizetések')
    expect(cat('decathlon nyugati ter')).toBe('Sport')
    expect(cat('dm drogerie')).toBe('Egészség')
    expect(cat('airbnb')).toBe('Utazás')
    expect(cat('lightyear')).toBe('Befektetés')
  })

  it('avoids false positives', () => {
    expect(cat('fusion befektetesi')).toBe('Étterem, kávé')   // a restaurant, not an investment
    expect(cat('barion')).toBeNull()                          // "bar" must be a whole word
    expect(cat('gabor gyorgy jani', '', 30000)).toBeNull()      // private transfers stay uncategorized
    expect(cat('bpnet')).toBeNull()
  })

  it('applies income rules only to inflows', () => {
    expect(cat('quantum diakmunka iskolaszovetkezet', '9. havi ber', 56000)).toBe('Fizetés')
    expect(cat('eotvos lorand tudomanyegyetem', 'ELTE NEPTUN kifiz ÖSZTÖNDÍJ ÁTUTALÁS', 57200)).toBe('Ösztöndíj')
    expect(cat('valami', 'havi ber', -5000)).toBeNull()
  })
})

describe('suggestCategory', () => {
  const ids = new Map([['Élelmiszer', 'food'], ['Étterem, kávé', 'rest']])
  it('prefers the user\'s own earlier choice over rules', () => {
    expect(suggestCategory({ counterparty: 'lidl', description: '', amount: -1 }, new Map([['lidl', 'custom']]), ids)).toBe('custom')
    expect(suggestCategory({ counterparty: 'lidl', description: '', amount: -1 }, new Map(), ids)).toBe('food')
    expect(suggestCategory({ counterparty: 'spotify', description: '', amount: -1 }, new Map(), ids)).toBeNull() // category missing
  })
})

describe('extended rules', () => {
  it('recognises more merchants and does not treat a Hungarian "bolt" as transport', () => {
    expect(ruleCategory('gelateria peppino', 'Gelateria Peppino', -100)).toBe('Étterem, kávé')
    expect(ruleCategory('margitsziget parkol', '', -100)).toBe('Közlekedés')
    expect(ruleCategory('vitateka elelmiszer', '', -100)).toBe('Élelmiszer')
    expect(ruleCategory('viragert', '', -100)).toBe('Ajándék')
    expect(ruleCategory('sarki bolt', '', -100)).toBeNull()
  })
  it('detects top-ups as own transfers', () => {
    expect(_own('top-up by *1234', 'Top-up by *1234')).toBe(true)
    expect(_own('lidl', 'Lidl')).toBe(false)
  })
})
