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
  const inputRef = useRef(null)
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
            padding: '0.5rem 1rem',
            backgroundColor: uploading ? '#9ca3af' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
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
      {photoUrls.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginTop: '0.25rem',
          }}
        >
          {photoUrls.map((url) => (
            <div
              key={url}
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
