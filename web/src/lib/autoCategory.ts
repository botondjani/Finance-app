import { learnedCategories } from './importLogic'
import type { Category, Tx } from './types'

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
  { category: 'Élelmiszer', keywords: ['elelmiszer', 'conad', 'mydin', 'carrefour', 'billa', 'kaufland', 'eurospar', 'esselunga', 'mercator', 'zabka', 'lotus*', 'aeon', 'big c', 'vegyesbolt', 'groceries', 'supermarket*', 'minimarket*', 'lidl', 'spar*', 'aldi', 'tesco', 'auchan', 'penny', 'coop', 'cba', 'prima', 'real', 'match', '7 eleven', 'familymart', 'pek', 'pekseg', 'deli', 'kisbolt', 'abc', 'metro', 'rossmann food', 'interspar'] },
  { category: 'Étterem, kávé', keywords: ['pizz*', 'gelat*', 'fagyi*', 'kafe', 'caffe', 'caffetteria', 'pasticceria', 'bakery', 'food', 'kentucky', 'hummus*', 'greek', 'picerija', 'trattoria', 'osteria', 'ristorante', 'pizzeria', 'taverna', 'bistrot', 'langos', 'street food', 'tea', 'boba', 'bubble tea', 'relay', 'kitchen', 'grill', 'diner', 'noodle*', 'ramen', 'pho', 'burger*', 'mcdonald*', 'kfc', 'subway', 'starbucks', 'costa', 'dunkin', 'wolt', 'foodpanda', 'etterem', 'etelbar', 'bufe', 'falatozo', 'bistro', 'bisztro', 'pizza*', 'sushi', 'wok', 'gyros', 'kebab', 'fornetti', 'munch', 'tejivo', 'kavezo', 'kave', 'coffee', 'cafe', 'cukraszda', 'restaurant', 'restoran', 'gastro', 'kantin', 'menza', 'donuts', 'smashy', 'fusion'] },
  { category: 'Közlekedés', keywords: ['parkol*', 'autostrad*', 'slovnaft', 'blablacar', 'airpullman', 'lime', 'mobility', 'petrol', 'fuel', 'esso', 'agip', 'eni', 'lukoil', 'mrt', 'railway', 'trenitalia', 'oebb', 'obb', 'bkk', 'budapestgo', 'mav', 'volan', 'flixbus', 'mol', 'omv', 'shell', 'bp', 'tankstelle', 'taxi', 'fotaxi', 'grab', 'uber', 'parkolas', 'asfinag', 'bus', 'metro taipei', 'e matrica', 'autopalya'] },
  { category: 'Utazás', keywords: ['12go', 'baolau', 'go to gate', 'gotogate', 'airalo', 'airasia', 'easyjet', 'lufthansa', 'expedia', 'trip com', 'hostelworld', 'resort', 'guesthouse', 'airport', 'duty free', 'agoda', 'airbnb', 'booking', 'kiwi', 'ryanair', 'wizz*', 'redbus', 'hotel', 'hostel', 'szallas'] },
  { category: 'Előfizetések', keywords: ['strava', 'google play', 'app store', 'microsoft', 'adobe', 'notion', 'duolingo', 'audible', 'kindle', 'netflix', 'spotify', 'youtube', 'google cloud', 'google one', 'icloud', 'apple', 'disney', 'hbo', 'max', 'claude', 'anthropic', 'openai', 'chatgpt', 'lovable', 'premium plan fee', 'telekom', 'yettel', 'vodafone', 'digi'] },
  { category: 'Szórakozás', keywords: ['eventim', 'tilos', 'museum', 'muzeum', 'gardens by the bay', 'zoo', 'allatkert', 'szinhaz', 'theatre', 'festival', 'fesztival', 'cinema', 'mozi', 'steam', 'playstation', 'xbox', 'tippmix', 'szerencsejatek', 'bet', 'elmenykozpont', 'bowling', 'escape', 'gyogyfurdo*', 'furdo', 'palinka*', 'sorozo', 'pub', 'bar', 'kocsma', 'jegy', 'ticket', 'koncert'] },
  { category: 'Ruházat', keywords: ['uniqlo', 'mango', 'nike', 'adidas', 'new yorker', 'lacoste', 'h&m', 'zara', 'c&a', 'reserved', 'bershka', 'pull&bear', 'primark', 'deichmann', 'zalando', 'about you', 'shein', 'tommy'] },
  { category: 'Sport', keywords: ['decathlon', 'sporttelep', 'fitness', 'gym', 'edzoterem', 'uszoda', 'intersport', 'hervis', 'mountex', 'ultrabalaton'] },
  { category: 'Egészség', keywords: ['patika', 'gyogyszertar', 'pharmacy', 'dm', 'dm drogerie', 'rossmann', 'muller', 'orvos', 'fogorvos', 'medicover', 'optika', 'dental'] },
  { category: 'Ajándék', keywords: ['virag*', 'flower*', 'ajandek*', 'gift'] },
  { category: 'Lakhatás', keywords: ['festek*', 'barkacs*', 'bauhaus', 'leroy merlin', 'alberlet', 'rezsi', 'elmu', 'eon', 'mvm', 'fotav', 'vizmuvek', 'dijnet', 'ikea', 'obi', 'praktiker', 'jysk', 'netrisk'] },
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

/** Moves between the user's own accounts that bank statements label clearly (e.g. Revolut card top-ups). */
export const isOwnTransfer = (counterparty: string, description: string) =>
  /^(top-up by|exchanged to|exchange to|to (eur|huf|usd) (vault|pocket))/i.test(`${counterparty || description}`.trim())

/** What the automatic pass would change on uncategorized, non-transfer transactions. */
export function autoAssignments(txs: Tx[], categories: Category[]) {
  const learned = learnedCategories(txs)
  const byName = new Map(categories.map(c => [c.name, c.id]))
  const byCategory = new Map<string, string[]>()
  const transfers: string[] = []
  for (const t of txs) {
    if (t.category_id || t.is_transfer) continue
    if (isOwnTransfer(t.counterparty, t.description)) { transfers.push(t.id); continue }
    const c = suggestCategory(t, learned, byName)
    if (c) byCategory.set(c, [...(byCategory.get(c) ?? []), t.id])
  }
  return { byCategory, transfers, count: transfers.length + [...byCategory.values()].reduce((s, ids) => s + ids.length, 0) }
}
