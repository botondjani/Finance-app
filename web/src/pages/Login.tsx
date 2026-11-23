import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signup, setSignup] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const { error } = signup
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(signup && /Database error/i.test(error.message) ? 'A regisztráció le van zárva.' : error.message)
  }

  return (
    <div className="login card">
      <h1>Pénzügyek</h1>
      <form onSubmit={submit}>
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
        <label>Jelszó<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
          autoComplete={signup ? 'new-password' : 'current-password'} /></label>
        {error && <p className="error">{error}</p>}
        <button className="primary">{signup ? 'Regisztráció' : 'Belépés'}</button>
        <button type="button" className="link" onClick={() => setSignup(!signup)}>
          {signup ? 'Van már fiókom' : 'Első indítás: fiók létrehozása'}
        </button>
      </form>
    </div>
  )
}
