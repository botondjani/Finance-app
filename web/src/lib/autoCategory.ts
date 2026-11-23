/**
 * Built-in categorization rules for the default categories. A keyword matches a
 * whole word of the (accent-free, lowercased) counterparty + description; a
 * trailing `*` matches word prefixes ("burger*" → "burgerpoint").
 * Rules whose category was renamed/deleted by the user are simply skipped.
 */
interface Rule { category: string; keywords: string[]; incomeOnly?: boolean }

export const RULES: Rule[] = [
  { category: 'Befektetés', keywords: ['lightyear', 'trading 212', 'interactive brokers', 'binance', 'coinbase', 'kraken', 'revolut securities', 'allampapir', 'kincstar'] },
  { category: 'Fizetés', incomeOnly: true, keywords: ['ber', 'havi ber', 'munkaber', 'fizetes', 'salary', 'payroll', 'iskolaszovetkezet', 'diakmunka'] },
  { category: 'Ösztöndíj', incomeOnly: true, keywords: ['osztondij', 'neptun', 'tanulmanyi'] },
  { category: 'Élelmiszer', keywords: ['lidl', 'spar*', 'aldi', 'tesco', 'auchan', 'penny', 'coop', 'cba', 'prima', 'real', 'match', '7 eleven', 'familymart', 'pek', 'pekseg', 'deli', 'kisbolt', 'abc', 'metro', 'rossmann food', 'interspar'] },
  { category: 'Étterem, kávé', keywords: ['burger*', 'mcdonald*', 'kfc', 'subway', 'starbucks', 'costa', 'dunkin', 'wolt', 'foodpanda', 'etterem', 'etelbar', 'bufe', 'falatozo', 'bistro', 'bisztro', 'pizza*', 'sushi', 'wok', 'gyros', 'kebab', 'fornetti', 'munch', 'tejivo', 'kavezo', 'kave', 'coffee', 'cafe', 'cukraszda', 'restaurant', 'restoran', 'gastro', 'kantin', 'menza', 'donuts', 'smashy', 'fusion'] },
  { category: 'Közlekedés', keywords: ['bkk', 'budapestgo', 'mav', 'volan', 'flixbus', 'mol', 'omv', 'shell', 'bp', 'tankstelle', 'taxi', 'fotaxi', 'grab', 'uber', 'parkolas', 'asfinag', 'bus', 'metro taipei', 'e matrica', 'autopalya'] },
  { category: 'Utazás', keywords: ['agoda', 'airbnb', 'booking', 'kiwi', 'ryanair', 'wizz*', 'redbus', 'hotel', 'hostel', 'szallas'] },
  { category: 'Előfizetések', keywords: ['netflix', 'spotify', 'youtube', 'google cloud', 'google one', 'icloud', 'apple', 'disney', 'hbo', 'max', 'claude', 'anthropic', 'openai', 'chatgpt', 'lovable', 'premium plan fee', 'telekom', 'yettel', 'vodafone', 'digi'] },
  { category: 'Szórakozás', keywords: ['cinema', 'mozi', 'steam', 'playstation', 'xbox', 'tippmix', 'szerencsejatek', 'bet', 'elmenykozpont', 'bowling', 'escape', 'gyogyfurdo*', 'furdo', 'palinka*', 'sorozo', 'pub', 'bar', 'kocsma', 'jegy', 'ticket', 'koncert'] },
  { category: 'Ruházat', keywords: ['h&m', 'zara', 'c&a', 'reserved', 'bershka', 'pull&bear', 'primark', 'deichmann', 'zalando', 'about you', 'shein', 'tommy'] },
  { category: 'Sport', keywords: ['decathlon', 'sporttelep', 'fitness', 'gym', 'edzoterem', 'uszoda', 'intersport', 'hervis', 'mountex', 'ultrabalaton'] },
  { category: 'Egészség', keywords: ['patika', 'gyogyszertar', 'pharmacy', 'dm', 'dm drogerie', 'rossmann', 'muller', 'orvos', 'fogorvos', 'medicover', 'optika', 'dental'] },
  { category: 'Lakhatás', keywords: ['alberlet', 'rezsi', 'elmu', 'eon', 'mvm', 'fotav', 'vizmuvek', 'dijnet', 'ikea', 'obi', 'praktiker', 'jysk', 'netrisk'] },
]

const normalize = (s: string) =>
  ' ' + s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9&]+/g, ' ').trim() + ' '

const compiled = RULES.map(r => ({
  ...r,
  tests: r.keywords.map(k => {
    const prefix = k.endsWith('*')
    const word = normalize(prefix ? k.slice(0, -1) : k).trimEnd()
    return (text: string) => text.includes(prefix ? word : word + ' ')
  }),
}))

/** Name of the default category suggested by the built-in rules, or null. */
export function ruleCategory(counterparty: string, description: string, amount: number): string | null {
  const text = normalize(`${counterparty} ${description}`)
  for (const r of compiled) {
    if (r.incomeOnly && amount <= 0) continue
    if (r.tests.some(t => t(text))) return r.category
  }
  return null
}

/**
 * Category for a transaction: the user's own earlier choice for the same
 * counterparty wins, then the built-in rules.
 */
export function suggestCategory(
  t: { counterparty: string; description: string; amount: number },
  learned: Map<string, string>, categoryIdByName: Map<string, string>,
): string | null {
  const own = t.counterparty ? learned.get(t.counterparty) : undefined
  if (own) return own
  const name = ruleCategory(t.counterparty, t.description, t.amount)
  return name ? categoryIdByName.get(name) ?? null : null
}
