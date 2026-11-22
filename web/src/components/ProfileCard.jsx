// The profile header shared by the website account page and the Telegram Mini App profile:
// gradient banner, avatar, name + role badge, handle, Edit button and quick stats.
import { Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp, useLink } from '../context/App'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { haptic } from '../lib/telegram'
import { Avatar } from './ui'

export const money = (c) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function useProfileStats() {
  const [stats, setStats] = useState(null)
  useEffect(() => {
    Promise.all([api('/api/orders').catch(() => []), api('/api/sell/dashboard').catch(() => null)])
      .then(([orders, dash]) => setStats({
        tickets: orders.filter((o) => !['cancelled', 'refunded'].includes(o.status)).reduce((n, o) => n + (o.item?.quantity || 0), 0),
        listings: dash?.total_listings ?? 0,
        wallet: dash?.wallet?.available_cents ?? 0,
        pending: dash?.wallet?.pending_cents ?? 0,
      }))
  }, [])
  return stats
}

export default function ProfileCard({ stats, editTo = '/account/settings', actions = null, className = '' }) {
  const { user } = useApp()
  const { t } = useT()
  const link = useLink()
  const staff = user.role !== 'customer'
  const handle = [user.telegram_username && `@${user.telegram_username}`, user.email].filter(Boolean).join(' · ') || t('Telegram account')
  return (
    <section className={`relative overflow-hidden rounded-[28px] border border-line bg-surface shadow-card ${className}`}>
      <div className="holo-bg absolute inset-x-0 top-0 h-24 opacity-90 sm:h-28" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-transparent to-black/10 sm:h-28" />
      <div className="relative px-5 pb-5 pt-12 sm:px-7 sm:pt-16">
        <div className="flex items-end justify-between gap-3">
          <div className="rounded-full bg-surface p-1 shadow-card"><Avatar user={user} size={76} /></div>
          <div className="mb-1 flex flex-nowrap justify-end gap-1.5 sm:gap-2">
            {actions}
            <Link to={link(editTo)} onClick={() => haptic('light')} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] font-semibold transition hover:bg-raised active:scale-95">
              <Pencil className="h-3.5 w-3.5" />{t('Edit')}
            </Link>
          </div>
        </div>
        <div>
          <div className="min-w-0">
            <h1 className="mt-3 flex items-center gap-2 text-[22px] font-bold leading-tight sm:text-[26px]">
              <span className="truncate">{user.full_name}</span>
              {staff && <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-accent">{t(user.role === 'admin' ? 'Admin' : 'Staff')}</span>}
            </h1>
            <p className="mt-0.5 truncate text-[13.5px] text-muted">{handle}</p>
          </div>
          <div className="mt-4 grid grid-cols-3 divide-x divide-line rounded-2xl bg-raised py-3 text-center">
            {[[t('Tickets'), stats ? stats.tickets : '–', '/tickets'], [t('Listings'), stats ? stats.listings : '–', '/account/listings'], [t('Wallet'), stats ? money(stats.wallet) : '–', '/account/wallet']].map(([l, v, to]) => (
              <Link key={l} to={link(to)} onClick={() => haptic('light')} className="px-1 transition hover:opacity-80 active:opacity-60">
                <p className="truncate font-display text-[17px] font-bold tabular-nums">{v}</p>
                <p className="text-[11.5px] font-medium text-muted">{l}</p>
              </Link>
            ))}
          </div>
        </div>
        {stats?.pending > 0 && <p className="mt-2 text-center text-[12px] text-muted">{t('{amount} pending until buyers receive their tickets', { amount: money(stats.pending) })}</p>}
      </div>
    </section>
  )
}
