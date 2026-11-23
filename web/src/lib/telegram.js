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

export const isPhone = () => window.matchMedia?.('(pointer: coarse)').matches

/**
 * Save an image to the phone's Photos (or download it on a computer).
 * Pass the already-fetched Blob when you have it: iPhone only opens the share sheet straight after a tap.
 *  - phones with the share sheet (iPhone Safari / home-screen app, Android Chrome): "Save Image" -> Photos
 *  - Telegram Mini App: Telegram's own download (Bot API 8.0)
 *  - computers: a normal file download
 * Returns 'shared' | 'telegram' | 'downloaded' | 'cancelled' | 'opened'.
 */
export async function saveImage(url, fileName, blob = null) {
  url = new URL(url, window.location.href).href
  const w = tg()
  try {
    const file = blob ? new File([blob], fileName, { type: blob.type || 'image/png' }) : null
    if (file && isPhone() && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: fileName })
      return 'shared'
    }
    if (w?.initData && w.isVersionAtLeast?.('8.0') && w.downloadFile) {
      w.downloadFile({ url: url + (url.includes('?') ? '&' : '?') + 'download=1', file_name: fileName })
      return 'telegram'
    }
    if (blob) {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 10000)
      return 'downloaded'
    }
  } catch (e) {
    if (e?.name === 'AbortError') return 'cancelled'   // closed the share sheet
  }
  openExternal(url)   // last resort: open the image (long-press -> Save to Photos)
  return 'opened'
}
