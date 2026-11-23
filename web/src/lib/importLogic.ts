import type { ParsedTx } from './parsers/types'

/** Stable dedupe key. `occurrence` separates identical same-day rows within one file. */
export const importHash = (accountId: string, t: ParsedTx, occurrence: number) =>
  `${accountId}|${t.date}|${t.amount.toFixed(2)}|${t.description}|${occurrence}`

export function withHashes(accountId: string, rows: ParsedTx[]) {
  const seen = new Map<string, number>()
  return rows.map(r => {
    const base = importHash(accountId, r, 0)
    const occ = seen.get(base) ?? 0
    seen.set(base, occ + 1)
    return { ...r, import_hash: importHash(accountId, r, occ) }
  })
}

export interface HistoryTx { counterparty: string; category_id: string | null; date: string }

/** Category of the most recent categorized transaction per counterparty. */
export function learnedCategories(history: HistoryTx[]): Map<string, string> {
  const best = new Map<string, { id: string; date: string }>()
  for (const h of history) {
    if (!h.category_id || !h.counterparty) continue
    const cur = best.get(h.counterparty)
    if (!cur || h.date >= cur.date) best.set(h.counterparty, { id: h.category_id, date: h.date })
  }
  return new Map([...best].map(([k, v]) => [k, v.id]))
}

export interface PairableTx { id: string; account_id: string; date: string; amount: number }

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000

/**
 * Suggests transfer pairs: outflow in one account and an equal inflow in another
 * within ±2 days. Each transaction is used at most once; closest dates win.
 */
export function suggestTransferPairs(txs: PairableTx[]): [PairableTx, PairableTx][] {
  const candidates: { out: PairableTx; inc: PairableTx; d: number }[] = []
  const outs = txs.filter(t => t.amount < 0)
  const ins = txs.filter(t => t.amount > 0)
  for (const out of outs)
    for (const inc of ins) {
      if (out.account_id === inc.account_id) continue
      if (Math.abs(out.amount + inc.amount) > 0.005) continue
      const d = dayDiff(out.date, inc.date)
      if (d <= 2) candidates.push({ out, inc, d })
    }
  candidates.sort((a, b) => a.d - b.d)
  const used = new Set<string>()
  const pairs: [PairableTx, PairableTx][] = []
  for (const c of candidates) {
    if (used.has(c.out.id) || used.has(c.inc.id)) continue
    used.add(c.out.id); used.add(c.inc.id)
    pairs.push([c.out, c.inc])
  }
  return pairs
}
