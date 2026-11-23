// Full-screen in-app viewer for private files (ticket proofs, receipts, payout QRs, report photos,
// invoices, delivered tickets). Replaces opening a new tab, which iPhone blocks after a download,
// and adds a Save button: phones get the share sheet ("Save Image" -> Photos, "Save to Files" for PDFs),
// computers get a normal download.
//
//   viewFile({ path: '/api/admin/listings/3/files/7', name: 'receipt.jpg' })
import { Download, ExternalLink, FileText, Share, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { cls } from '../lib/format'
import { haptic, isPhone } from '../lib/telegram'
import { Spinner } from './ui'

let push = null
export function viewFile(file) { if (push) push(file) }

export function FileViewerHost() {
  const [file, setFile] = useState(null)
  useEffect(() => { push = setFile; return () => { push = null } }, [])
  if (!file) return null
  return createPortal(<Viewer key={file.path} file={file} onClose={() => setFile(null)} />, document.body)
}

export async function fetchBlob(path) {
  const res = await api(path, { raw: true })
  return res.blob()
}

/** Save a Blob: share sheet on phones (Photos / Files), download on computers. */
export async function saveBlob(blob, name) {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' })
  if (isPhone() && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared' } catch (e) { if (e?.name === 'AbortError') return 'cancelled' }
  }
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
  return 'downloaded'
}

function Viewer({ file, onClose }) {
  const { t } = useT()
  const [blob, setBlob] = useState(null)
  const [url, setUrl] = useState(null)
  const [error, setError] = useState(null)
  const [zoom, setZoom] = useState(false)
  const phone = isPhone()

  useEffect(() => {
    let u
    fetchBlob(file.path).then((b) => { setBlob(b); u = URL.createObjectURL(b); setUrl(u) }).catch((e) => setError(e.message || 'Could not open the file'))
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => { if (u) URL.revokeObjectURL(u); document.body.style.overflow = prev; window.removeEventListener('keydown', k) }
  }, [file.path]) // eslint-disable-line react-hooks/exhaustive-deps

  const type = blob?.type || ''
  const isImage = type.startsWith('image/')
  const isPdf = type === 'application/pdf'
  const name = file.name || 'file'
  const save = async () => { haptic('light'); if (blob) await saveBlob(blob, name) }

  return (
    <div className="fixed inset-0 z-[130] flex flex-col bg-black/95 text-white" role="dialog" aria-modal="true" aria-label={name} style={{ animation: 'fade-in .18s ease' }}>
      <div className="flex shrink-0 items-center gap-3 px-4 pb-3 pt-[calc(var(--safe-top)+12px)]">
        <p className="min-w-0 flex-1 truncate text-[14px] font-semibold">{name}</p>
        {isImage && <button onClick={() => setZoom((z) => !z)} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 transition active:scale-90" aria-label="Zoom">{zoom ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}</button>}
        <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 transition active:scale-90" aria-label={t('Close')}><X className="h-5 w-5" /></button>
      </div>

      <div className={cls('relative min-h-0 flex-1', zoom ? 'overflow-auto' : 'overflow-hidden')} style={{ touchAction: 'pan-x pan-y' }}>
        {error ? <p className="grid h-full place-items-center px-6 text-center text-sm text-white/70">{error}</p>
          : !url ? <div className="grid h-full place-items-center"><Spinner className="h-7 w-7 text-white/70" /></div>
          : isImage ? (
            <div className={cls('flex min-h-full items-center justify-center p-3', zoom && 'w-[200%]')} onDoubleClick={() => setZoom((z) => !z)}>
              <img src={url} alt={name} className={cls('rounded-lg object-contain', zoom ? 'w-full' : 'max-h-full max-w-full')} style={{ maxHeight: zoom ? 'none' : 'calc(100dvh - 190px - var(--safe-top) - var(--safe-bottom))' }} draggable="false" />
            </div>
          ) : isPdf && !phone ? (
            <iframe src={url} title={name} className="h-full w-full bg-white" />
          ) : (
            <div className="grid h-full place-items-center px-6 text-center">
              <div>
                <span className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-white/10"><FileText className="h-10 w-10" /></span>
                <p className="mt-4 font-semibold">{name}</p>
                <p className="mt-1 text-[13px] text-white/60">{isPdf ? t('PDF document') : type || t('File')} · {Math.max(1, Math.round((blob?.size || 0) / 1024))} KB</p>
                <p className="mt-3 text-[13px] text-white/60">{phone ? t('Tap Open / Save to view it or keep it on your phone.') : t('Use Download to save it.')}</p>
              </div>
            </div>
          )}
      </div>

      <div className="flex shrink-0 gap-2 px-4 pb-[calc(var(--safe-bottom)+14px)] pt-3">
        {url && !phone && <a href={url} target="_blank" rel="noreferrer" className="btn h-12 flex-1 border border-white/20 bg-white/5 text-white hover:bg-white/10"><ExternalLink className="h-4 w-4" />{t('Open in new tab')}</a>}
        <button onClick={save} disabled={!blob} className="btn h-12 flex-1 bg-white text-[15px] text-black hover:bg-white/90">
          {phone ? <Share className="h-[18px] w-[18px]" /> : <Download className="h-[18px] w-[18px]" />}
          {phone ? (isImage ? t('Save to Photos') : t('Open / Save')) : t('Download')}
        </button>
      </div>
    </div>
  )
}
