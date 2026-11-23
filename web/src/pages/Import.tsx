import { useEffect, useState } from 'react'
import { useData } from '../lib/data'
import { huf } from '../lib/format'
import { loadHufRates } from '../lib/fx'
import { learnedCategories, suggestTransferPairs, withHashes } from '../lib/importLogic'
import { detectPdf, detectTable, guessMapping, headerSignature, PROVIDER_LABEL, type Provider } from '../lib/parsers/detect'
import { parseGeneric, type DateFormat, type MappingConfig } from '../lib/parsers/generic'
import { netDeposits, parseLightyear, parseLightyearPdf, type LightyearRow } from '../lib/parsers/lightyear'
import { parseOtp } from '../lib/parsers/otp'
import { parseRevolut } from '../lib/parsers/revolut'
import { revolutPdfToRows } from '../lib/parsers/revolutPdf'
import type { ParseResult, ParsedSection } from '../lib/parsers/types'
import { fileKind, readPdfLines, readTable, readText } from '../lib/readFile'
import { accountBalances } from '../lib/stats'
import { fetchAll, must, supabase } from '../lib/supabase'

interface LightyearData { rows: LightyearRow[]; warnings: string[]; valuation?: { date: string; value: number } }
interface Detected { provider: Provider; result?: ParseResult; table?: unknown[][]; lightyear?: LightyearData }

async function analyse(file: File): Promise<Detected> {
  const kind = await fileKind(file)
  if (kind === 'pdf') {
    const lines = await readPdfLines(file)
    const provider = detectPdf(lines)
    if (provider === 'otp') return { provider, result: parseOtp(lines) }
    if (provider === 'revolut') return { provider, result: parseRevolut(revolutPdfToRows(lines)) }
    if (provider === 'lightyear') return { provider, lightyear: parseLightyearPdf(lines) }
    throw new Error('Ezt a PDF-et nem ismerem fel. PDF-ből OTP, Revolut és Lightyear kivonatot tudok beolvasni; más banknál tölts fel CSV vagy Excel exportot.')
  }
  const table = await readTable(file)
  const provider = detectTable(table)
  if (provider === 'revolut') return { provider, result: parseRevolut(table) }
  if (provider === 'lightyear') return { provider, lightyear: parseLightyear(await readText(file)) }
  return { provider, table }
}

export default function Import() {
  const [file, setFile] = useState<File | null>(null)
  const [detected, setDetected] = useState<Detected | null>(null)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function choose(f: File | null) {
    setFile(f); setDetected(null); setResult(null); setError(null)
    if (!f) return
    setBusy(true)
    try {
      const d = await analyse(f)
      setDetected(d); setResult(d.result ?? null)
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }

  const reset = () => { setFile(null); setDetected(null); setResult(null) }

  return (
    <>
      <h1>Import</h1>
      <div className="card">
        <label>Kivonat (OTP PDF, Revolut Excel, Lightyear CSV vagy bármilyen CSV / Excel)
          <input key={file ? 'f' : 'empty'} type="file" onChange={e => choose(e.target.files?.[0] ?? null)} />
        </label>
        {busy && <p className="muted">Feldolgozás…</p>}
        {detected && <p>Felismerve: <b>{PROVIDER_LABEL[detected.provider]}</b></p>}
        {error && <p className="error">{error}</p>}
      </div>
      {detected?.lightyear && <LightyearImport key={file?.name} data={detected.lightyear} done={reset} />}
      {detected?.provider === 'generic' && detected.table && <GenericMapping table={detected.table} onParsed={setResult} />}
      {file && result && <BankImport key={file.name + result.sections.length} result={result} fileName={file.name} done={reset} />}
      <TransferSuggestions />
      <RecentBatches />
    </>
  )
}

function BankImport({ result, fileName, done }: { result: ParseResult; fileName: string; done: () => void }) {
  const { accounts, txs, categories, reload } = useData()
  const [targets, setTargets] = useState<string[]>(() => result.sections.map(s =>
    accounts.find(a => a.name === s.key)?.id ?? 'new'))
  const [report, setReport] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    const lines: string[] = []
    try {
      const batch = must(await supabase.from('import_batches').insert({ source: result.source, file_name: fileName }).select().single()) as { id: string }
      const learned = learnedCategories(txs)
      const investCat = categories.find(c => c.kind === 'investment')?.id ?? null
      const checks: { accountId: string; s: ParsedSection }[] = []
      for (const [i, s] of result.sections.entries()) {
        let accountId = targets[i]
        if (accountId === 'skip') continue
        const empty = accountId === 'new' || !txs.some(t => t.account_id === accountId)
        if (accountId === 'new') {
          const acc = must(await supabase.from('accounts').insert({
            name: s.key, kind: /Megtakarítás/.test(s.key) ? 'savings' : 'checking', opening_balance: s.openingBalance ?? 0,
          }).select().single()) as { id: string }
          accountId = acc.id
        } else if (empty && s.openingBalance !== undefined) {
          must(await supabase.from('accounts').update({ opening_balance: s.openingBalance }).eq('id', accountId))
        }
        const rows = withHashes(accountId, s.rows).map(r => ({
          account_id: accountId, date: r.date, amount: r.amount, description: r.description, counterparty: r.counterparty,
          orig_amount: r.origAmount ?? null, orig_currency: r.origCurrency ?? null, import_hash: r.import_hash,
          import_batch_id: batch.id,
          category_id: learned.get(r.counterparty) ?? (r.counterparty === 'lightyear' ? investCat : null),
        }))
        let inserted = 0
        for (let k = 0; k < rows.length; k += 500) {
          const res = must(await supabase.from('transactions')
            .upsert(rows.slice(k, k + 500), { onConflict: 'user_id,import_hash', ignoreDuplicates: true }).select('id')) as unknown[]
          inserted += res.length
        }
        const categorized = rows.filter(r => r.category_id).length
        lines.push(`${s.key}: ${inserted} új tétel, ${rows.length - inserted} duplikátum kihagyva, ${categorized} automatikusan kategorizálva.`)
        checks.push({ accountId, s })
      }
      await reload()
      // Balance check against the statement (HUF accounts only – foreign pockets move with FX).
      const [accs, all] = await Promise.all([fetchAll<{ id: string; opening_balance: number; name: string; kind: string; archived: boolean }>('accounts'),
        fetchAll<{ account_id: string; date: string; amount: number }>('transactions', 'date')])
      for (const { accountId, s } of checks) {
        if (s.closingBalance === undefined || s.currency !== 'HUF' || !s.rows.length) continue
        const last = s.rows.reduce((m, r) => (r.date > m ? r.date : m), s.rows[0].date)
        const bal = accountBalances(accs as never, all as never, last).get(accountId) ?? 0
        lines.push(Math.abs(bal - s.closingBalance) < 0.01
          ? `✓ ${s.key}: egyenleg egyezik a kivonattal (${huf(s.closingBalance)}).`
          : `⚠ ${s.key}: számolt egyenleg ${huf(bal)}, kivonat szerint ${huf(s.closingBalance)}. Ellenőrizd a nyitóegyenleget vagy a hiányzó időszakot.`)
      }
      setReport(lines)
    } catch (e) { setReport([...lines, `Hiba: ${(e as Error).message}`]) }
    setBusy(false)
  }

  if (report) return (
    <div className="card">
      <h2>Import kész</h2>
      {report.map((l, i) => <p key={i} className={l.startsWith('⚠') || l.startsWith('Hiba') ? 'warn' : ''}>{l}</p>)}
      <button onClick={done}>Rendben</button>
    </div>
  )

  return (
    <div className="card">
      <h2>Előnézet</h2>
      {result.warnings.map((w, i) => <p key={i} className="warn small">⚠ {w}</p>)}
      {result.sections.map((s, i) => (
        <div key={s.key} style={{ marginBottom: 16 }}>
          <div className="row">
            <b>{s.key}</b>
            <span className="muted small">{s.rows.length} tétel{s.rows.length ? `, ${s.rows[0].date} – ${s.rows[s.rows.length - 1].date}` : ''}
              {s.closingBalance !== undefined && `, záró: ${huf(s.closingBalance)}`}{s.currency !== 'HUF' && ` (${s.currency} → HUF)`}</span>
            <label>Cél számla<select value={targets[i]} onChange={e => setTargets(targets.map((t, j) => (j === i ? e.target.value : t)))}>
              <option value="new">Új számla: {s.key}</option>
              <option value="skip">Kihagyás</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></label>
          </div>
          <div className="table-wrap"><table><tbody>
            {s.rows.slice(0, 5).map((r, k) => (
              <tr key={k}><td>{r.date}</td><td>{r.counterparty}</td>
                <td className="num">{huf(r.amount)}{r.origCurrency && <span className="muted small"> ({r.origAmount} {r.origCurrency})</span>}</td></tr>
            ))}
            {s.rows.length > 5 && <tr><td colSpan={3} className="muted small">… és még {s.rows.length - 5}</td></tr>}
          </tbody></table></div>
        </div>
      ))}
      <button className="primary" disabled={busy || !result.sections.length} onClick={run}>{busy ? 'Importálás…' : 'Importálás'}</button>
    </div>
  )
}

const DATE_FORMATS: DateFormat[] = ['YYYY-MM-DD', 'YYYY.MM.DD', 'DD/MM/YYYY', 'MM/DD/YYYY']

type SavedConfig = MappingConfig & { key: string; signature?: string }

function GenericMapping({ table, onParsed }: { table: unknown[][]; onParsed: (r: ParseResult) => void }) {
  const [saved, setSaved] = useState<{ id: string; name: string; config: SavedConfig }[]>([])
  const [cfg, setCfg] = useState<SavedConfig>(() => ({ ...guessMapping(table), key: 'Saját bank' }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(true)

  async function apply(c: SavedConfig = cfg) {
    setBusy(true); setError(null)
    try {
      const needed: { c: string; d: string }[] = []
      parseGeneric(table, c, c.key, (_a, cur, d) => { needed.push({ c: cur, d }); return 0 })
      const dates = needed.map(n => n.d).sort()
      const toHuf = needed.length ? await loadHufRates(needed.map(n => n.c), dates[0], dates[dates.length - 1]) : () => null
      onParsed(parseGeneric(table, c, c.key, toHuf))
      if (c.key) must(await supabase.from('import_mappings').upsert(
        { name: c.key, config: { ...c, signature: headerSignature(table, c.headerRow) } }, { onConflict: 'user_id,name' }))
      setOpen(false)
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }

  // A file from a bank imported before (same header) is processed with its saved settings right away.
  useEffect(() => {
    supabase.from('import_mappings').select('*').order('name').then(r => {
      const list = (r.data ?? []) as typeof saved
      setSaved(list)
      const match = list.find(m => m.config.signature && m.config.signature === headerSignature(table, m.config.headerRow))
      if (match) { setCfg(match.config); apply(match.config) }
    })
  }, [table])

  if (!open) return (
    <div className="card row">
      <span>Beállítás: <b>{cfg.key}</b></span>
      <button className="link" onClick={() => setOpen(true)}>Oszlopok módosítása</button>
    </div>
  )

  const header = (table[cfg.headerRow] ?? []).map((h, i) => `${i + 1}. ${String(h ?? '')}`)
  const col = (k: 'date' | 'amount' | 'description' | 'currency', optional = false) => (
    <select value={cfg[k] ?? ''} onChange={e => setCfg({ ...cfg, [k]: e.target.value === '' ? undefined : Number(e.target.value) })}>
      {optional && <option value="">— nincs (HUF) —</option>}
      {header.map((h, i) => <option key={i} value={i}>{h}</option>)}
    </select>
  )

  return (
    <div className="card">
      <h2>Oszlopok hozzárendelése</h2>
      <p className="muted small">Ezt a formátumot még nem ismerem. Kitöltöttem a legvalószínűbb beállítást – ellenőrizd az előnézettel. A következő ilyen fájlnál már magától megy.</p>
      {saved.length > 0 && (
        <label>Mentett beállítás<select defaultValue="" onChange={e => { const m = saved.find(s => s.id === e.target.value); if (m) setCfg(m.config) }}>
          <option value="">Válassz…</option>{saved.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
      )}
      <div className="row">
        <label>Fejléc sora<input type="number" min={1} value={cfg.headerRow + 1} onChange={e => setCfg({ ...cfg, headerRow: Math.max(0, Number(e.target.value) - 1) })} style={{ width: 80 }} /></label>
        <label>Dátum{col('date')}</label>
        <label>Dátumformátum<select value={cfg.dateFormat} onChange={e => setCfg({ ...cfg, dateFormat: e.target.value as DateFormat })}>
          {DATE_FORMATS.map(d => <option key={d}>{d}</option>)}</select></label>
        <label>Összeg{col('amount')}</label>
        <label>Tizedesjel<select value={cfg.decimal} onChange={e => setCfg({ ...cfg, decimal: e.target.value as ',' | '.' })}>
          <option value=",">vessző (1 234,56)</option><option value=".">pont (1,234.56)</option></select></label>
        <label>Leírás{col('description')}</label>
        <label>Deviza{col('currency', true)}</label>
        <label>Számla / beállítás neve<input value={cfg.key} onChange={e => setCfg({ ...cfg, key: e.target.value })} /></label>
        <button className="primary" disabled={busy} onClick={() => apply()}>Előnézet</button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap"><table><tbody>
        {table.slice(cfg.headerRow, cfg.headerRow + 4).map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j} className="small">{c instanceof Date ? c.toLocaleDateString('hu-HU') : String(c ?? '')}</td>)}</tr>
        ))}
      </tbody></table></div>
    </div>
  )
}

function LightyearImport({ data, done }: { data: LightyearData; done: () => void }) {
  const { assets, reload } = useData()
  const ly = assets.filter(a => a.source === 'lightyear')
  const [target, setTarget] = useState(ly[0]?.id ?? 'new')
  const [msg, setMsg] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      let assetId = target
      if (assetId === 'new')
        assetId = (must(await supabase.from('assets').insert({ name: 'Lightyear', type: 'stock_etf', source: 'lightyear' }).select().single()) as { id: string }).id
      const res = data.rows.length ? must(await supabase.from('investment_transactions')
        .upsert(data.rows.map(r => ({ ...r, asset_id: assetId })), { onConflict: 'asset_id,reference,currency', ignoreDuplicates: true }).select('id')) as unknown[] : []
      const lines = [...data.warnings, `${res.length} új tétel, ${data.rows.length - res.length} duplikátum kihagyva.`]
      if (data.valuation) {
        const all = must(await supabase.from('investment_transactions').select('*').eq('asset_id', assetId)) as LightyearRow[]
        must(await supabase.from('asset_valuations').upsert({ asset_id: assetId, date: data.valuation.date, value: data.valuation.value,
          invested: netDeposits(all).huf }, { onConflict: 'asset_id,date' }))
        lines.push(`Portfólió értéke ${data.valuation.date}-n: ${huf(data.valuation.value)} – rögzítve.`)
      }
      setMsg(lines)
      await reload()
    } catch (e) { setMsg([`Hiba: ${(e as Error).message}`]) }
    setBusy(false)
  }

  if (msg) return (
    <div className="card">
      <h2>Import kész</h2>
      {msg.map((m, i) => <p key={i} className={m.startsWith('Hiba') ? 'error' : ''}>{m}</p>)}
      <button onClick={done}>Rendben</button>
    </div>
  )
  return (
    <div className="card">
      <h2>Előnézet</h2>
      {data.warnings.map((w, i) => <p key={i} className="warn small">⚠ {w}</p>)}
      <p>{data.rows.length} befektetési tétel{data.valuation && <>, portfólió értéke: <b>{huf(data.valuation.value)}</b> ({data.valuation.date})</>}</p>
      <div className="row">
        {ly.length > 0 && <label>Portfólió<select value={target} onChange={e => setTarget(e.target.value)}>
          <option value="new">Új: Lightyear</option>{ly.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select></label>}
        <button className="primary" disabled={busy || (!data.rows.length && !data.valuation)} onClick={run}>{busy ? 'Importálás…' : 'Importálás'}</button>
      </div>
    </div>
  )
}

const DISMISSED_KEY = 'dismissedTransferPairs'
const readDismissed = (): string[] => { try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') } catch { return [] } }

function TransferSuggestions() {
  const { txs, accMap, reload } = useData()
  const [dismissed, setDismissed] = useState(readDismissed)
  const pairs = suggestTransferPairs(txs.filter(t => !t.is_transfer).map(t => ({ ...t, amount: Number(t.amount) })))
    .filter(([a, b]) => !dismissed.includes(`${a.id}|${b.id}`))
  if (!pairs.length) return null
  const byId = new Map(txs.map(t => [t.id, t]))

  async function approve(ids: [string, string][]) {
    for (const [a, b] of ids) {
      must(await supabase.from('transactions').update({ is_transfer: true, transfer_peer_id: b, category_id: null }).eq('id', a))
      must(await supabase.from('transactions').update({ is_transfer: true, transfer_peer_id: a, category_id: null }).eq('id', b))
    }
    await reload()
  }
  function dismiss(a: string, b: string) {
    const next = [...dismissed, `${a}|${b}`]
    setDismissed(next)
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
  }

  return (
    <div className="card">
      <h2>Átvezetés-javaslatok ({pairs.length})</h2>
      <p className="muted small">Azonos összeg két saját számla között, ±2 napon belül. Jóváhagyás után nem számít bevételnek/kiadásnak.</p>
      <div className="list">
        {pairs.map(([a, b]) => {
          const ta = byId.get(a.id)!, tb = byId.get(b.id)!
          return (
            <div key={a.id + b.id} className="list-item">
              <div className="line">
                <span className="title">{accMap.get(ta.account_id)?.name} → {accMap.get(tb.account_id)?.name}</span>
                <span className="amount">{huf(tb.amount)}</span>
              </div>
              <div className="small muted">{ta.date}: {ta.description}<br />{tb.date}: {tb.description}</div>
              <div className="row">
                <button onClick={() => approve([[a.id, b.id]])}>Jóváhagy</button>
                <button className="link" onClick={() => dismiss(a.id, b.id)}>Nem az</button>
              </div>
            </div>
          )
        })}
      </div>
      {pairs.length > 1 && <button className="primary" onClick={() => approve(pairs.map(([a, b]) => [a.id, b.id]))}>Mind jóváhagy</button>}
    </div>
  )
}

function RecentBatches() {
  const { txs, reload } = useData()
  const [batches, setBatches] = useState<{ id: string; source: string; file_name: string; created_at: string }[]>([])
  useEffect(() => {
    supabase.from('import_batches').select('*').order('created_at', { ascending: false }).limit(10).then(r => setBatches((r.data ?? []) as typeof batches))
  }, [txs])

  async function undo(id: string) {
    if (!confirm('Törlöd az ebből az importból származó összes tranzakciót?')) return
    must(await supabase.from('transactions').delete().eq('import_batch_id', id))
    must(await supabase.from('import_batches').delete().eq('id', id))
    await reload()
  }

  const counts = new Map<string, number>()
  for (const t of txs) if (t.import_batch_id) counts.set(t.import_batch_id, (counts.get(t.import_batch_id) ?? 0) + 1)
  const visible = batches.filter(b => counts.get(b.id))
  if (!visible.length) return null
  return (
    <div className="card">
      <h2>Legutóbbi importok</h2>
      <table><tbody>
        {visible.map(b => (
          <tr key={b.id}><td>{new Date(b.created_at).toLocaleString('hu-HU')}</td><td>{b.file_name}</td>
            <td className="num">{counts.get(b.id)} tétel</td><td><button className="link danger" onClick={() => undo(b.id)}>Visszavonás</button></td></tr>
        ))}
      </tbody></table>
    </div>
  )
}
