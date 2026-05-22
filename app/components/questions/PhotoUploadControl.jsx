'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { isBrowserOnline } from '@/lib/offline-browser'
import {
  isPendingLocalPhotoUrl,
  readImageFileAsDataUrl,
  uploadPendingLocalPhotoUrls,
} from '@/lib/offline-photo-upload'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export default function PhotoUploadControl({
  id,
  value = [],
  onChange,
  required = false,
  error,
  disabled,
  label = 'Add photo',
  multiple = true,
  mobileStacked = false,
}) {
  const photoUrls = Array.isArray(value) ? value.filter((u) => typeof u === 'string' && u) : []
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadError, setUploadError] = useState(null)
  const [localSaveNotice, setLocalSaveNotice] = useState(null)
  const inputRef = useRef(null)
  const pendingReplaceRef = useRef(null)
  const syncingRef = useRef(false)
  const photoUrlsRef = useRef(photoUrls)

  useEffect(() => {
    photoUrlsRef.current = photoUrls
  }, [photoUrls])

  const syncPendingUploads = useCallback(async () => {
    if (syncingRef.current || !isBrowserOnline()) return
    const currentUrls = photoUrlsRef.current
    const pendingUrls = currentUrls.filter(isPendingLocalPhotoUrl)
    if (!pendingUrls.length) return

    syncingRef.current = true
    setUploading(true)
    setUploadError(null)
    setLocalSaveNotice(null)
    setProgress(0)

    try {
      const { nextUrls, uploadedCount } = await uploadPendingLocalPhotoUrls(currentUrls, ({ uploadedCount: done }) => {
        setProgress(Math.round((done / pendingUrls.length) * 100))
      })
      if (uploadedCount > 0) {
        onChange(nextUrls)
      }
    } catch {
      setLocalSaveNotice('Photo saved on this phone — waiting to upload')
    } finally {
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
    const localUrl = await readImageFileAsDataUrl(file)
    if (!localUrl) throw new Error('Could not save photo on this phone.')
    urlsToAdd.push(localUrl)
    setLocalSaveNotice('Photo saved on this phone — waiting to upload')
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
    const fd = new FormData()
    fd.append('file', file)

    xhr.upload.addEventListener('progress', (ev) => {
      if (ev.lengthComputable) {
        setProgress(Math.round((ev.loaded / ev.total) * 100))
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText)
          if (data?.url) {
            onUploaded(data.url)
            return
          }
        } catch {}
      }
      onFailed(null)
    })

    xhr.addEventListener('error', () => {
      onFailed(null)
    })

    xhr.open('POST', '/api/upload/photo')
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
    const urlsToAdd = []

    const finishSelection = () => {
      setUploading(false)
      setProgress(100)
      e.target.value = ''
      if (isReplace && urlsToAdd.length) {
        onChange(photoUrls.map((u) => (u === replaceUrl ? urlsToAdd[0] : u)))
      } else if (urlsToAdd.length) {
        onChange([...photoUrls, ...urlsToAdd])
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

      uploadFile(
        file,
        (url) => {
          urlsToAdd.push(url)
          processNext(index + 1)
        },
        async (message) => {
          try {
            await storePhotoLocally(file, urlsToAdd)
            if (message) setUploadError(message)
            await processNext(index + 1)
          } catch (err) {
            setUploading(false)
            setUploadError(err?.message || message || 'Could not save photo on this phone.')
            e.target.value = ''
          }
        }
      )
    }

    setUploading(true)
    setProgress(0)
    await processNext(0)
  }

  const handleRemove = (urlToRemove) => {
    onChange(photoUrls.filter((u) => u !== urlToRemove))
    setUploadError(null)
    setLocalSaveNotice(null)
  }

  const handleReplace = (urlToReplace) => {
    pendingReplaceRef.current = urlToReplace
    if (inputRef.current) {
      inputRef.current.value = ''
      inputRef.current.click()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      <input
        ref={inputRef}
        {...(id ? { id } : {})}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/heic"
        capture="environment"
        onChange={handleSelect}
        disabled={disabled || uploading}
        multiple={multiple}
        style={{ display: 'none' }}
        aria-label={label}
      />
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          style={{
            padding: mobileStacked ? '0.75rem 1rem' : '0.5rem 1rem',
            minHeight: mobileStacked ? 48 : undefined,
            width: mobileStacked ? '100%' : undefined,
            backgroundColor: uploading ? '#9ca3af' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            fontSize: mobileStacked ? '1rem' : '0.875rem',
            fontWeight: 500,
            cursor: disabled || uploading ? 'not-allowed' : 'pointer',
          }}
        >
          {uploading ? `Uploading… ${progress}%` : label}
        </button>
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
              width: `${progress}%`,
              background: '#3b82f6',
              transition: 'width 0.2s ease',
            }}
          />
        </div>
      )}
      {localSaveNotice ? (
        <p style={{ margin: 0, fontSize: '0.875rem', color: '#92400e' }}>{localSaveNotice}</p>
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
