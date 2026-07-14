'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function useIsNarrowScreen() {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)')
    const update = () => setIsNarrow(media.matches)
    update()

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }

    media.addListener(update)
    return () => media.removeListener(update)
  }, [])

  return isNarrow
}

export default function LocationBlockSelector({
  id,
  name,
  value,
  onChange,
  locations = [],
  required = false,
  error = false,
  noneLabel = '-- None selected --',
  selectLabel = '-- Select location --',
  style = {},
}) {
  const isMobile = useIsNarrowScreen()
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const closeTimerRef = useRef(null)
  const typingClearedSelectionRef = useRef(false)

  const options = useMemo(
    () =>
      (Array.isArray(locations) ? locations : [])
        .filter((location) => location && location.id != null)
        .map((location) => ({
          id: String(location.id),
          name: String(location.name || '').trim() || String(location.id),
        }))
        .sort((a, b) =>
          a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base', numeric: true })
        ),
    [locations]
  )

  const selectedOption = useMemo(
    () => options.find((option) => option.id === String(value || '')) || null,
    [options, value]
  )

  useEffect(() => {
    if (typingClearedSelectionRef.current) {
      typingClearedSelectionRef.current = false
      return
    }
    setQuery(selectedOption?.name || '')
  }, [selectedOption])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  const normalizedQuery = normalizeText(query)
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options.slice(0, 50)
    return options
      .filter((option) => normalizeText(option.name).includes(normalizedQuery))
      .slice(0, 50)
  }, [normalizedQuery, options])

  const handleSelect = (option) => {
    onChange(option.id)
    setQuery(option.name)
    setIsOpen(false)
  }

  const handleClear = () => {
    onChange('')
    setQuery('')
    setIsOpen(true)
  }

  if (!isMobile) {
    return (
      <select
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        style={style}
      >
        <option value="">{required ? selectLabel : noneLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <input type="hidden" name={name} value={value || ''} />
      <input
        id={id}
        type="text"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setIsOpen(true)
          if (value) {
            typingClearedSelectionRef.current = true
            onChange('')
          }
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          closeTimerRef.current = setTimeout(() => setIsOpen(false), 150)
        }}
        placeholder="Search by estate, block or location"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={`${id}-results`}
        aria-invalid={!!error}
        aria-required={required}
        style={style}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
        <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
          {selectedOption ? `Selected: ${selectedOption.name}` : 'Start typing to filter locations'}
        </span>
        {(query || value) && (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleClear}
            style={{
              border: 0,
              padding: 0,
              background: 'transparent',
              color: '#1d4ed8',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        )}
      </div>
      {isOpen && (
        <div
          id={`${id}-results`}
          role="listbox"
          aria-label="Matching locations"
          style={{
            marginTop: 6,
            maxHeight: 260,
            overflowY: 'auto',
            border: '1px solid #d1d5db',
            borderRadius: '0.5rem',
            background: '#fff',
            boxShadow: '0 12px 24px rgba(15, 23, 42, 0.12)',
            zIndex: 20,
          }}
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === String(value || '')}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(option)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '0.75rem',
                  border: 0,
                  borderBottom: '1px solid #f1f5f9',
                  background: option.id === String(value || '') ? '#eff6ff' : '#fff',
                  color: '#111827',
                  textAlign: 'left',
                  fontSize: '1rem',
                  cursor: 'pointer',
                }}
              >
                {option.name}
              </button>
            ))
          ) : (
            <p style={{ margin: 0, padding: '0.75rem', color: '#6b7280', fontSize: '0.9375rem' }}>
              No matching locations
            </p>
          )}
        </div>
      )}
    </div>
  )
}
