import { useData } from '../lib/data'
import { CATEGORY_KINDS, type CategoryKind } from '../lib/types'

export default function CategorySelect({ value, onChange, empty = '— nincs —' }:
  { value: string | null; onChange: (id: string | null) => void; empty?: string }) {
  const { categories } = useData()
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value || null)}>
      <option value="">{empty}</option>
      {(Object.keys(CATEGORY_KINDS) as CategoryKind[]).map(k => (
        <optgroup key={k} label={CATEGORY_KINDS[k]}>
          {categories.filter(c => c.kind === k).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      ))}
    </select>
  )
}
