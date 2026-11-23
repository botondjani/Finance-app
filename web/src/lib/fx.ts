/** ECB reference rates via Frankfurter. Returns a lookup that uses the latest rate on or before a date. */
export async function loadHufRates(currencies: string[], from: string, to: string) {
  const tables = new Map<string, [string, number][]>()
  // Start a week earlier so weekend/holiday dates have a previous business day.
  const start = new Date(Date.parse(from) - 7 * 86_400_000).toISOString().slice(0, 10)
  for (const c of new Set(currencies)) {
    if (c === 'HUF') continue
    const res = await fetch(`https://api.frankfurter.dev/v1/${start}..${to}?base=${encodeURIComponent(c)}&symbols=HUF`)
    if (!res.ok) continue
    const json = await res.json() as { rates: Record<string, { HUF: number }> }
    tables.set(c, Object.entries(json.rates).map(([d, r]) => [d, r.HUF] as [string, number]).sort((a, b) => a[0].localeCompare(b[0])))
  }
  return (amount: number, currency: string, date: string): number | null => {
    const t = tables.get(currency)
    if (!t) return null
    let rate: number | null = null
    for (const [d, r] of t) { if (d > date) break; rate = r }
    return rate === null ? null : Math.round(amount * rate * 100) / 100
  }
}
