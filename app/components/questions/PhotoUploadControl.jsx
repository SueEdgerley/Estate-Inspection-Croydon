'use client'

import { useState, useRef } from 'react'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const UPLOAD_ENDPOINT = '/api/upload/photo'

export default function PhotoUploadControl({ value, onChange, required, error, disabled }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadError, setUploadError] = useState(null)
  const inputRef = useRef(null)

  const handleSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const type = file.type || ''
    if (!type.startsWith('image/')) {
      setUploadError('Please select an image file (JPEG, PNG, GIF, WebP).')
      e.target.value = ''
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError('File must be 10MB or smaller.')
      e.target.value = ''
      return
    }

    setUploadError(null)
    setUploading(true)
    setProgress(0)

    const xhr = new XMLHttpRequest()
    const fd = new FormData()
    fd.append('file', file)

    xhr.upload.addEventListener('progress', (ev) => {
      if (ev.lengthComputable) {
        const pct = Math.round((ev.loaded / ev.total) * 100)
        setProgress(pct)
      }
    })

    xhr.addEventListener('load', () => {
      setUploading(false)
      setProgress(100)
      e.target.value = ''
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText)
          if (data?.url) {
            onChange(data.url)
          } else {
            setUploadError('Upload succeeded but no URL returned.')
          }
        } catch {
          setUploadError('Invalid response from server.')
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText)
          setUploadError(data?.error || `Upload failed (${xhr.status})`)
        } catch {
          setUploadError(`Upload failed (${xhr.status})`)
        }
      }
    })

    xhr.addEventListener('error', () => {
      setUploading(false)
      setProgress(0)
      e.target.value = ''
      setUploadError('Network error during upload.')
    })

    xhr.open('POST', UPLOAD_ENDPOINT)
    xhr.send(fd)
  }

  const handleRemove = () => {
    onChange('')
    setUploadError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleReplace = () => {
    inputRef.current?.click()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/heic"
        capture="environment"
        onChange={handleSelect}
        disabled={disabled || uploading}
        style={{ display: 'none' }}
      />
      {!value ? (
        <>
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
              {uploading ? `Uploading… ${progress}%` : 'Upload or Take Photo'}
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
        </>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            padding: '0.75rem',
            background: '#f9fafb',
            borderRadius: '0.375rem',
            border: '1px solid #e5e7eb',
          }}
        >
          <img
            src={value}
            alt="Preview"
            style={{
              width: 80,
              height: 80,
              objectFit: 'cover',
              borderRadius: '0.25rem',
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: 0 }}>
              Photo uploaded
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={handleReplace}
                disabled={disabled || uploading}
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.8125rem',
                  background: '#e5e7eb',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: disabled || uploading ? 'not-allowed' : 'pointer',
                  color: '#374151',
                }}
              >
                Replace
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={disabled || uploading}
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.8125rem',
                  background: '#fee2e2',
                  color: '#dc2626',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: disabled || uploading ? 'not-allowed' : 'pointer',
                }}
              >
                Remove
              </button>
            </div>
          </div>
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
