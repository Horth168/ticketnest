import { useEffect, useRef } from 'react'
import { haptic, tg } from '../lib/telegram'

// Telegram MainButton (the big native button at the bottom of the Mini App). No-op on the website.
export function useMainButton(text, onClick, { enabled = true, loading = false } = {}) {
  const cb = useRef(onClick)
  cb.current = onClick
  useEffect(() => {
    const w = tg()
    if (!w?.initData || !w.MainButton) return
    const mb = w.MainButton
    if (!text) { mb.hide(); return }
    const handler = () => { haptic('medium'); cb.current?.() }
    mb.setText(text)
    mb.onClick(handler)
    mb.show()
    return () => { mb.offClick(handler); mb.hide() }
  }, [text])
  useEffect(() => {
    const mb = tg()?.initData && tg()?.MainButton
    if (!mb) return
    enabled ? mb.enable() : mb.disable()
    loading ? mb.showProgress(false) : mb.hideProgress()
  }, [enabled, loading, text])
}
