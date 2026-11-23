import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

const ERRORS: [RegExp, string][] = [
  [/Invalid login credentials/i, 'Hibás email vagy jelszó.'],
  [/Email not confirmed/i, 'Előbb erősítsd meg az email címed (nézd meg a postafiókod).'],
  [/Database error|Registration is closed/i, 'A regisztráció le van zárva.'],
  [/User already registered/i, 'Ezzel az email címmel már van fiók – lépj be.'],
  [/Password should be/i, 'A jelszó túl gyenge (legalább 8 karakter).'],
]
const translate = (msg: string) => ERRORS.find(([re]) => re.test(msg))?.[1] ?? msg

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signup, setSignup] = useState<boolean | null>(null)  // null = still checking
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // Until the single account exists, show the registration form by default.
  useEffect(() => {
    supabase.rpc('registration_open').then(({ data }) => setSignup(data === true))
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null); setInfo(null)
    const { data, error } = signup
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } })
      : await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(translate(error.message))
    else if (signup && !data.session) { setInfo('Elküldtük a megerősítő emailt. Kattints a benne lévő linkre, utána itt lépj be.'); setSignup(false) }
  }

  if (signup === null) return null
  return (
    <div className="login card">
      <h1>Pénzügyek</h1>
      <p className="muted">{signup ? 'Első indítás: hozd létre a fiókod.' : 'Lépj be a fiókodba.'}</p>
      <form onSubmit={submit}>
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
        <label>Jelszó{signup && ' (min. 8 karakter)'}<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
          autoComplete={signup ? 'new-password' : 'current-password'} /></label>
        {error && <p className="error">{error}</p>}
        {info && <p>{info}</p>}
        <button className="primary">{signup ? 'Fiók létrehozása' : 'Belépés'}</button>
        <button type="button" className="link" onClick={() => { setSignup(!signup); setError(null) }}>
          {signup ? 'Van már fiókom, belépek' : 'Fiók létrehozása'}
        </button>
      </form>
    </div>
  )
}
