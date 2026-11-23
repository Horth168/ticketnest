// In-app confirm / prompt dialogs in TicketNest's own style, replacing the browser's grey
// window.confirm / window.prompt boxes. Bottom sheet on phones, centred card on larger screens.
//
//   if (!(await confirmDialog({ title: 'Cancel this order?', message: '…', confirmText: 'Cancel order', danger: true }))) return
//   const n = await promptDialog({ title: 'Mark tickets sold', label: 'How many?', type: 'number', min: 1, max: 4 })
import { AlertTriangle, HelpCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n'
import { cls } from '../lib/format'
import { haptic } from '../lib/telegram'

let push = null
const queue = []

function open(kind, opts) {
  return new Promise((resolve) => {
    const item = { kind, ...opts, resolve }
    if (push) push(item)
    else queue.push(item)
  })
}

export const confirmDialog = (opts) => open('confirm', opts)
export const promptDialog = (opts) => open('prompt', opts)

export function DialogHost() {
  const [item, setItem] = useState(null)
  useEffect(() => {
    push = (it) => setItem(it)
    if (queue.length) setItem(queue.shift())
    return () => { push = null }
  }, [])
  if (!item) return null
  return createPortal(<DialogView key={Math.random()} item={item} done={(v) => { item.resolve(v); setItem(queue.shift() || null) }} />, document.body)
}

function DialogView({ item, done }) {
  const { t } = useT()
  const [value, setValue] = useState(item.defaultValue ?? '')
  const input = useRef(null)
  const isPrompt = item.kind === 'prompt'
  const cancel = () => done(isPrompt ? null : false)
  const ok = () => {
    if (isPrompt) {
      if (item.type === 'number') {
        const n = Number(value)
        if (!Number.isFinite(n) || (item.min != null && n < item.min) || (item.max != null && n > item.max)) { input.current?.focus(); return }
        done(n)
      } else done(String(value).trim() || null)
    } else done(true)
  }
  useEffect(() => {
    haptic(item.danger ? 'warning' : 'light')
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const k = (e) => { if (e.key === 'Escape') cancel(); if (e.key === 'Enter' && !isPrompt) ok() }
    window.addEventListener('keydown', k)
    if (isPrompt) setTimeout(() => input.current?.focus(), 120)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', k) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const Icon = item.danger ? AlertTriangle : HelpCircle
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-6" role="alertdialog" aria-modal="true" aria-label={item.title}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" style={{ animation: 'fade-in .18s ease' }} onClick={cancel} />
      <div className="relative w-full max-w-[420px] rounded-t-[28px] border border-line bg-surface px-5 pb-[calc(18px+var(--safe-bottom))] pt-3 shadow-lift sm:rounded-[24px] sm:pb-5 sm:pt-5"
        style={{ animation: 'sheet-up .28s cubic-bezier(.2,.8,.2,1)' }}>
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line sm:hidden" />
        <div className="flex items-start gap-3.5">
          <span className={cls('grid h-11 w-11 shrink-0 place-items-center rounded-2xl', item.danger ? 'bg-bad/10 text-bad' : 'bg-accent/10 text-accent')}><Icon className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="font-display text-[17px] font-bold leading-snug">{item.title}</p>
            {item.message && <p className="mt-1 text-[14px] leading-relaxed text-muted">{item.message}</p>}
          </div>
        </div>
        {isPrompt && (
          <label className="mt-4 block">
            {item.label && <span className="label">{item.label}</span>}
            <input ref={input} className="input h-12" type={item.type || 'text'} inputMode={item.type === 'number' ? 'numeric' : undefined}
              min={item.min} max={item.max} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} placeholder={item.placeholder} />
            {item.hint && <span className="mt-1 block text-[12px] text-muted">{item.hint}</span>}
          </label>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button className="btn-ghost h-12 text-[15px]" onClick={cancel}>{item.cancelText || t('Cancel')}</button>
          <button className={cls('h-12 text-[15px]', item.danger ? 'btn bg-bad text-white hover:brightness-110' : 'btn-primary')} onClick={ok}>{item.confirmText || t('Confirm')}</button>
        </div>
      </div>
    </div>
  )
}
