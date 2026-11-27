// Prepare files before uploading: photos are shrunk in the browser (smaller uploads, faster on mobile data,
// and less storage used on the free plan); anything still too big is refused with a clear message.
// The server enforces the same limits, so this is for a better experience, not for security.
export const MAX_FILE_MB = 5
const MAX_BYTES = MAX_FILE_MB * 1024 * 1024
const SHRINK_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIDE = 2000
const SMALL_ENOUGH = 700 * 1024

async function decode(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { /* fall back below */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally { URL.revokeObjectURL(url) }
}

/** Shrink a photo to at most 2000px on its longest side as a JPEG. Returns the original if that fails or is not smaller. */
export async function shrinkImage(file) {
  if (!SHRINK_TYPES.includes(file.type)) return file
  try {
    const img = await decode(file)
    const w = img.width, h = img.height
    if (file.size <= SMALL_ENOUGH && Math.max(w, h) <= MAX_SIDE) return file
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)   // transparent PNGs get a white background
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    img.close?.()
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.86))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg', { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}

/** Shrink photos and drop files over the limit. Returns { files, errors } with errors already translated. */
export async function prepareFiles(list, t) {
  const files = [], errors = []
  for (const original of Array.from(list || [])) {
    const f = await shrinkImage(original)
    if (f.size > MAX_BYTES) errors.push(t('{name} is larger than {mb} MB. Please choose a smaller file.', { name: original.name, mb: MAX_FILE_MB }))
    else files.push(f)
  }
  return { files, errors }
}
