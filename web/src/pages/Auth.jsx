import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { GoogleButton, TelegramButton } from '../components/SocialSignIn'
import { ErrorNote, Field, Logo, PasswordInput, Spinner } from '../components/ui'
import { useApp, useLink } from '../context/App'
import { api } from '../lib/api'

function Shell({ title, sub, children }) {
  return (
    <div className="page flex min-h-[calc(100vh-4rem)] items-start justify-center py-12 sm:items-center">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 text-center"><Logo className="justify-center" /><h1 className="mt-6 text-3xl font-bold">{title}</h1>{sub && <p className="mt-2 text-muted">{sub}</p>}</div>
        <div className="card p-6 shadow-card">{children}</div>
      </div>
    </div>
  )
}

function useAfterLogin() {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const link = useLink()
  const { signedIn, toast } = useApp()
  return (data) => {
    signedIn(data)
    toast(`Welcome, ${data.user.full_name.split(' ')[0]}`)
    const next = sp.get('next')
    nav(next && next.startsWith('/') && !next.startsWith('//') ? next : link('/account'), { replace: true })
  }
}

function Divider() {
  return <div className="my-5 flex items-center gap-3 text-[12px] text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
}

export function Login() {
  const done = useAfterLogin()
  const [sp] = useSearchParams()
  const [f, setF] = useState({ email: '', password: '', remember: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null)
    try { done(await api('/api/auth/login', { method: 'POST', body: f })) } catch (err) { setError(err) } finally { setBusy(false) }
  }
  const next = sp.get('next') ? `?next=${encodeURIComponent(sp.get('next'))}` : ''
  return (
    <Shell title="Welcome back" sub="Sign in to buy, sell and track your tickets.">
      <div className="space-y-3"><GoogleButton onDone={done} /><TelegramButton onDone={done} /></div>
      <Divider />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email"><input className="input" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
        <Field label="Password"><PasswordInput value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-muted"><input type="checkbox" className="accent-[rgb(var(--accent))]" checked={f.remember} onChange={(e) => setF({ ...f, remember: e.target.checked })} />Keep me signed in</label>
          <Link to="/forgot-password" className="font-medium text-accent hover:underline">Forgot password?</Link>
        </div>
        <ErrorNote error={error} />
        <button className="btn-primary w-full py-3" disabled={busy}>{busy && <Spinner className="h-4 w-4" />}Sign in</button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">New to TicketNest? <Link to={`/register${next}`} className="font-semibold text-accent hover:underline">Create an account</Link></p>
    </Shell>
  )
}

export function Register() {
  const done = useAfterLogin()
  const [sp] = useSearchParams()
  const [f, setF] = useState({ full_name: '', email: '', phone: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const errFor = (k) => error?.errors?.find((x) => x.field === k)?.message
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null)
    try { done(await api('/api/auth/register', { method: 'POST', body: f })) } catch (err) { setError(err) } finally { setBusy(false) }
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const next = sp.get('next') ? `?next=${encodeURIComponent(sp.get('next'))}` : ''
  return (
    <Shell title="Create your account" sub="Buy and sell K-pop tickets in minutes.">
      <div className="space-y-3"><GoogleButton onDone={done} label="Sign up with Google" /><TelegramButton onDone={done} /></div>
      <Divider />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name" error={errFor('full_name')}><input className="input" autoComplete="name" value={f.full_name} onChange={set('full_name')} required minLength={2} /></Field>
        <Field label="Email" error={errFor('email')}><input className="input" type="email" autoComplete="email" value={f.email} onChange={set('email')} required /></Field>
        <Field label="Phone (optional)" error={errFor('phone')}><input className="input" inputMode="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Password" hint="At least 8 characters, with letters and numbers" error={errFor('password')}>
          <PasswordInput autoComplete="new-password" value={f.password} onChange={set('password')} required minLength={8} />
        </Field>
        {error && !error.errors && <ErrorNote error={error} />}
        <button className="btn-primary w-full py-3" disabled={busy}>{busy && <Spinner className="h-4 w-4" />}Create account</button>
        <p className="text-center text-[12px] text-muted">By creating an account you agree to our <Link to="/policies/terms" className="underline">terms</Link> and <Link to="/policies/privacy" className="underline">privacy policy</Link>.</p>
      </form>
      <p className="mt-5 text-center text-sm text-muted">Already have an account? <Link to={`/login${next}`} className="font-semibold text-accent hover:underline">Sign in</Link></p>
    </Shell>
  )
}

export function Forgot() {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null)
    try { setMsg((await api('/api/auth/forgot-password', { method: 'POST', body: { email } })).message) } catch (err) { setError(err) } finally { setBusy(false) }
  }
  return (
    <Shell title="Reset your password" sub="We'll email you a link that works once and expires in an hour.">
      {msg ? <p className="rounded-xl bg-good/10 p-4 text-sm text-good">{msg}</p> : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></Field>
          <ErrorNote error={error} />
          <button className="btn-primary w-full py-3" disabled={busy}>{busy && <Spinner className="h-4 w-4" />}Send reset link</button>
        </form>
      )}
      <p className="mt-5 text-center text-sm"><Link to="/login" className="font-semibold text-accent hover:underline">Back to sign in</Link></p>
    </Shell>
  )
}

export function Reset() {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const { toast } = useApp()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (pw !== pw2) { setError(new Error('The passwords do not match')); return }
    setBusy(true); setError(null)
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: { token: sp.get('token') || '', password: pw } })
      toast('Password changed. Sign in with your new password.')
      nav('/login', { replace: true })
    } catch (err) { setError(err) } finally { setBusy(false) }
  }
  return (
    <Shell title="Choose a new password">
      <form onSubmit={submit} className="space-y-4">
        <Field label="New password" hint="At least 8 characters, with letters and numbers"><PasswordInput autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} /></Field>
        <Field label="Repeat new password"><PasswordInput autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required /></Field>
        <ErrorNote error={error} />
        <button className="btn-primary w-full py-3" disabled={busy || !sp.get('token')}>{busy && <Spinner className="h-4 w-4" />}Save new password</button>
      </form>
    </Shell>
  )
}
