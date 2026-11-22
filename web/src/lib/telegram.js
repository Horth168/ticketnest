// Telegram Mini App helpers. Everything is a no-op on the normal website.
export const tg = () => window.Telegram?.WebApp
export const inTelegram = () => !!tg()?.initData

export const haptic = (kind = 'light') => {
  try {
    const h = tg()?.HapticFeedback
    if (!h) return
    if (['success', 'error', 'warning'].includes(kind)) h.notificationOccurred(kind)
    else h.impactOccurred(kind)
  } catch { /* old clients */ }
}

export function openExternal(url) {
  const w = tg()
  if (w?.initData) {
    if (url.startsWith('https://t.me/')) w.openTelegramLink(url)
    else w.openLink(url)
  } else window.open(url, '_blank', 'noopener')
}

// Save an image: Bot API 8.0 downloadFile where available, otherwise open it (long-press to save).
export function saveImage(url, fileName) {
  url = new URL(url, window.location.href).href
  const w = tg()
  try {
    if (w?.initData && w.isVersionAtLeast?.('8.0') && w.downloadFile) {
      w.downloadFile({ url, file_name: fileName })
      return
    }
  } catch { /* fall through */ }
  openExternal(url)
}
