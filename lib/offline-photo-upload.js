const UPLOAD_ENDPOINT = '/api/upload/photo'

export function isPendingLocalPhotoUrl(url) {
  return typeof url === 'string' && (url.startsWith('blob:') || url.startsWith('data:'))
}

export function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error || new Error('Could not read photo file'))
    reader.readAsDataURL(file)
  })
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl)
  return response.blob()
}

export function uploadPhotoBlob(blob, fileName = 'photo.jpg') {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const fd = new FormData()
    fd.append('file', blob, fileName)

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText)
          if (data?.url) {
            resolve(data.url)
            return
          }
        } catch {}
      }
      let message = 'Photo upload failed. Please try again.'
      try {
        const data = JSON.parse(xhr.responseText)
        message = data?.error || data?.details || message
      } catch {}
      reject(new Error(message))
    })

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload.'))
    })

    xhr.open('POST', UPLOAD_ENDPOINT)
    xhr.send(fd)
  })
}

export async function uploadPendingLocalPhotoUrl(localUrl) {
  const blob = await dataUrlToBlob(localUrl)
  const fileName = localUrl.startsWith('data:image/png') ? 'photo.png' : 'photo.jpg'
  return uploadPhotoBlob(blob, fileName)
}

export async function uploadPendingLocalPhotoUrls(urls, onProgress) {
  const nextUrls = [...urls]
  let uploadedCount = 0

  for (let index = 0; index < nextUrls.length; index += 1) {
    const url = nextUrls[index]
    if (!isPendingLocalPhotoUrl(url)) continue
    const uploadedUrl = await uploadPendingLocalPhotoUrl(url)
    nextUrls[index] = uploadedUrl
    uploadedCount += 1
    onProgress?.({ index, uploadedUrl, nextUrls: [...nextUrls], uploadedCount })
  }

  return { nextUrls, uploadedCount }
}

const PHOTO_URL_KEYS = ['photo_urls', 'id_card_photo_urls', 'paper_form_photo_urls', 'photoUrls']

async function uploadPendingUrlsInList(urls) {
  if (!Array.isArray(urls)) return urls
  const nextUrls = [...urls]
  let changed = false
  for (let index = 0; index < nextUrls.length; index += 1) {
    if (!isPendingLocalPhotoUrl(nextUrls[index])) continue
    nextUrls[index] = await uploadPendingLocalPhotoUrl(nextUrls[index])
    changed = true
  }
  return changed ? nextUrls : urls
}

export async function uploadPendingPhotosInSubmitBody(body) {
  if (!body || typeof body !== 'object') return body
  const answerExtras = body.answer_extras
  if (!answerExtras || typeof answerExtras !== 'object') return body

  let changed = false
  const nextExtras = {}

  for (const [questionId, extras] of Object.entries(answerExtras)) {
    if (!extras || typeof extras !== 'object') {
      nextExtras[questionId] = extras
      continue
    }
    const updatedExtras = { ...extras }
    for (const [key, value] of Object.entries(updatedExtras)) {
      const isPhotoKey = PHOTO_URL_KEYS.includes(key) || (key.includes('photo') && Array.isArray(value))
      if (!isPhotoKey || !Array.isArray(value)) continue
      const uploadedUrls = await uploadPendingUrlsInList(value)
      if (uploadedUrls !== value) {
        updatedExtras[key] = uploadedUrls
        changed = true
      }
    }
    nextExtras[questionId] = updatedExtras
  }

  return changed ? { ...body, answer_extras: nextExtras } : body
}

export function submitBodyHasPendingPhotos(body) {
  const answerExtras = body?.answer_extras || {}
  for (const extras of Object.values(answerExtras)) {
    if (!extras || typeof extras !== 'object') continue
    for (const [key, value] of Object.entries(extras)) {
      const isPhotoKey = PHOTO_URL_KEYS.includes(key) || (key.includes('photo') && Array.isArray(value))
      if (!isPhotoKey || !Array.isArray(value)) continue
      if (value.some(isPendingLocalPhotoUrl)) return true
    }
  }
  return false
}
