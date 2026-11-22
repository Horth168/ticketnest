import { ShieldCheck, Ticket, Zap } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import LiveStage from '../components/LiveStage'
import { GoogleButton, TelegramButton } from '../components/SocialSignIn'
import { ErrorNote, Field, Logo, PasswordInput, Spinner } from '../components/ui'
import { useApp, useLink } from '../context/App'
import { useT } from '../i18n'
import { api } from '../lib/api'

function Shell({ title, sub, children }) {
  const { t } = useT()
  return (
    <div className="page grid min-h-[calc(100vh-4rem)] items-center gap-10 py-10 lg:grid-cols-[1fr_440px]">
      <div className="relative hidden h-[620px] overflow-hidden rounded-[32px] text-white lg:block">
        <LiveStage />
        <div className="relative flex h-full flex-col justify-end p-10">
          <h2 className="max-w-md text-4xl font-bold leading-tight">{t('Your next concert starts here.')}</h2>
          <ul className="mt-6 space-y-3 text-white/80">
            {[[ShieldCheck, t('Every listing reviewed by our team')], [Zap, t('Pay in seconds with KHQR')], [Ticket, t('Tickets delivered on Telegram')]].map(([Icon, l]) => (
              <li key={l} className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 backdrop-blur"><Icon className="h-4 w-4" /></span>{l}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="rise mx-auto w-full max-w-[440px]">
        <div className="mb-7 text-center lg:text-left"><Logo className="justify-center lg:justify-start" /><h1 className="mt-6 text-3xl font-bold">{title}</h1>{sub && <p className="mt-2 text-muted">{sub}</p>}</div>
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
  const { t } = useT()
  return (data) => {
    signedIn(data)
    toast(t('Welcome, {name}', { name: data.user.full_name.split(' ')[0] }))
    const next = sp.get('next')
    // go back to what they were doing, otherwise the homepage
    nav(next && next.startsWith('/') && !next.startsWith('//') ? next : link('/'), { replace: true })
  }
}

function Divider() {
  const { t } = useT()
  return <div className="my-5 flex items-center gap-3 text-[12px] text-muted"><span className="h-px flex-1 bg-line" />{t('or')}<span className="h-px flex-1 bg-line" /></div>
}

export function Login() {
  const done = useAfterLogin()
  const { t } = useT()
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
    <Shell title={t('Welcome back')} sub={t('Sign in to buy, sell and track your tickets.')}>
      <div className="space-y-3"><GoogleButton onDone={done} label={t('Continue with Google')} /><TelegramButton onDone={done} /></div>
      <Divider />
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('Email')}><input className="input" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
        <Field label={t('Password')}><PasswordInput value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-muted"><input type="checkbox" className="accent-[rgb(var(--accent))]" checked={f.remember} onChange={(e) => setF({ ...f, remember: e.target.checked })} />{t('Keep me signed in')}</label>
          <Link to="/forgot-password" className="font-medium text-accent hover:underline">{t('Forgot password?')}</Link>
        </div>
        <ErrorNote error={error} />
        <button className="btn-primary w-full py-3" disabled={busy}>{busy && <Spinner className="h-4 w-4" />}{t('Sign in')}</button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">{t('New to TicketNest?')} <Link to={`/register${next}`} className="font-semibold text-accent hover:underline">{t('Create an account')}</Link></p>
    </Shell>
  )
}

export function Register() {
  const done = useAfterLogin()
  const { t } = useT()
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
    <Shell title={t('Create your account')} sub={t('Buy and sell K-pop tickets in minutes.')}>
      <div className="space-y-3"><GoogleButton onDone={done} label={t('Sign up with Google')} /><TelegramButton onDone={done} /></div>
      <Divider />
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('Full name')} error={errFor('full_name')}><input className="input" autoComplete="name" value={f.full_name} onChange={set('full_name')} required minLength={2} /></Field>
        <Field label={t('Email')} error={errFor('email')}><input className="input" type="email" autoComplete="email" value={f.email} onChange={set('email')} required /></Field>
        <Field label={t('Phone (optional)')} error={errFor('phone')}><input className="input" inputMode="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} /></Field>
        <Field label={t('Password')} hint={t('At least 8 characters, with letters and numbers')} error={errFor('password')}>
          <PasswordInput autoComplete="new-password" value={f.password} onChange={set('password')} required minLength={8} />
        </Field>
        {error && !error.errors && <ErrorNote error={error} />}
        <button className="btn-primary w-full py-3" disabled={busy}>{busy && <Spinner className="h-4 w-4" />}{t('Create account')}</button>
        <p className="text-center text-[12px] text-muted">{t('By creating an account you agree to our terms and privacy policy.')} <Link to="/policies/terms" className="underline">{t('Terms')}</Link> · <Link to="/policies/privacy" className="underline">{t('Privacy')}</Link></p>
      </form>
      <p className="mt-5 text-center text-sm text-muted">{t('Already have an account?')} <Link to={`/login${next}`} className="font-semibold text-accent hover:underline">{t('Sign in')}</Link></p>
    </Shell>
  )
}

export function Forgot() {
  const { t } = useT()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null)
    try { await api('/api/auth/forgot-password', { method: 'POST', body: { email } }); setSent(true) } catch (err) { setError(err) } finally { setBusy(false) }
  }
  return (
    <Shell title={t('Reset your password')} sub={t("We'll email you a link that works once and expires in an hour.")}>
      {sent ? <p className="pop rounded-xl bg-good/10 p-4 text-sm text-good">{t("If an account exists for that email, we've sent a link to reset your password.")}</p> : (
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('Email')}><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></Field>
          <ErrorNote error={error} />
          <button className="btn-primary w-full py-3" disabled={busy}>{busy && <Spinner className="h-4 w-4" />}{t('Send reset link')}</button>
        </form>
      )}
      <p className="mt-5 text-center text-sm"><Link to="/login" className="font-semibold text-accent hover:underline">{t('Back to sign in')}</Link></p>
    </Shell>
  )
}

export function Reset() {
  const { t } = useT()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const { toast } = useApp()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (pw !== pw2) { setError(new Error(t('The passwords do not match'))); return }
    setBusy(true); setError(null)
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: { token: sp.get('token') || '', password: pw } })
      toast(t('Password changed. Sign in with your new password.'))
      nav('/login', { replace: true })
    } catch (err) { setError(err) } finally { setBusy(false) }
  }
  return (
    <Shell title={t('Choose a new password')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('New password')} hint={t('At least 8 characters, with letters and numbers')}><PasswordInput autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} /></Field>
        <Field label={t('Repeat new password')}><PasswordInput autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required /></Field>
        <ErrorNote error={error} />
        <button className="btn-primary w-full py-3" disabled={busy || !sp.get('token')}>{busy && <Spinner className="h-4 w-4" />}{t('Save new password')}</button>
      </form>
    </Shell>
  )
}
