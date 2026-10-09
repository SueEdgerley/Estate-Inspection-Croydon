import { isBrowserOnline } from '@/lib/offline-browser'

const UPLOAD_ENDPOINT = '/api/upload/photo'
const UPLOAD_TIMEOUT_MS = 45000

export function isPendingLocalPhotoUrl(url) {
  return typeof url === 'string' && (url.startsWith('blob:') || url.startsWith('data:'))
}

export function replaceUrlInList(urls, previousUrl, nextUrl) {
  const list = Array.isArray(urls) ? [...urls] : []
  if (!previousUrl || !nextUrl) return list
  return list.map((url) => (url === previousUrl ? nextUrl : url))
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
  if (!isBrowserOnline()) {
    return Promise.reject(new Error('Offline'))
  }
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

    xhr.addEventListener('timeout', () => {
      reject(new Error('Network error during upload.'))
    })

    xhr.open('POST', UPLOAD_ENDPOINT)
    xhr.timeout = UPLOAD_TIMEOUT_MS
    xhr.send(fd)
  })
}

export async function uploadPendingLocalPhotoUrl(localUrl) {
  const blob = await dataUrlToBlob(localUrl)
  const fileName = localUrl.startsWith('data:image/png') ? 'photo.png' : 'photo.jpg'
  return uploadPhotoBlob(blob, fileName)
}

export async function uploadPendingLocalPhotoUrls(urls, onProgress) {
  if (!isBrowserOnline()) {
    return { nextUrls: [...urls], uploadedCount: 0 }
  }
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

function isPhotoUrlListKey(key, value) {
  return PHOTO_URL_KEYS.includes(key) || (String(key || '').includes('photo') && Array.isArray(value))
}

function extrasHavePendingPhotos(extras) {
  if (!extras || typeof extras !== 'object') return false
  for (const [key, value] of Object.entries(extras)) {
    if (!isPhotoUrlListKey(key, value) || !Array.isArray(value)) continue
    if (value.some(isPendingLocalPhotoUrl)) return true
  }
  return false
}

function answerValueHasPendingPhotos(value) {
  if (typeof value !== 'string' || !value.trim().startsWith('[')) return false
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed.some(isPendingLocalPhotoUrl)
    }
    if (Array.isArray(parsed)) {
      return parsed.some((item) => extrasHavePendingPhotos(item))
    }
  } catch {
    return false
  }
  return false
}

async function uploadPendingPhotosInAnswerValue(value) {
  if (typeof value !== 'string' || !value.trim().startsWith('[')) return value
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      const uploaded = await uploadPendingUrlsInList(parsed)
      return uploaded !== parsed ? JSON.stringify(uploaded) : value
    }
    if (Array.isArray(parsed)) {
      let changed = false
      const nextItems = []
      for (const item of parsed) {
        if (!item || typeof item !== 'object') {
          nextItems.push(item)
          continue
        }
        const updatedItem = { ...item }
        for (const [key, list] of Object.entries(updatedItem)) {
          if (!isPhotoUrlListKey(key, list) || !Array.isArray(list)) continue
          const uploadedUrls = await uploadPendingUrlsInList(list)
          if (uploadedUrls !== list) {
            updatedItem[key] = uploadedUrls
            changed = true
          }
        }
        nextItems.push(updatedItem)
      }
      return changed ? JSON.stringify(nextItems) : value
    }
  } catch {
    return value
  }
  return value
}

export async function uploadPendingPhotosInSubmitBody(body) {
  if (!isBrowserOnline()) return body
  if (!body || typeof body !== 'object') return body

  let changed = false
  const nextExtras = {}
  const answerExtras = body.answer_extras

  if (answerExtras && typeof answerExtras === 'object') {
    for (const [questionId, extras] of Object.entries(answerExtras)) {
      if (!extras || typeof extras !== 'object') {
        nextExtras[questionId] = extras
        continue
      }
      const updatedExtras = { ...extras }
      for (const [key, value] of Object.entries(updatedExtras)) {
        if (!isPhotoUrlListKey(key, value) || !Array.isArray(value)) continue
        const uploadedUrls = await uploadPendingUrlsInList(value)
        if (uploadedUrls !== value) {
          updatedExtras[key] = uploadedUrls
          changed = true
        }
      }
      nextExtras[questionId] = updatedExtras
    }
  }

  const answers = body.answers && typeof body.answers === 'object' ? { ...body.answers } : null
  if (answers) {
    for (const [questionId, value] of Object.entries(answers)) {
      const uploadedValue = await uploadPendingPhotosInAnswerValue(value)
      if (uploadedValue !== value) {
        answers[questionId] = uploadedValue
        changed = true
      }
    }
  }

  if (!changed) return body
  return {
    ...body,
    ...(answerExtras && typeof answerExtras === 'object' ? { answer_extras: nextExtras } : {}),
    ...(answers ? { answers } : {}),
  }
}

export function submitBodyHasPendingPhotos(body) {
  const answerExtras = body?.answer_extras || {}
  for (const extras of Object.values(answerExtras)) {
    if (extrasHavePendingPhotos(extras)) return true
  }
  const answers = body?.answers || {}
  for (const value of Object.values(answers)) {
    if (answerValueHasPendingPhotos(value)) return true
  }
  return false
}
