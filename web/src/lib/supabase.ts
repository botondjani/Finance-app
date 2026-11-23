import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)

/** Throws on Supabase errors so callers can rely on data. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

/** Reads every row of a table, paging past the 1000-row API limit. */
export async function fetchAll<T>(table: string, order = 'id'): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const page = must(await supabase.from(table).select('*').order(order).order('id').range(from, from + 999)) as T[]
    out.push(...page)
    if (page.length < 1000) return out
  }
}
