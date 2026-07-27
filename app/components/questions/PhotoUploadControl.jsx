'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { isBrowserOnline } from '@/lib/offline-browser'
import {
  isPendingLocalPhotoUrl,
  readImageFileAsDataUrl,
  uploadPendingLocalPhotoUrls,
} from '@/lib/offline-photo-upload'
import { getPhotoUploadInputAttrs } from '@/lib/photo-upload-input-attrs'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_IMAGE_DIMENSION = 1600
const JPEG_QUALITY = 0.8
const UPLOAD_TIMEOUT_MS = 45000
const STALL_SIGNAL_MS = 8000
const LOCAL_SAVE_NOTICE = 'Photo saved on this phone — waiting to upload'
const WAITING_FOR_SIGNAL_NOTICE =
  'Waiting for signal… photo will upload when connection improves.'

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}

async function loadImageFromFile(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file, { imageOrientation: 'from-image' })
  }

  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Could not load image for compression'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function compressImageFile(file) {
  const type = file?.type || ''
  if (!type.startsWith('image/') || type === 'image/gif') return file
  if (typeof document === 'undefined') return file

  try {
    const image = await loadImageFromFile(file)
    const sourceWidth = image.width || image.naturalWidth
    const sourceHeight = image.height || image.naturalHeight
    if (!sourceWidth || !sourceHeight) return file

    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(sourceWidth, sourceHeight))
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    ctx.drawImage(image, 0, 0, width, height)
    if (typeof image.close === 'function') image.close()

    const blob = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY)
    if (!blob) return file

    const compressedName = String(file.name || 'photo.jpg').replace(/\.[^.]+$/, '') + '.jpg'
    if (typeof File === 'function') {
      return new File([blob], compressedName, { type: 'image/jpeg', lastModified: Date.now() })
    }
    blob.name = compressedName
    return blob
  } catch (err) {
    console.warn('[PhotoUploadControl] Photo compression skipped; using original image.', err?.name || err?.message || err)
    return file
  }
}

export default function PhotoUploadControl({
  id,
  value = null,
  onChange,
  required = false,
  error,
  disabled,
  label = 'Add photo',
  cameraLabel = 'Take a picture',
  galleryLabel = 'Choose from gallery',
  multiple = true,
  mobileStacked = false,
  onUploadStatusChange,
  onPendingLocalPhotoSaved,
}) {
  const photoUrls = useMemo(
    () => (Array.isArray(value) ? value.filter((u) => typeof u === 'string' && u) : []),
    [value]
  )
  const inputAttrs = useMemo(() => getPhotoUploadInputAttrs({ multiple }), [multiple])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadError, setUploadError] = useState(null)
  const [localSaveNotice, setLocalSaveNotice] = useState(null)
  const [waitingForSignal, setWaitingForSignal] = useState(false)
  const cameraInputRef = useRef(null)
  const galleryInputRef = useRef(null)
  const pendingReplaceRef = useRef(null)
  const syncingRef = useRef(false)
  const photoUrlsRef = useRef(photoUrls)
  const activeXhrRef = useRef(null)

  // Keep ref in sync with props, but never clobber mid-upload — a stale parent
  // value (before the previous onChange re-renders) would drop just-added URLs.
  useEffect(() => {
    if (uploading) return
    photoUrlsRef.current = photoUrls
  }, [photoUrls, uploading])

  useEffect(() => {
    onUploadStatusChange?.(uploading)
  }, [onUploadStatusChange, uploading])

  const hasPendingLocalPhotos = photoUrls.some(isPendingLocalPhotoUrl)

  const syncPendingUploads = useCallback(async () => {
    if (syncingRef.current || !isBrowserOnline()) return
    const currentUrls = photoUrlsRef.current
    const pendingUrls = currentUrls.filter(isPendingLocalPhotoUrl)
    if (!pendingUrls.length) return

    syncingRef.current = true
    setUploading(true)
    setUploadError(null)
    setLocalSaveNotice(null)
    setWaitingForSignal(false)
    setProgress(0)

    let stallTimer = null
    const stallTimerId = window.setTimeout(() => {
      setWaitingForSignal(true)
    }, STALL_SIGNAL_MS)

    stallTimer = stallTimerId

    try {
      const { nextUrls, uploadedCount } = await uploadPendingLocalPhotoUrls(currentUrls, ({ uploadedCount: done }) => {
        if (done > 0) setWaitingForSignal(false)
        setProgress(Math.round((done / pendingUrls.length) * 100))
      })
      if (uploadedCount > 0) {
        photoUrlsRef.current = nextUrls
        onChange(nextUrls)
        setLocalSaveNotice(null)
      } else if (pendingUrls.length > 0) {
        setLocalSaveNotice(LOCAL_SAVE_NOTICE)
        setWaitingForSignal(true)
      }
    } catch {
      setLocalSaveNotice(LOCAL_SAVE_NOTICE)
      setWaitingForSignal(true)
    } finally {
      if (stallTimer) window.clearTimeout(stallTimer)
      syncingRef.current = false
      setUploading(false)
      setProgress(100)
    }
  }, [onChange])

  useEffect(() => {
    const handleOnline = () => {
      syncPendingUploads()
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [syncPendingUploads])

  const storePhotoLocally = async (file, urlsToAdd) => {
    const photoForStorage = await compressImageFile(file)
    const localUrl = await readImageFileAsDataUrl(photoForStorage)
    if (!localUrl) throw new Error('Could not save photo on this phone.')
    urlsToAdd.push(localUrl)
    setLocalSaveNotice(LOCAL_SAVE_NOTICE)
    setWaitingForSignal(!isBrowserOnline())
    setUploadError(null)
  }

  const uploadFile = (file, onUploaded, onFailed) => {
    if (!isBrowserOnline()) {
      onFailed(null)
      return
    }

    const type = file.type || ''
    if (!type.startsWith('image/')) {
      onFailed('Please select image files only (JPEG, PNG, GIF, WebP).')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      onFailed('Each file must be 10MB or smaller.')
      return
    }

    const xhr = new XMLHttpRequest()
    activeXhrRef.current = xhr
    const fd = new FormData()
    fd.append('file', file, file.name || 'photo.jpg')

    let completed = false
    let stallTimer = null

    const finish = (handler, ...args) => {
      if (completed) return
      completed = true
      if (stallTimer) window.clearTimeout(stallTimer)
      activeXhrRef.current = null
      setWaitingForSignal(false)
      handler(...args)
    }

    stallTimer = window.setTimeout(() => {
      if (!completed) setWaitingForSignal(true)
    }, STALL_SIGNAL_MS)

    xhr.upload.addEventListener('progress', (ev) => {
      if (ev.lengthComputable && ev.total > 0) {
        setWaitingForSignal(false)
        setProgress(Math.round((ev.loaded / ev.total) * 100))
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText)
          if (data?.url) {
            finish(onUploaded, data.url)
            return
          }
        } catch {}
      }
      finish(onFailed, null)
    })

    xhr.addEventListener('error', () => {
      finish(onFailed, null)
    })

    xhr.addEventListener('timeout', () => {
      try {
        xhr.abort()
      } catch {}
      finish(onFailed, null)
    })

    xhr.open('POST', '/api/upload/photo')
    xhr.timeout = UPLOAD_TIMEOUT_MS
    xhr.send(fd)
  }

  const handleSelect = async (e) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    if (!files.length) return

    const replaceUrl = pendingReplaceRef.current
    pendingReplaceRef.current = null
    const isReplace = !!replaceUrl
    const filesToProcess = isReplace ? [files[0]] : files
    if (!filesToProcess.length) return

    setUploadError(null)
    setLocalSaveNotice(null)
    setWaitingForSignal(false)
    const urlsToAdd = []

    const finishSelection = () => {
      setUploading(false)
      setProgress(100)
      e.target.value = ''
      // Always append against the latest known list — render-time `photoUrls` can be
      // stale if the parent has not re-rendered yet after a previous upload.
      const currentUrls = photoUrlsRef.current
      let nextUrls = currentUrls
      if (isReplace && urlsToAdd.length) {
        nextUrls = currentUrls.map((u) => (u === replaceUrl ? urlsToAdd[0] : u))
        photoUrlsRef.current = nextUrls
        onChange(nextUrls)
      } else if (urlsToAdd.length) {
        const seen = new Set(currentUrls)
        nextUrls = [...currentUrls]
        for (const url of urlsToAdd) {
          if (!url || seen.has(url)) continue
          seen.add(url)
          nextUrls.push(url)
        }
        photoUrlsRef.current = nextUrls
        onChange(nextUrls)
      }
      if (urlsToAdd.some(isPendingLocalPhotoUrl)) {
        onPendingLocalPhotoSaved?.(nextUrls)
      }
    }

    const processNext = async (index) => {
      if (index >= filesToProcess.length) {
        finishSelection()
        if (isBrowserOnline() && urlsToAdd.some(isPendingLocalPhotoUrl)) {
          await syncPendingUploads()
        }
        return
      }

      const file = filesToProcess[index]

      if (!isBrowserOnline()) {
        try {
          await storePhotoLocally(file, urlsToAdd)
          await processNext(index + 1)
        } catch (err) {
          setUploading(false)
          setUploadError(err?.message || 'Could not save photo on this phone.')
          e.target.value = ''
        }
        return
      }

      try {
        const uploadFileOrBlob = await compressImageFile(file)
        uploadFile(
          uploadFileOrBlob,
          (url) => {
            urlsToAdd.push(url)
            processNext(index + 1)
          },
          async (message) => {
            try {
              await storePhotoLocally(uploadFileOrBlob, urlsToAdd)
              if (message) setUploadError(message)
              await processNext(index + 1)
            } catch (err) {
              setUploading(false)
              setUploadError(err?.message || message || 'Could not save photo on this phone.')
              e.target.value = ''
            }
          }
        )
      } catch (err) {
        setUploading(false)
        setUploadError(err?.message || 'Could not prepare photo for upload.')
        e.target.value = ''
      }
    }

    setUploading(true)
    setProgress(0)
    await processNext(0)
  }

  const handleRemove = (urlToRemove) => {
    const nextUrls = photoUrlsRef.current.filter((u) => u !== urlToRemove)
    photoUrlsRef.current = nextUrls
    onChange(nextUrls)
    setUploadError(null)
    if (!nextUrls.some((u) => isPendingLocalPhotoUrl(u))) {
      setLocalSaveNotice(null)
      setWaitingForSignal(false)
    }
  }

  const openFileInput = (ref) => {
    if (!ref?.current) return
    ref.current.value = ''
    ref.current.click()
  }

  const handleReplace = (urlToReplace) => {
    pendingReplaceRef.current = urlToReplace
    // Retake via camera by default; user can still Remove + Choose from gallery.
    openFileInput(cameraInputRef)
  }

  const handleRetryUpload = () => {
    if (uploading) return
    if (hasPendingLocalPhotos) {
      syncPendingUploads()
      return
    }
    if (activeXhrRef.current) {
      try {
        activeXhrRef.current.abort()
      } catch {}
    }
  }

  const busyLabel =
    waitingForSignal && progress === 0 ? 'Waiting for signal…' : `Uploading… ${progress}%`
  const cameraButtonLabel = uploading ? busyLabel : cameraLabel
  const galleryButtonLabel = uploading ? busyLabel : galleryLabel

  const statusMessage =
    waitingForSignal && (uploading || hasPendingLocalPhotos)
      ? WAITING_FOR_SIGNAL_NOTICE
      : localSaveNotice

  const actionButtonStyle = {
    padding: mobileStacked ? '0.75rem 1rem' : '0.5rem 1rem',
    minHeight: mobileStacked ? 48 : undefined,
    width: mobileStacked ? '100%' : undefined,
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: mobileStacked ? '1rem' : '0.875rem',
    fontWeight: 500,
    cursor: disabled || uploading ? 'not-allowed' : 'pointer',
  }

  return (
    <div
      role="group"
      aria-label={label || 'Photo upload'}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', minWidth: 0, boxSizing: 'border-box' }}
    >
      {/* Camera: capture opens rear camera on mobile. Gallery: no capture → photo library. Both append via handleSelect. */}
      <input
        ref={cameraInputRef}
        {...(id ? { id } : {})}
        type="file"
        accept={inputAttrs.camera.accept}
        capture={inputAttrs.camera.capture}
        multiple={inputAttrs.camera.multiple}
        onChange={handleSelect}
        disabled={disabled || uploading}
        style={{ display: 'none' }}
        aria-label={cameraLabel}
        data-photo-source="camera"
      />
      <input
        ref={galleryInputRef}
        {...(id ? { id: `${id}-gallery` } : {})}
        type="file"
        accept={inputAttrs.gallery.accept}
        multiple={inputAttrs.gallery.multiple}
        onChange={handleSelect}
        disabled={disabled || uploading}
        style={{ display: 'none' }}
        aria-label={galleryLabel}
        data-photo-source="gallery"
      />
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => openFileInput(cameraInputRef)}
          disabled={disabled || uploading}
          style={{
            ...actionButtonStyle,
            backgroundColor: uploading ? '#9ca3af' : '#3b82f6',
          }}
        >
          {cameraButtonLabel}
        </button>
        <button
          type="button"
          onClick={() => openFileInput(galleryInputRef)}
          disabled={disabled || uploading}
          style={{
            ...actionButtonStyle,
            backgroundColor: uploading ? '#9ca3af' : '#2563eb',
          }}
        >
          {galleryButtonLabel}
        </button>
        {(hasPendingLocalPhotos || waitingForSignal) && !uploading ? (
          <button
            type="button"
            onClick={handleRetryUpload}
            disabled={disabled}
            style={{
              padding: mobileStacked ? '0.75rem 1rem' : '0.5rem 0.75rem',
              minHeight: mobileStacked ? 48 : undefined,
              backgroundColor: '#fff',
              color: '#1d4ed8',
              border: '1px solid #93c5fd',
              borderRadius: '0.375rem',
              fontSize: mobileStacked ? '1rem' : '0.875rem',
              fontWeight: 500,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            Retry upload
          </button>
        ) : null}
      </div>
      {uploading && (
        <div
          style={{
            height: 4,
            background: '#e5e7eb',
            borderRadius: 2,
            overflow: 'hidden',
            maxWidth: 200,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.max(progress, waitingForSignal && progress === 0 ? 8 : 0)}%`,
              background: waitingForSignal && progress === 0 ? '#f59e0b' : '#3b82f6',
              transition: 'width 0.2s ease',
            }}
          />
        </div>
      )}
      {statusMessage ? (
        <p style={{ margin: 0, fontSize: '0.875rem', color: '#92400e' }}>{statusMessage}</p>
      ) : null}
      {photoUrls.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginTop: '0.25rem',
          }}
        >
          {photoUrls.map((url, index) => (
            <div
              key={`${url}-${index}`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.25rem',
                padding: '0.5rem',
                background: '#f9fafb',
                borderRadius: '0.375rem',
                border: '1px solid #e5e7eb',
              }}
            >
              <img
                src={url}
                alt="Preview"
                style={{
                  width: 64,
                  height: 64,
                  objectFit: 'cover',
                  borderRadius: '0.25rem',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {isPendingLocalPhotoUrl(url) ? (
                  <span style={{ fontSize: '0.72rem', color: '#92400e', maxWidth: 120, lineHeight: 1.35 }}>
                    Saved on phone — waiting to upload
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => handleReplace(url)}
                  disabled={disabled || uploading}
                  style={{
                    padding: '0.2rem 0.4rem',
                    fontSize: '0.75rem',
                    background: '#e5e7eb',
                    border: 'none',
                    borderRadius: '0.2rem',
                    cursor: disabled || uploading ? 'not-allowed' : 'pointer',
                    color: '#374151',
                  }}
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(url)}
                  disabled={disabled || uploading}
                  style={{
                    padding: '0.2rem 0.4rem',
                    fontSize: '0.75rem',
                    background: '#fee2e2',
                    color: '#dc2626',
                    border: 'none',
                    borderRadius: '0.2rem',
                    cursor: disabled || uploading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {(uploadError || error) && (
        <p style={{ margin: 0, fontSize: '0.875rem', color: '#ef4444' }}>
          {uploadError || error}
        </p>
      )}
    </div>
  )
}
