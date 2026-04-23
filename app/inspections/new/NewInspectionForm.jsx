'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import YesNoNaButtons from '@/app/components/questions/YesNoNaButtons'
import PhotoUploadControl from '@/app/components/questions/PhotoUploadControl'
import {
  NV_Q24_AIRTABLE_ROWS_188_192,
  applyNeighbourhoodVoicePatchesToList,
  getNvQuestionStepLabel,
  isNeighbourhoodVoiceQuestionRenderable,
} from '@/lib/neighbourhood-voice-template-patch'
import { NV_TEXT_INPUT_SURFACE, NV_TEXTAREA_SURFACE } from '@/lib/nv-resident-field-surfaces'
import { getGradeButtonStyle } from '@/lib/grading-button-styles'
import { isCaretakerTemplate } from '@/lib/caretaker-template'
import { caretakerRowDisplayLabel, indexToCaretakerRowLetter } from '@/lib/caretaker-yesno-display'
import {
  usesStandardInspectionFormUI,
  questionIsStandardInspectionConditionRow,
  questionIsStandardInspectionIssueRow,
  isEstateInspectionFormTemplate,
} from '@/lib/standard-inspection-form'
import {
  buildEstateInspectionChecklistQuestionIndexMap,
  isEstateInspectionInstructionalQuestion,
} from '@/lib/estate-standard-inspection-template-patch'
import { applyTemplateDisplayPatches } from '@/lib/caretaker-fire-template-patch'
import { getSectionsWithOrderedQuestions } from '@/lib/inspection-template-render-sections'
import { buildEstateInspectionFormSections } from '@/lib/estate-inspection-form-sections'
import CaretakerRoutingBundle from '@/app/components/questions/CaretakerRoutingBundle'
import WizardInspectionQuestion from '@/app/components/wizard/InspectionQuestion'
import IssuesReportSection from '@/app/components/wizard/IssuesReportSection'

/** Minimal design tokens for NV reusable blocks outside the wizard page. */
const NV_INLINE = {
  helperSize: '0.875rem',
  helperColor: '#6b7280',
  primary: '#1E3A8A',
  cardBg: '#fff',
  cardBorder: '1px solid #E5E7EB',
  text: '#111827',
  baseSize: '1rem',
  metaSize: '0.8125rem',
  btnPx: 16,
  font: 'inherit',
  unansweredAmber: '#FEF3C7',
  btnUnselectedBorder: '1px solid #d1d5db',
  btnRadius: 8,
  btnFontWeight: 600,
  btnMinHeight: 48,
  yesColor: '#16A34A',
  noColor: '#DC2626',
  naColor: '#6B7280',
  primaryLight: '#EFF6FF',
  muted: '#6B7280',
  error: '#DC2626',
}

function shouldShowQuestion(question, answers) {
  if (!question.depends_on_question_id) return true
  const depAnswer = answers[question.depends_on_question_id]
  if (depAnswer === undefined || depAnswer === null) return false
  const showWhen = question.show_when_value
  if (typeof showWhen === 'boolean') return depAnswer === showWhen
  if (typeof showWhen === 'string') return String(depAnswer).toLowerCase() === showWhen.toLowerCase()
  return depAnswer === showWhen
}

function normalizeYesNoNaValue(val) {
  if (val == null) return ''
  const s = String(val).toLowerCase().trim()
  if (s === 'yes' || val === true) return 'Yes'
  if (s === 'no' || val === false) return 'No'
  if (s === 'na') return 'NA'
  if (['yes', 'no', 'na'].includes(s)) return s.charAt(0).toUpperCase() + s.slice(1)
  return ''
}

// Match Airtable "Question Type" values that mean Yes/No/NA (e.g. "yes_no", "yes_no,photo", "yesno", "Yes/No")
function normalizeQuestionType(v) {
  if (v == null || v === '') return 'text'
  const raw = String(v).toLowerCase().trim()
  if (raw.includes('yes_no')) return 'yes_no'
  if (/yes\s*[\/\-]?\s*no|yesno|yes\s+no/.test(raw)) return 'yes_no'
  if (raw.includes('yes') && raw.includes('no')) return 'yes_no'
  const s = raw.replace(/[\s\-/]+/g, '_').replace(/_+$/g, '') || 'text'
  return s === 'yesno' ? 'yes_no' : s
}

/** Airtable Question Order / sort_order / order when present; else visible position within the section. */
function estateAirtableQuestionDisplayNumber(question, oneBasedSequentialInSection) {
  const n = Number(question?.sort_order ?? question?.order ?? question?.question_order ?? 0)
  if (Number.isFinite(n) && n > 0) return n
  return oneBasedSequentialInSection
}

function estateAirtableSectionDisplayNumber(section, oneBasedIndexInTemplate) {
  const n = Number(section?.sort_order ?? section?.section_order ?? section?.order ?? 0)
  if (Number.isFinite(n) && n > 0) return n
  return oneBasedIndexInTemplate
}

/** Strip a leading "1. " / "2) " so we do not duplicate the computed section number. */
function stripLeadingOrderedNumber(s) {
  return String(s || '')
    .replace(/^\s*\d+[\.)]\s*/, '')
    .trim()
}

/** Estate: show photo upload only when Airtable marks the question (checkbox, type, or photo-required-when). */
function estateShowsPhotoFromAirtable(question, eq) {
  const e = eq && typeof eq === 'object' ? eq : question
  if (e?.nv_graded_require_comment_photo) return true
  if (question?.type_includes_photo) return true
  const pw = question?.photo_required_when ?? e?.photo_required_when
  if (pw === 'always' || pw === 'on_no' || pw === 'on_yes') return true
  if (question?.require_photo_on_no) return true
  return false
}

function getQuestionType(question) {
  if (question.caretaker_routing_bundle) return 'caretaker_routing_bundle'
  if (question.nv_render_kind) return question.nv_render_kind
  const raw = question.question_type
  const rs = String(raw || '').toLowerCase()
  if (rs.includes('grad')) return 'graded'
  const hasYesNoBehavior =
    (question.comment_required_when === 'on_no' ||
      question.photo_required_when === 'on_no' ||
      question.comment_required_when === 'on_yes' ||
      question.photo_required_when === 'on_yes') &&
    !raw
  return normalizeQuestionType(raw || (hasYesNoBehavior ? 'yes_no' : 'text'))
}

/** Estate checklist body row: force graded control path when Airtable type still resolves as text/long_text/etc. */
function estateEffectiveQuestionForRendering(question, estateInspectionForm, estateChecklistIndex) {
  if (!estateInspectionForm || estateChecklistIndex == null) return question
  const t = getQuestionType(question)
  if (t === 'graded' || t === 'nv_standard') return question
  return {
    ...question,
    question_type: 'graded',
    answer_mode: 'graded',
    grading_options:
      Array.isArray(question.grading_options) && question.grading_options.length
        ? question.grading_options
        : ['A', 'B', 'C', 'D', 'NA'],
    grading_scheme_name: question.grading_scheme_name || 'Croydon NV Grading – Final',
  }
}

function EstateQuestionInstructionBlock({ question }) {
  const text = [question.instructions, question.helper_text].filter((x) => x && String(x).trim()).join('\n\n')
  if (!text) return null
  return (
    <p
      style={{
        marginTop: '0.25rem',
        marginBottom: '0.75rem',
        fontSize: '0.875rem',
        color: '#6b7280',
        whiteSpace: 'pre-wrap',
        lineHeight: 1.5,
      }}
    >
      {text}
    </p>
  )
}

function InspectionQuestion({
  question,
  value,
  onChange,
  error,
  errorComment,
  errorPhotos,
  answerExtras,
  onAnswerExtras,
  createActionOnNo,
  isNvTemplate = false,
  expandedByQuestionId = {},
  peopleOptions = [],
  standardInspectionForm = false,
  caretakerPartLabel = null,
  estateInspectionForm = false,
  estateChecklistIndex,
  estateDisplayNumber,
}) {
  const id = `answer-${question.id}`

  const rawLayoutType = String(question.question_type_raw ?? '').toLowerCase()
  const isExplicitAirtableLayoutRow =
    /instruction|section_header|divider|^info$|^static$|^label$/i.test(rawLayoutType)
  const skipInstructionalBlockForEstateChecklistRow =
    estateInspectionForm && estateChecklistIndex != null && !isExplicitAirtableLayoutRow

  if (isEstateInspectionInstructionalQuestion(question) && !skipInstructionalBlockForEstateChecklistRow) {
    const rawParts = [
      caretakerPartLabel || question.question_text,
      question.resident_wording,
      question.instructions,
      question.helper_text,
    ].filter((p) => p != null && String(p).trim())
    const seen = new Set()
    const unique = []
    for (const p of rawParts) {
      const t = String(p).trim()
      if (seen.has(t)) continue
      seen.add(t)
      unique.push(t)
    }
    return (
      <div
        style={{
          marginBottom: '1rem',
          padding: '0.75rem 1rem',
          backgroundColor: '#f9fafb',
          borderRadius: '0.375rem',
          border: '1px solid #e5e7eb',
        }}
      >
        {unique.map((text, i) => (
          <p
            key={i}
            style={{
              margin: i ? '0.65rem 0 0' : 0,
              fontSize: '0.9375rem',
              color: '#374151',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.55,
            }}
          >
            {estateInspectionForm && estateDisplayNumber != null && i === 0 ? (
              <>
                <span style={{ fontWeight: 700, color: '#111827', marginRight: '0.35rem', fontVariantNumeric: 'tabular-nums' }}>
                  {estateDisplayNumber}.
                </span>
                {text}
              </>
            ) : (
              text
            )}
          </p>
        ))}
      </div>
    )
  }

  const eq = estateEffectiveQuestionForRendering(question, estateInspectionForm, estateChecklistIndex)
  const qType = getQuestionType(eq)
  const estatePhotoAllowed = estateInspectionForm && estateShowsPhotoFromAirtable(question, eq)

  const labelText = caretakerPartLabel || question.question_text
  const displayPrimaryLabel =
    estateInspectionForm && estateDisplayNumber != null ? (
      <>
        <span
          style={{
            fontWeight: 700,
            color: '#111827',
            marginRight: '0.35rem',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {estateDisplayNumber}.
        </span>
        {labelText}
      </>
    ) : (
      labelText
    )
  const nvLabel = isNvTemplate ? getNvQuestionStepLabel(question) : null
  const nvHeading =
    nvLabel != null ? (
      <p
        style={{
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: '#1E3A8A',
          marginBottom: '0.5rem',
          letterSpacing: '0.02em',
        }}
      >
        {nvLabel}
      </p>
    ) : null
  const opts = question.options || []
  const isRequired = question.is_required
  const yesNoNaValue = normalizeYesNoNaValue(value)
  const isNo = yesNoNaValue === 'No'
  const isYes = yesNoNaValue === 'Yes'
  const commentWhen = question.comment_required_when
  const photoWhen = question.photo_required_when
  const typeIncludesPhoto = !!question.type_includes_photo
  const showComment =
    (commentWhen === 'on_no' && isNo) || (commentWhen === 'on_yes' && isYes) || commentWhen === 'always'
  const photoRequired =
    (photoWhen === 'on_no' && isNo) || (photoWhen === 'on_yes' && isYes) || photoWhen === 'always'
  const showActionBlock = qType === 'yes_no' && isNo && createActionOnNo
  const isExpanded = isNvTemplate && !!expandedByQuestionId[question.id]
  const showCommentPhotoBlock = (showComment || showActionBlock) || isExpanded
  const expandedSectionRef = useRef(null)
  const didScrollRef = useRef(false)

  useEffect(() => {
    if (!isNvTemplate || !showCommentPhotoBlock) {
      didScrollRef.current = false
      return
    }
    if (expandedSectionRef.current && !didScrollRef.current) {
      didScrollRef.current = true
      expandedSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isNvTemplate, showCommentPhotoBlock])

  const extras = answerExtras || { comment: '', photo_urls: [] }
  const stdInspection = standardInspectionForm && !isNvTemplate
  const isStdConditionRow = stdInspection && questionIsStandardInspectionConditionRow(eq)
  const isStdIssueRow = stdInspection && questionIsStandardInspectionIssueRow(question)

  const handleChange = (val) => {
    onChange(question.id, val)
    if (qType === 'yes_no' && (val === 'Yes' || val === 'NA') && onAnswerExtras) {
      onAnswerExtras(question.id, { comment: '', photo_urls: [] })
    }
  }

  const setExtras = (updates) => {
    if (onAnswerExtras) onAnswerExtras(question.id, { ...extras, ...updates })
  }

  const photoId = `photo-${question.id}`
  const photoBlock = (
    <div style={{ marginTop: '0.75rem' }}>
      <label htmlFor={photoId} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
        Add photo
        {photoRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
      </label>
      <PhotoUploadControl
        id={photoId}
        value={extras.photo_urls || []}
        onChange={(urls) => setExtras({ photo_urls: urls })}
        required={photoRequired}
        error={errorPhotos}
        label="Add photo"
      />
    </div>
  )

  const buttonGroup = (optionList, firstButtonId) => (
    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
      {(optionList || []).map((opt, idx) => {
        const label = typeof opt === 'string' ? opt : (opt?.label ?? opt?.value ?? opt)
        const val = typeof opt === 'string' ? opt : (opt?.value ?? opt?.label ?? opt)
        const isSelected = value === val || value === label
        return (
          <button
            key={val}
            type="button"
            id={idx === 0 && firstButtonId ? firstButtonId : undefined}
            onClick={() => handleChange(val)}
            style={getGradeButtonStyle(label, isSelected, {
              padding: '12px 16px',
              minHeight: 48,
              fontSize: '0.9375rem',
              borderRadius: '0.375rem',
            })}
          >
            {label}
          </button>
        )
      })}
    </div>
  )

  if (qType === 'caretaker_routing_bundle') {
    return (
      <div style={{ marginBottom: '1rem' }}>
        <CaretakerRoutingBundle
          question={question}
          answerExtras={answerExtras}
          onAnswerExtras={onAnswerExtras}
          errorComment={errorComment}
          errorPhotos={errorPhotos}
          textareaStyle={isNvTemplate ? NV_TEXTAREA_SURFACE : {}}
          peopleOptions={peopleOptions}
        />
      </div>
    )
  }

  if (qType === 'yes_no') {
    return (
      <div style={{ marginBottom: '1rem' }}>
        {nvHeading}
        <label htmlFor={id} style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
          {displayPrimaryLabel}
          {isRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
        </label>
        {estateInspectionForm ? <EstateQuestionInstructionBlock question={question} /> : null}
        <YesNoNaButtons
          id={id}
          value={yesNoNaValue}
          onChange={(val) => handleChange(val)}
        />
        {showCommentPhotoBlock && (
          <div ref={isNvTemplate ? expandedSectionRef : undefined} style={{ marginTop: '1rem', padding: '1rem', background: showActionBlock ? '#fef3c7' : '#f9fafb', borderRadius: '0.375rem', border: `1px solid ${showActionBlock ? '#f59e0b' : '#e5e7eb'}` }}>
            {showActionBlock && (
              <p style={{ fontWeight: 600, marginBottom: '0.75rem', color: '#92400e' }}>
                Action will be created automatically
              </p>
            )}
            {showComment && (
              <>
                <label htmlFor={`comment-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                  {isStdIssueRow
                    ? 'Comment'
                    : `Resident-friendly message (for poster PDF)${commentWhen === 'always' || (commentWhen === 'on_no' && isNo) ? ' ' : ''}`}
                  {(commentWhen === 'always' ||
                    (commentWhen === 'on_no' && isNo) ||
                    (commentWhen === 'on_yes' && isYes)) && <span style={{ color: '#ef4444' }}>*</span>}
                </label>
                <textarea
                  id={`comment-${question.id}`}
                  name={`comment-${question.id}`}
                  value={extras.comment || ''}
                  onChange={(e) => setExtras({ comment: e.target.value })}
                  placeholder="e.g. Please ensure the area is kept clear."
                  rows={2}
                  style={{
                    ...(isNvTemplate ? NV_TEXTAREA_SURFACE : {}),
                    width: '100%',
                    padding: '0.5rem',
                    border: errorComment ? '1px solid #ef4444' : '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    fontFamily: 'inherit',
                    marginBottom: '0.75rem',
                  }}
                />
                {errorComment && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{errorComment}</p>}
                {question.caretaker_recipient_on_yes && isYes && Array.isArray(peopleOptions) && peopleOptions.length > 0 && (
                  <>
                    <label htmlFor={`recipient-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                      Who should this be sent to?
                    </label>
                    <select
                      id={`recipient-${question.id}`}
                      value={extras.recipient_person_id || ''}
                      onChange={(e) => setExtras({ recipient_person_id: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '1rem',
                        backgroundColor: 'white',
                        marginBottom: '0.75rem',
                      }}
                    >
                      <option value="">Select recipient…</option>
                      {peopleOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </>
            )}
            {showActionBlock && question.action_category && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem', fontStyle: 'italic' }}>
                Action category: {question.action_category}
              </p>
            )}
            {isNvTemplate || (question.caretaker_recipient_on_yes && isYes) ? photoBlock : null}
          </div>
        )}
        {!isNvTemplate &&
          (estateInspectionForm
            ? estatePhotoAllowed && photoBlock
            : !question.caretaker_recipient_on_yes && !photoWhen && typeIncludesPhoto && photoBlock)}
        {error && typeof error === 'string' && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
      </div>
    )
  }

  if (qType === 'graded') {
    const gradingOpts = eq.grading_options?.length ? eq.grading_options : ['A', 'B', 'C', 'D', 'NA']
    const needPhoto = !!eq.nv_graded_require_comment_photo
    const needComment = needPhoto || !!eq.nv_graded_require_comment_only
    const hasGrade = value != null && String(value).trim() !== ''
    const showGradedExtras =
      isNvTemplate
        ? needComment && hasGrade
        : isStdConditionRow && needComment
          ? true
          : eq.caretaker_graded_always_extras && needComment && hasGrade
    return (
      <div style={{ marginBottom: '1rem' }}>
        {nvHeading}
        <label htmlFor={id} style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
          {displayPrimaryLabel}
          {eq.grading_scheme_name && (
            <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '0.875rem' }}> ({eq.grading_scheme_name})</span>
          )}
          {isRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
        </label>
        {estateInspectionForm ? <EstateQuestionInstructionBlock question={question} /> : null}
        {buttonGroup(gradingOpts, id)}
        {showGradedExtras && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#f9fafb', borderRadius: '0.375rem', border: '1px solid #e5e7eb' }}>
            <p style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.875rem', color: '#374151' }}>
              {needPhoto ? 'Comment and photo' : 'Comment'}
            </p>
            <label htmlFor={`comment-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
              Comment{' '}
              {isRequired && hasGrade ? <span style={{ color: '#ef4444' }}>*</span> : null}
            </label>
            <textarea
              id={`comment-${question.id}`}
              name={`comment-${question.id}`}
              value={extras.comment || ''}
              onChange={(e) => setExtras({ comment: e.target.value })}
              rows={2}
              style={{
                ...(isNvTemplate ? NV_TEXTAREA_SURFACE : {}),
                width: '100%',
                padding: '0.5rem',
                border: errorComment ? '1px solid #ef4444' : '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
                marginBottom: needPhoto ? '0.75rem' : 0,
              }}
            />
            {errorComment && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{errorComment}</p>}
            {needPhoto && (
              <PhotoUploadControl
                id={`g-photo-${question.id}`}
                value={extras.photo_urls || []}
                onChange={(urls) => setExtras({ photo_urls: urls })}
                label="Add photo"
                error={errorPhotos}
              />
            )}
          </div>
        )}
        {!isNvTemplate &&
          (estateInspectionForm
            ? estatePhotoAllowed && photoBlock
            : !isStdConditionRow && !eq.caretaker_graded_always_extras && photoBlock)}
        {error && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
      </div>
    )
  }

  if (qType === 'select' || qType === 'single_select') {
    const options = opts.map((o) => (typeof o === 'string' ? o : (o.value ?? o.label ?? o))).filter(Boolean)
    return (
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor={id} style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
          {displayPrimaryLabel}
          {isRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
        </label>
        {estateInspectionForm ? <EstateQuestionInstructionBlock question={question} /> : null}
        <select
          id={id}
          name={id}
          value={value ?? ''}
          onChange={(e) => handleChange(e.target.value)}
          style={{
            width: '100%',
            padding: '0.75rem',
            border: error ? '1px solid #ef4444' : '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '1rem',
            backgroundColor: 'white',
          }}
        >
          <option value="">Select...</option>
          {(options.length ? options : ['—']).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        {(!estateInspectionForm || estatePhotoAllowed) && photoBlock}
        {error && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
      </div>
    )
  }

  if (qType === 'rating') {
    const max = 5
    return (
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor={id} style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
          {displayPrimaryLabel}
          {isRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
        </label>
        {estateInspectionForm ? <EstateQuestionInstructionBlock question={question} /> : null}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              id={n === 1 ? id : undefined}
              onClick={() => handleChange(n)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: value === n ? '#3b82f6' : '#f3f4f6',
                color: value === n ? 'white' : '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontWeight: value === n ? 600 : 500,
              }}
            >
              {n}
            </button>
          ))}
        </div>
        {(!estateInspectionForm || estatePhotoAllowed) && photoBlock}
        {error && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
      </div>
    )
  }

  if (qType === 'long_text') {
    return (
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor={id} style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
          {displayPrimaryLabel}
          {isRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
        </label>
        {estateInspectionForm ? <EstateQuestionInstructionBlock question={question} /> : null}
        <textarea
          id={id}
          name={id}
          value={value ?? ''}
          onChange={(e) => handleChange(e.target.value)}
          rows={4}
          style={{
            ...(isNvTemplate ? NV_TEXTAREA_SURFACE : {}),
            width: '100%',
            padding: '0.75rem',
            border: error ? '1px solid #ef4444' : '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '1rem',
            fontFamily: 'inherit',
            minHeight: 100,
          }}
        />
        {(!estateInspectionForm || estatePhotoAllowed) && photoBlock}
        {error && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
      </div>
    )
  }

  if (qType === 'nv_plain_textarea') {
    return (
      <div style={{ marginBottom: '1rem' }}>
        {nvHeading}
        <label htmlFor={id} style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151', fontSize: '1rem', lineHeight: 1.45 }}>
          {labelText}
        </label>
        <textarea
          id={id}
          name={id}
          value={value ?? ''}
          onChange={(e) => onChange(question.id, e.target.value)}
          rows={8}
          style={{
            ...NV_TEXTAREA_SURFACE,
            width: '100%',
            padding: '0.75rem',
            border: error ? '1px solid #ef4444' : '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '1rem',
            fontFamily: 'inherit',
            minHeight: 160,
            lineHeight: 1.45,
          }}
        />
        {error && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
      </div>
    )
  }

  if (qType === 'nv_standard') {
    return (
      <div style={{ marginBottom: '1rem' }}>
        {nvHeading}
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
          {labelText}
          {isRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
        </label>
        <WizardInspectionQuestion
          q={question}
          nv={NV_INLINE}
          gradeValue={value}
          ext={extras}
          btnMinH={NV_INLINE.btnMinHeight}
          maxPhotos={1}
          onSelectGrade={(label) => onChange(question.id, label)}
          onComment={(text) => setExtras({ comment: text })}
          onPhotos={(urls) => setExtras({ photo_urls: urls })}
        />
        {errorComment && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{errorComment}</p>}
        {errorPhotos && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{errorPhotos}</p>}
      </div>
    )
  }

  if (qType === 'nv_issues_report') {
    return (
      <div style={{ marginBottom: '1rem' }}>
        {nvHeading}
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
          {labelText}
        </label>
        <IssuesReportSection
          q={question}
          nv={NV_INLINE}
          ext={extras}
          btnMinH={NV_INLINE.btnMinHeight}
          maxPhotos={3}
          onAnswer={(val) => onChange(question.id, val)}
          onExtras={(updates) => setExtras({ ...extras, ...updates })}
        />
      </div>
    )
  }

  if (qType === 'nv_q24') {
    const rows = Array.isArray(question.nv_q24_instruction_rows) && question.nv_q24_instruction_rows.length
      ? question.nv_q24_instruction_rows
      : NV_Q24_AIRTABLE_ROWS_188_192
    return (
      <div style={{ marginBottom: '1rem' }}>
        {nvHeading}
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
          {labelText}
        </label>
        <ol style={{ margin: '0 0 0.75rem 1rem', fontSize: '0.9375rem', color: '#374151' }}>
          {rows.map((line, i) => (
            <li key={i} style={{ marginBottom: 6 }}>{line}</li>
          ))}
        </ol>
        <label htmlFor={`comment-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
          Anything to add? (optional)
        </label>
        <textarea
          id={`comment-${question.id}`}
          value={extras.comment || ''}
          onChange={(e) => setExtras({ comment: e.target.value })}
          rows={3}
          style={{
            ...NV_TEXTAREA_SURFACE,
            width: '100%',
            padding: '0.75rem',
            border: errorComment ? '1px solid #ef4444' : '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '1rem',
            fontFamily: 'inherit',
          }}
        />
      </div>
    )
  }

  if (qType === 'nv_q25') {
    return (
      <div style={{ marginBottom: '1rem' }}>
        {nvHeading}
        <p style={{ fontWeight: 600, marginBottom: '0.75rem', color: '#374151' }}>Sign-off</p>
        <label htmlFor={`nv25-date-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
          Date of this visit
        </label>
        <input
          id={`nv25-date-${question.id}`}
          type="date"
          value={extras.visit_date || ''}
          onChange={(e) => setExtras({ visit_date: e.target.value })}
          style={{
            ...NV_TEXT_INPUT_SURFACE,
            width: '100%',
            maxWidth: 280,
            padding: '0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '1rem',
            marginBottom: '0.75rem',
          }}
        />
        <label htmlFor={`nv25-name-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
          Name as it should appear on the report
        </label>
        <input
          id={`nv25-name-${question.id}`}
          type="text"
          value={extras.resident_display_name != null ? extras.resident_display_name : ''}
          onChange={(e) => setExtras({ resident_display_name: e.target.value })}
          style={{
            ...NV_TEXT_INPUT_SURFACE,
            width: '100%',
            padding: '0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '1rem',
            marginBottom: '0.75rem',
          }}
        />
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.875rem', color: '#374151', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!extras.nv_signoff_confirmed}
            onChange={(e) => setExtras({ nv_signoff_confirmed: e.target.checked })}
            style={{ marginTop: 3 }}
          />
          <span>I confirm this feedback is accurate to the best of my knowledge.</span>
        </label>
      </div>
    )
  }

  // text and fallback
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label htmlFor={id} style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
        {displayPrimaryLabel}
        {isRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
      </label>
      {estateInspectionForm ? <EstateQuestionInstructionBlock question={question} /> : null}
      <input
        id={id}
        name={id}
        type="text"
        value={value ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        style={{
          width: '100%',
          padding: '0.75rem',
          border: error ? '1px solid #ef4444' : '1px solid #d1d5db',
          borderRadius: '0.375rem',
          fontSize: '1rem',
        }}
      />
      {(!estateInspectionForm || estatePhotoAllowed) && photoBlock}
      {error && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
    </div>
  )
}

export default function NewInspectionForm({ initialEstates = [], initialBlocks = [] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isMobile, setIsMobile] = useState(false)
  const templateFromUrl = String(searchParams?.get('template_id') || '').trim()
  const isTemplateLocked = !!templateFromUrl
  const [apiPayload, setApiPayload] = useState({ templates: [] })
  const estates = Array.isArray(initialEstates) ? initialEstates : []
  const blocks = Array.isArray(initialBlocks) ? initialBlocks : []
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [templateId, setTemplateId] = useState('')
  const [estateId, setEstateId] = useState('')
  const [postgresBlockId, setPostgresBlockId] = useState('')

  const blocksForEstate = useMemo(
    () => blocks.filter((b) => b.estate_id && b.estate_id === estateId),
    [blocks, estateId]
  )

  useEffect(() => {
    if (!postgresBlockId) return
    const stillValid = blocksForEstate.some((b) => b.id === postgresBlockId)
    if (!stillValid) setPostgresBlockId('')
  }, [estateId, postgresBlockId, blocksForEstate])
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [answers, setAnswers] = useState({})
  const [answerExtras, setAnswerExtras] = useState({})
  const [submitError, setSubmitError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationErrors, setValidationErrors] = useState({})
  const [startingWizard, setStartingWizard] = useState(false)
  const [expandedByQuestionId, setExpandedByQuestionId] = useState({})
  const [peopleOptions, setPeopleOptions] = useState([])

  useEffect(() => {
    let cancelled = false
    async function loadPeople() {
      try {
        const res = await fetch('/api/people', { cache: 'no-store', credentials: 'include' })
        if (!res.ok || cancelled) return
        const rows = await res.json()
        if (cancelled || !Array.isArray(rows)) return
        setPeopleOptions(
          rows
            .map((p) => ({
              value: p.id != null ? String(p.id) : '',
              label: p.name ? `${p.name}${p.email ? ` (${p.email})` : ''}` : p.email || String(p.id ?? ''),
            }))
            .filter((x) => x.value && x.label)
        )
      } catch {
        /* ignore */
      }
    }
    loadPeople()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const isNVTemplate = (t) => {
    if (!t) return false
    const key = String(t.template_key ?? '').toLowerCase().trim()
    const name = String(t.name || '').toLowerCase().trim()
    return key === 'nv' || key === 'neighbourhood_voice' || name.includes('neighbourhood voice') || name.includes('neighbourhood voices')
  }

  const startWizard = async () => {
    if (!templateId || !selectedTemplate) return
    if (!estateId || !String(estateId).trim()) {
      setSubmitError('Select an estate before starting the guided inspection.')
      return
    }
    setStartingWizard(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          template_id: templateId,
          draft: true,
          title: selectedTemplate.name || 'Neighbourhood Voice Inspection',
          location: location.trim() || undefined,
          description: description.trim() || undefined,
          estate_id: estateId.trim(),
          block_id: postgresBlockId.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSubmitError(data?.error || data?.details || `Request failed (${res.status})`)
        return
      }
      const inspectionId = data.inspectionId ?? data.id
      if (inspectionId) router.push(`/inspections/${inspectionId}/wizard`)
      else setSubmitError('No inspection ID returned')
    } catch (err) {
      setSubmitError(err?.message || 'Failed to start wizard')
    } finally {
      setStartingWizard(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        let templatesRes = await fetch(`/api/templates?t=${Date.now()}`, {
          credentials: 'include',
          cache: 'no-store',
        })
        // Mobile browsers can hold onto stale cached/API responses after deploy;
        // retry once with a second cache-busted URL before surfacing an error.
        if (!templatesRes.ok) {
          templatesRes = await fetch(`/api/templates?t=${Date.now()}&retry=1`, {
            credentials: 'include',
            cache: 'no-store',
          })
        }

        if (!templatesRes.ok) {
          const body = await templatesRes.json().catch(() => ({}))
          const status = templatesRes.status
          const isAirtableAuth = status === 401 || body?.diagnostics?.airtable_status_code === 401
          if (isAirtableAuth) {
            throw new Error('Template source is returning Airtable 401 via /api/templates. This is a server-side Airtable auth/config error (not phone credentials).')
          }
          throw new Error(
            templatesRes.status === 503 ? 'Airtable not configured' : 'Failed to load templates'
          )
        }

        const templatesData = await templatesRes.json()
        const templateList = templatesData.templates || []
        applyNeighbourhoodVoicePatchesToList(templateList)
        for (const t of templateList) {
          applyTemplateDisplayPatches(t)
        }

        if (!cancelled) {
          setApiPayload(templatesData)
          const list = templatesData.templates || []
          if (list.length > 0) {
            if (templateFromUrl) {
              const hasRequestedTemplate = list.some((t) => t.id === templateFromUrl)
              if (hasRequestedTemplate) setTemplateId(templateFromUrl)
              else if (!templateId) setTemplateId(list[0].id)
            } else if (!templateId) {
              setTemplateId(list[0].id)
            }
          }
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [templateFromUrl])

  const templates = apiPayload.templates || []
  const selectedTemplate = templates.find((t) => t.id === templateId)
  const estateInspectionForm = Boolean(selectedTemplate && isEstateInspectionFormTemplate(selectedTemplate))
  const inspectionRenderSections = useMemo(() => {
    if (!selectedTemplate) return []
    if (isEstateInspectionFormTemplate(selectedTemplate)) {
      return buildEstateInspectionFormSections(selectedTemplate)
    }
    return getSectionsWithOrderedQuestions(selectedTemplate)
  }, [selectedTemplate])
  const estateChecklistIndexByQid = useMemo(
    () =>
      estateInspectionForm && selectedTemplate
        ? buildEstateInspectionChecklistQuestionIndexMap({
            ...selectedTemplate,
            sections: inspectionRenderSections,
          })
        : new Map(),
    [estateInspectionForm, selectedTemplate, inspectionRenderSections]
  )

  const handleAnswer = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
    if (isNVTemplate(selectedTemplate) && value === 'No') {
      setExpandedByQuestionId((prev) => ({ ...prev, [questionId]: true }))
    }
    setValidationErrors((prev) => ({
      ...prev,
      [questionId]: undefined,
      [`${questionId}_comment`]: undefined,
      [`${questionId}_photos`]: undefined,
    }))
  }

  const validate = () => {
    const errs = {}
    if (!estateId || !String(estateId).trim()) errs.estate_id = 'Select an estate'
    if (postgresBlockId) {
      const b = blocksForEstate.find((x) => x.id === postgresBlockId)
      if (!b) errs.block_id = 'Select a block for this estate or choose whole estate'
    }
    if (!templateId) errs.template_id = 'Select a template'
    if (!selectedTemplate) return { ...errs }

    inspectionRenderSections.forEach((sec) => {
      (sec.questions || []).forEach((q) => {
        if (q.nv_hidden) return
        if (!isNeighbourhoodVoiceQuestionRenderable(q)) return
        if (!shouldShowQuestion(q, answers)) return
        const qRawLayout = String(q.question_type_raw ?? '').toLowerCase()
        const qExplicitLayout = /instruction|section_header|divider|^info$|^static$|^label$/i.test(qRawLayout)
        const qIdx = estateChecklistIndexByQid.get(q.id)
        if (
          estateInspectionForm &&
          isEstateInspectionInstructionalQuestion(q) &&
          !(qIdx != null && !qExplicitLayout)
        ) {
          return
        }
        const checklistIdx = qIdx
        const qForType = estateEffectiveQuestionForRendering(q, estateInspectionForm, checklistIdx)
        const qType = getQuestionType(qForType)
        const v = answers[q.id]

        if (qType === 'yes_no') {
          const validValues = ['Yes', 'No', 'NA']
          const normalized = v != null ? String(v).trim() : ''
          if (q.is_required && !validValues.includes(normalized)) {
            errs[q.id] = 'Please select Yes, No, or NA'
          }
          const commentWhen = q.comment_required_when
          const photoWhen = q.photo_required_when
          const isNo = normalized === 'No'
          const isYes = normalized === 'Yes'
          const commentRequired =
            (commentWhen === 'on_no' && isNo) || (commentWhen === 'on_yes' && isYes) || commentWhen === 'always'
          const photoRequired =
            (photoWhen === 'on_no' && isNo) || (photoWhen === 'on_yes' && isYes) || photoWhen === 'always'
          const extras = answerExtras[q.id] || {}
          if (commentRequired && !(extras.comment || '').trim()) {
            errs[`${q.id}_comment`] = 'Comment is required'
          }
          const photoUrls = Array.isArray(extras.photo_urls) ? extras.photo_urls.filter((u) => typeof u === 'string' && u) : []
          if (photoRequired && photoUrls.length === 0) {
            errs[`${q.id}_photos`] = 'At least one photo is required'
          }
          if (q.caretaker_recipient_on_yes && isYes && !(extras.recipient_person_id || '').trim()) {
            errs[`${q.id}_recipient`] = 'Please select a recipient'
          }
          return
        }

        if (qType === 'caretaker_routing_bundle') {
          const ex = answerExtras[q.id] || {}
          const photos = Array.isArray(ex.photo_urls) ? ex.photo_urls.filter((u) => typeof u === 'string' && u) : []
          if (!(ex.recipient_person_id || '').trim()) {
            errs[`${q.id}_recipient`] = 'Recipient is required'
          }
          if (photos.length === 0) {
            errs[`${q.id}_photos`] = 'At least one photo is required for routing'
          }
          return
        }

        if (qType === 'nv_issues_report') {
          const ex = answerExtras[q.id] || {}
          const yn = (x) => String(x || '').trim().toLowerCase() === 'yes'
          if (yn(ex.issues_abandoned_properties) || yn(ex.issues_abandoned_vehicles)) {
            const photoUrls = Array.isArray(ex.photo_urls) ? ex.photo_urls.filter((u) => typeof u === 'string' && u) : []
            if (photoUrls.length === 0) {
              errs[`${q.id}_photos`] = 'Please add at least one photo when you answer Yes'
            }
          }
          return
        }

        if (qType === 'graded' || qType === 'nv_standard') {
          const extras = answerExtras[q.id] || {}
          const isStd = qType === 'nv_standard'
          const photoWhenG = qForType.photo_required_when ?? q.photo_required_when
          const needPhoto =
            isStd ||
            !!qForType.nv_graded_require_comment_photo ||
            (estateInspectionForm && photoWhenG === 'always')
          const needComment = isStd || needPhoto || !!qForType.nv_graded_require_comment_only
          if (!needComment && !isStd) {
            if (q.is_required && (v === undefined || v === null || (typeof v === 'string' && !v.trim()))) {
              errs[q.id] = 'Required'
            }
            return
          }
          const grade = v != null && String(v).trim() !== ''
          if (q.is_required && !grade) {
            errs[q.id] = 'Please select a grade'
            return
          }
          if (grade) {
            if (needComment && !(extras.comment || '').trim()) {
              errs[`${q.id}_comment`] = 'Comment is required'
            }
            if (needPhoto) {
              const photoUrls = Array.isArray(extras.photo_urls) ? extras.photo_urls.filter((u) => typeof u === 'string' && u) : []
              if (photoUrls.length === 0) {
                errs[`${q.id}_photos`] = 'A photo is required'
              }
            }
          }
          return
        }

        if (qType === 'long_text') {
          if (q.is_required && (v === undefined || v === null || !String(v).trim())) {
            errs[q.id] = 'Required'
          }
          return
        }

        if (qType === 'nv_q24') {
          return
        }

        if (qType === 'nv_q25') {
          const ex = answerExtras[q.id] || {}
          if (q.is_required) {
            if (!(ex.visit_date || '').trim() || !(ex.resident_display_name || '').trim()) {
              errs[q.id] = 'Please add the visit date and your display name'
            }
          }
          return
        }

        if (!q.is_required) return
        if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) {
          errs[q.id] = 'Required'
        }
      })
    })
    setValidationErrors(errs)
    return errs
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError(null)
    const errs = validate()
    if (Object.keys(errs).length > 0) return

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          template_id: templateId,
          estate_id: estateId.trim(),
          block_id: postgresBlockId.trim() || undefined,
          location: location.trim() || undefined,
          description: description.trim() || undefined,
          answers,
          answer_extras: answerExtras,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = res.status === 401
          ? 'Please sign in at the top of the page, then try submitting again.'
          : (data.error || data.details || `Request failed (${res.status})`)
        setSubmitError(msg)
        return
      }
      if (data.error) {
        setSubmitError(data.error || data.details || 'Save failed')
        return
      }
      const inspectionId = data.inspectionId ?? data.id
      if (inspectionId) {
        router.push(`/inspections/${inspectionId}`)
      } else {
        setSubmitError('Save reported success but no inspection ID was returned. Check the inspections list.')
      }
    } catch (err) {
      setSubmitError(err.message || 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div>
        <p>Loading templates...</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div>
        <Link href="/" style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '0.875rem' }}>
          ← Back to Inspections
        </Link>
        <div style={{ marginTop: '1rem', padding: '1rem', background: '#fee2e2', color: '#dc2626', borderRadius: '0.5rem' }}>
          {loadError}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <Link
          href="/"
          style={{
            color: '#3b82f6',
            textDecoration: 'none',
            fontSize: '0.875rem',
            display: 'inline-block',
            marginBottom: '1rem',
          }}
        >
          ← Back to Inspections
        </Link>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold' }}>
          New Inspection
        </h1>
        <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
          Choose estate (required), optional block, location note, then complete the form
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          backgroundColor: 'white',
          padding: isMobile ? '1rem' : '2rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          maxWidth: isMobile ? '100%' : '800px',
        }}
      >
        {submitError && (
          <div
            style={{
              padding: '0.75rem',
              marginBottom: '1.5rem',
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
          >
            {submitError}
          </div>
        )}

        <div style={{ marginBottom: '1.5rem' }}>
          <label
            htmlFor="estate_id"
            style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}
          >
            Estate <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select
            id="estate_id"
            name="estate_id"
            value={estateId}
            onChange={(e) => {
              setEstateId(e.target.value)
              setValidationErrors((prev) => ({ ...prev, estate_id: undefined, block_id: undefined }))
            }}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: validationErrors.estate_id ? '1px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
              backgroundColor: 'white',
              minHeight: 44,
            }}
          >
            <option value="">— Select estate —</option>
            {estates.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          {validationErrors.estate_id && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#ef4444' }}>{validationErrors.estate_id}</p>
          )}
          {estates.length === 0 && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
              No estates in Postgres. Add them in Admin before creating an inspection.
            </p>
          )}
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label
            htmlFor="postgres_block_id"
            style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}
          >
            Block (optional)
          </label>
          <select
            id="postgres_block_id"
            name="postgres_block_id"
            value={postgresBlockId}
            onChange={(e) => setPostgresBlockId(e.target.value)}
            disabled={!estateId}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: validationErrors.block_id ? '1px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
              backgroundColor: estateId ? 'white' : '#f3f4f6',
              minHeight: 44,
            }}
          >
            <option value="">Whole estate (no specific block)</option>
            {blocksForEstate.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {validationErrors.block_id && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#ef4444' }}>{validationErrors.block_id}</p>
          )}
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label
            htmlFor="location"
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#374151',
            }}
          >
            Location note (optional)
          </label>
          <input
            type="text"
            id="location"
            name="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Stairwell, entrance, or flat number"
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
            }}
          />
        </div>

        {isTemplateLocked ? (
          <div style={{ marginBottom: '1.5rem', padding: '0.75rem 1rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Template</div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>
              {selectedTemplate
                ? ((selectedTemplate.name || selectedTemplate.template_key || '').trim() || selectedTemplate.id)
                : 'Loading template...'}
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="template_id"
              style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}
            >
              Template <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              id="template_id"
              name="template_id"
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value)
                setAnswers({})
                setAnswerExtras({})
                setValidationErrors((prev) => {
                  const next = { ...prev }
                  delete next.template_id
                  return next
                })
              }}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                border: validationErrors.template_id ? '1px solid #ef4444' : '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '1rem',
                backgroundColor: 'white',
                minHeight: 44,
              }}
            >
              <option value="">— Select template —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {(t.name || t.template_key || '').trim() && !(t.name || t.template_key || '').trim().startsWith('rec')
                    ? (t.name || t.template_key).trim()
                    : `Template ${(t.id || '').slice(0, 12)}…`}
                </option>
              ))}
            </select>
            {validationErrors.template_id && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#ef4444' }}>{validationErrors.template_id}</p>
            )}
          </div>
        )}

        {selectedTemplate && isNVTemplate(selectedTemplate) && (
          <div style={{ marginBottom: '1.5rem', padding: '1.25rem', backgroundColor: '#EFF6FF', border: '1px solid #1D4ED8', borderRadius: '0.5rem' }}>
            <p style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 500, color: '#1E3A8A' }}>Neighbourhood Voice template</p>
            <p style={{ margin: 0, fontSize: '0.9375rem', color: '#374151', marginBottom: '1rem' }}>
              Use the guided wizard for one question at a time, progress bar, autosave, and a clearer review step.
            </p>
            <button
              type="button"
              onClick={startWizard}
              disabled={startingWizard}
              style={{
                padding: '0.75rem 1.25rem',
                backgroundColor: '#1E3A8A',
                color: '#fff',
                border: 'none',
                borderRadius: '0.5rem',
                fontWeight: 600,
                cursor: startingWizard ? 'not-allowed' : 'pointer',
                fontSize: '0.9375rem',
              }}
            >
              {startingWizard ? 'Starting…' : 'Start guided inspection'}
            </button>
          </div>
        )}

        {selectedTemplate && inspectionRenderSections.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', color: '#111827' }}>
              Sections &amp; questions
            </h2>
            {estateInspectionForm ? (
              <p style={{ margin: '-0.5rem 0 1rem', fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.5 }}>
                Sections and questions follow your Airtable template (numbers, titles, and order). Grading is A–D–NA.
                Photo upload appears only on rows where the template marks a photo (e.g. Include Photo checkbox or
                Photo required when).
              </p>
            ) : null}
            {(isNVTemplate(selectedTemplate)
              ? inspectionRenderSections.filter((s) => s.id !== 'nv-sec-remaining')
              : inspectionRenderSections
            ).map((section, sectionIdx) => (
              <div
                key={section.id}
                style={{
                  marginBottom: '2rem',
                  paddingBottom: '1.5rem',
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                  {estateInspectionForm ? (
                    <>
                      <span
                        style={{
                          fontWeight: 700,
                          color: '#111827',
                          marginRight: '0.35rem',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {estateAirtableSectionDisplayNumber(section, sectionIdx + 1)}.
                      </span>
                      {stripLeadingOrderedNumber(section.title || section.name) || 'Section'}
                    </>
                  ) : (
                    section.title
                  )}
                </h3>
                {estateInspectionForm && (section.what_to_look_for || section.help_text) ? (
                  <div
                    style={{
                      marginBottom: '1rem',
                      padding: '0.75rem 1rem',
                      backgroundColor: '#f9fafb',
                      borderRadius: '0.375rem',
                      border: '1px solid #e5e7eb',
                      fontSize: '0.875rem',
                      color: '#4b5563',
                      lineHeight: 1.55,
                    }}
                  >
                    {section.what_to_look_for ? (
                      <>
                        <p style={{ margin: '0 0 0.35rem', fontWeight: 600, color: '#374151' }}>What to look for</p>
                        <p style={{ margin: '0 0 0.75rem', whiteSpace: 'pre-wrap' }}>{section.what_to_look_for}</p>
                      </>
                    ) : null}
                    {section.help_text && section.help_text !== section.what_to_look_for ? (
                      <>
                        <p style={{ margin: '0 0 0.35rem', fontWeight: 600, color: '#374151' }}>
                          {section.what_to_look_for ? 'Additional help' : 'Help'}
                        </p>
                        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{section.help_text}</p>
                      </>
                    ) : null}
                  </div>
                ) : (
                  section.help_text && (
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>{section.help_text}</p>
                  )
                )}
                {(() => {
                  let caretakerRowIdx = 0
                  let estateSectionSeq = 0
                  const rows = (section.questions || []).filter(
                    (q) =>
                      !q.nv_hidden &&
                      isNeighbourhoodVoiceQuestionRenderable(q) &&
                      shouldShowQuestion(q, answers)
                  )
                  return rows.map((q) => {
                    estateSectionSeq += 1
                    const estateDisplayNumber = estateInspectionForm
                      ? estateAirtableQuestionDisplayNumber(q, estateSectionSeq)
                      : null
                    const caretakerPartLabel =
                      isCaretakerTemplate(selectedTemplate) && !isNVTemplate(selectedTemplate)
                        ? caretakerRowDisplayLabel(indexToCaretakerRowLetter(caretakerRowIdx++), q)
                        : null
                    return (
                      <InspectionQuestion
                        key={q.id}
                        question={q}
                        value={answers[q.id]}
                        onChange={handleAnswer}
                        error={validationErrors[q.id]}
                        errorComment={validationErrors[`${q.id}_comment`]}
                        errorPhotos={validationErrors[`${q.id}_photos`]}
                        answerExtras={answerExtras[q.id]}
                        onAnswerExtras={(questionId, extras) => setAnswerExtras((prev) => ({ ...prev, [questionId]: extras }))}
                        createActionOnNo={q.create_action_on_no}
                        isNvTemplate={isNVTemplate(selectedTemplate)}
                        expandedByQuestionId={expandedByQuestionId}
                        peopleOptions={peopleOptions}
                        standardInspectionForm={usesStandardInspectionFormUI(selectedTemplate)}
                        caretakerPartLabel={caretakerPartLabel}
                        estateInspectionForm={estateInspectionForm}
                        estateChecklistIndex={estateChecklistIndexByQid.get(q.id)}
                        estateDisplayNumber={estateDisplayNumber}
                      />
                    )
                  })
                })()}
              </div>
            ))}
          </div>
        )}

        {!isNVTemplate(selectedTemplate) && (
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="description"
              style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}
            >
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Additional notes..."
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '1rem',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Link
            href="/inspections"
            style={{
              padding: '0.75rem 1.5rem',
              minHeight: 44,
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              textDecoration: 'none',
              color: '#374151',
              fontWeight: 500,
              width: isMobile ? '100%' : 'auto',
              textAlign: 'center',
            }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              padding: '0.75rem 1.5rem',
              minHeight: 44,
              backgroundColor: isSubmitting ? '#9ca3af' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              fontWeight: 500,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              width: isMobile ? '100%' : 'auto',
              touchAction: 'manipulation',
            }}
          >
            {isSubmitting ? 'Saving...' : 'Save inspection'}
          </button>
        </div>
      </form>
    </div>
  )
}
