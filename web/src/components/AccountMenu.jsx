// The account home, shared by the website (/account) and the Telegram Mini App (/tg/profile):
// profile card, language, then grouped menus (Activity · Account · Help) like a native app's settings.
import { ChevronRight, FileText, LifeBuoy, LogOut, MessageCircle, RotateCcw, Shield, ShieldCheck, Sparkles, Tag, Ticket, UserCog, Wallet } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp, useLink } from '../context/App'
import { LANGS, useT } from '../i18n'
import { cls } from '../lib/format'
import { haptic, inTelegram, openExternal } from '../lib/telegram'
import ProfileCard, { money, useProfileStats } from './ProfileCard'

function Row({ to, icon: Icon, label, tone, value, onClick, danger, first }) {
  const inner = (
    <>
      <span className={cls('grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-white', tone)}><Icon className="h-[17px] w-[17px]" strokeWidth={2.2} /></span>
      <span className={cls('flex min-w-0 flex-1 items-center gap-2 self-stretch py-0.5', !first && '-mt-3 border-t border-line pt-3')}>
        <span className={cls('flex-1 truncate text-left text-[15px] font-medium', danger && 'text-bad')}>{label}</span>
        {value && <span className="text-[14px] tabular-nums text-muted">{value}</span>}
        {!danger && <ChevronRight className="h-4 w-4 shrink-0 text-muted/70" />}
      </span>
    </>
  )
  const cl = 'flex w-full items-center gap-3.5 px-4 py-3 transition hover:bg-raised/60 active:bg-raised'
  return to
    ? <Link to={to} onClick={() => haptic('light')} className={cl}>{inner}</Link>
    : <button type="button" onClick={onClick} className={cl}>{inner}</button>
}

function Group({ title, children }) {
  return (
    <div>
      <p className="mb-2 ml-4 mt-6 text-[12px] font-semibold uppercase tracking-[.12em] text-muted">{title}</p>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">{children}</div>
    </div>
  )
}

export default function AccountMenu() {
  const { user, settings, logout } = useApp()
  const { t, lang, setLang } = useT()
  const link = useLink()
  const nav = useNavigate()
  const stats = useProfileStats()
  const support = settings?.telegram?.support_username
  const staff = user.role !== 'customer'
  const tg = inTelegram()

  const activity = [
    [link('/tickets'), Ticket, t('My tickets'), 'bg-[#8B5CF6]', stats?.tickets ? String(stats.tickets) : ''],
    [link('/account/listings'), Tag, t('My listings'), 'bg-[#EC4899]', stats?.listings ? String(stats.listings) : ''],
    [link('/account/wallet'), Wallet, t('Wallet & withdrawals'), 'bg-[#10B981]', stats ? money(stats.wallet) : ''],
    [link('/account/invoices'), FileText, t('Invoices'), 'bg-[#3B82F6]', ''],
  ]
  const account = [
    [link('/account/settings'), UserCog, t('Profile & settings'), 'bg-[#64748B]', ''],
    ...(staff ? [['/admin', Shield, t('Admin dashboard'), 'bg-[#F59E0B]', '']] : []),
  ]
  const help = [
    [link('/how-it-works'), Sparkles, t('How it works'), 'bg-[#06B6D4]', ''],
    [link('/policies/refunds'), RotateCcw, t('Refund policy'), 'bg-[#F43F5E]', ''],
    [link('/policies/authenticity'), ShieldCheck, t('Ticket authenticity'), 'bg-[#22C55E]', ''],
    [link('/support'), LifeBuoy, t('Support'), 'bg-[#A855F7]', ''],
  ]
  const rows = (list) => list.map(([to, icon, label, tone, value], i) => <Row key={label} to={to} icon={icon} label={label} tone={tone} value={value} first={i === 0} />)

  return (
    <>
      <ProfileCard stats={stats} editTo="/account/settings" />

      <p className="mb-2 ml-4 mt-6 text-[12px] font-semibold uppercase tracking-[.12em] text-muted">{t('Language')}</p>
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-surface p-1">
        {LANGS.map((l) => (
          <button key={l.code} onClick={() => { haptic('light'); setLang(l.code) }} aria-pressed={lang === l.code}
            className={cls('rounded-xl py-2.5 text-[14px] font-semibold transition', lang === l.code ? 'bg-ink text-bg shadow-card' : 'text-muted hover:text-ink active:bg-raised')}>
            {l.label}
          </button>
        ))}
      </div>

      <Group title={t('Activity')}>{rows(activity)}</Group>
      <Group title={t('Account')}>
        {rows(account)}
        {!tg && <Row icon={LogOut} label={t('Sign out')} tone="bg-bad" danger onClick={() => { logout(); nav('/') }} />}
      </Group>
      <Group title={t('Help')}>{rows(help)}</Group>

      {support && (
        <button onClick={() => { haptic('light'); openExternal(`https://t.me/${support}`) }}
          className="btn-holo mt-6 w-full py-3.5 text-[15px]"><MessageCircle className="h-[18px] w-[18px]" />{t('Message support')}</button>
      )}
      <p className="mt-6 text-center text-[11.5px] text-muted">TicketNest · {t('Independent resale marketplace, not affiliated with any artist or official seller.')}</p>
    </>
  )
}
