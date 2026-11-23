const hufFmt = new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 })
export const huf = (n: number) => hufFmt.format(n)

export const monthKey = (date: string) => date.slice(0, 7)            // YYYY-MM
export const monthStart = (key: string) => `${key}-01`
export const todayIso = () => new Date().toISOString().slice(0, 10)
export const currentMonth = () => todayIso().slice(0, 7)

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

export const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', timeZone: 'UTC' })
}

export const monthEnd = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}
