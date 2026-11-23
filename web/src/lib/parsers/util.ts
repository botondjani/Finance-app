export const round2 = (n: number) => Math.round(n * 100) / 100

/** Parses numbers like "-6,400.00 HUF", "-19.990", "1 234,5". decimal = the decimal separator. */
export function parseNumber(raw: unknown, decimal: '.' | ',' = '.'): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (raw == null) return null
  let s = String(raw).replace(/[^\d.,\-−+]/g, '').replace('−', '-')
  if (!s || !/\d/.test(s)) return null
  const thousands = decimal === '.' ? ',' : '.'
  s = s.split(thousands).join('')
  if (decimal === ',') s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export const normalizeCounterparty = (s: string) =>
  s.toLowerCase().replace(/\s+/g, ' ').trim()

export const isoDate = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

export function excelOrJsDate(v: unknown): string | null {
  if (v instanceof Date) return isoDate(v.getFullYear(), v.getMonth() + 1, v.getDate())
  return null
}
