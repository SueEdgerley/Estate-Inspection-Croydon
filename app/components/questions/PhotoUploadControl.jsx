'use client'

import { useState, useRef } from 'react'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const UPLOAD_ENDPOINT = '/api/upload/photo'

export default function PhotoUploadControl({
  id,
  value = [],
  onChange,
  required = false,
  error,
  disabled,
  label = 'Add photo',
  multiple = true,
}) {
  const photoUrls = Array.isArray(value) ? value.filter((u) => typeof u === 'string' && u) : []
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadError, setUploadError] = useState(null)
  const galleryInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const pendingReplaceRef = useRef(null)

  const handleSelect = (e) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    if (!files.length) return

    const replaceUrl = pendingReplaceRef.current
    pendingReplaceRef.current = null
    const isReplace = !!replaceUrl
    const filesToProcess = isReplace ? [files[0]] : files
    if (!filesToProcess.length) return

    setUploadError(null)
    const urlsToAdd = []

    const processNext = (index) => {
      if (index >= filesToProcess.length) {
        setUploading(false)
        setProgress(100)
        e.target.value = ''
        if (isReplace && urlsToAdd.length) {
          onChange(photoUrls.map((u) => (u === replaceUrl ? urlsToAdd[0] : u)))
        } else if (urlsToAdd.length) {
          onChange([...photoUrls, ...urlsToAdd])
        }
        return
      }

      const file = filesToProcess[index]
      const type = file.type || ''
      if (!type.startsWith('image/')) {
        setUploadError('Please select image files only (JPEG, PNG, GIF, WebP).')
        setUploading(false)
        e.target.value = ''
        return
      }
      if (file.size > MAX_FILE_SIZE) {
        setUploadError('Each file must be 10MB or smaller.')
        setUploading(false)
        e.target.value = ''
        return
      }

      const xhr = new XMLHttpRequest()
      const fd = new FormData()
      fd.append('file', file)

      xhr.upload.addEventListener('progress', (ev) => {
        if (ev.lengthComputable) {
          const pct = Math.round(((index + ev.loaded / ev.total) / filesToProcess.length) * 100)
          setProgress(pct)
        }
      })

      xhr.addEventListener('load', () => {
        setProgress(Math.round(((index + 1) / filesToProcess.length) * 100))
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText)
            if (data?.url) urlsToAdd.push(data.url)
          } catch {}
        }
        processNext(index + 1)
      })

      xhr.addEventListener('error', () => {
        setUploading(false)
        setUploadError('Network error during upload.')
        e.target.value = ''
      })

      xhr.open('POST', UPLOAD_ENDPOINT)
      xhr.send(fd)
    }

    setUploading(true)
    setProgress(0)
    processNext(0)
  }

  const handleRemove = (urlToRemove) => {
    onChange(photoUrls.filter((u) => u !== urlToRemove))
    setUploadError(null)
  }

  const handleReplace = (urlToReplace) => {
    pendingReplaceRef.current = urlToReplace
    if (galleryInputRef.current) {
      galleryInputRef.current.value = ''
      galleryInputRef.current.click()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
      <input
        ref={cameraInputRef}
        {...(id ? { id: `${id}-camera` } : {})}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/heic"
        capture="environment"
        onChange={handleSelect}
        disabled={disabled || uploading}
        multiple={false}
        style={{ display: 'none' }}
        aria-label={`${label} using camera`}
      />
      <input
        ref={galleryInputRef}
        {...(id ? { id } : {})}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/heic"
        onChange={handleSelect}
        disabled={disabled || uploading}
        multiple={multiple}
        style={{ display: 'none' }}
        aria-label={`${label} from gallery`}
      />
      <div style={{ display: 'grid', gap: '0.625rem', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={disabled || uploading}
          style={{
            minHeight: 52,
            padding: '0.75rem 1rem',
            backgroundColor: uploading ? '#9ca3af' : '#1e3a8a',
            color: 'white',
            border: 'none',
            borderRadius: '0.625rem',
            fontSize: '0.9375rem',
            fontWeight: 600,
            cursor: disabled || uploading ? 'not-allowed' : 'pointer',
          }}
        >
          Use camera
        </button>
        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          disabled={disabled || uploading}
          style={{
            minHeight: 52,
            padding: '0.75rem 1rem',
            backgroundColor: uploading ? '#9ca3af' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.625rem',
            fontSize: '0.9375rem',
            fontWeight: 600,
            cursor: disabled || uploading ? 'not-allowed' : 'pointer',
          }}
        >
          {uploading ? `Uploading… ${progress}%` : 'Upload photo'}
        </button>
      </div>
      <p style={{ margin: 0, fontSize: '0.8125rem', color: '#6b7280' }}>
        Add a clear photo so officers can find the issue quickly.
      </p>
      {uploading && (
        <div
          style={{
            height: 6,
            background: '#e5e7eb',
            borderRadius: 999,
            overflow: 'hidden',
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
      {photoUrls.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.625rem',
            marginTop: '0.25rem',
          }}
        >
          {photoUrls.map((url) => (
            <div
              key={url}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.625rem',
                background: '#f9fafb',
                borderRadius: '0.625rem',
                border: '1px solid #e5e7eb',
              }}
            >
              <img
                src={url}
                alt="Preview"
                style={{
                  width: 72,
                  height: 72,
                  objectFit: 'cover',
                  borderRadius: '0.375rem',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => handleReplace(url)}
                  disabled={disabled || uploading}
                  style={{
                    minHeight: 36,
                    padding: '0.35rem 0.55rem',
                    fontSize: '0.8125rem',
                    background: '#e5e7eb',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: disabled || uploading ? 'not-allowed' : 'pointer',
                    color: '#374151',
                    fontWeight: 600,
                  }}
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(url)}
                  disabled={disabled || uploading}
                  style={{
                    minHeight: 36,
                    padding: '0.35rem 0.55rem',
                    fontSize: '0.8125rem',
                    background: '#fee2e2',
                    color: '#dc2626',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: disabled || uploading ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
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
