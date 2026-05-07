'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import Link from 'next/link'
import YesNoNaButtons from '@/app/components/questions/YesNoNaButtons'
import PhotoUploadControl from '@/app/components/questions/PhotoUploadControl'
import BestPracticeGuideButton from '@/app/components/BestPracticeGuideButton'
import {
  NV_Q24_AIRTABLE_ROWS_188_192,
  applyNeighbourhoodVoicePatchesToList,
  getNvQuestionStepLabel,
  isNeighbourhoodVoiceQuestionRenderable,
} from '@/lib/neighbourhood-voice-template-patch'
import { NV_TEXTAREA_SURFACE } from '@/lib/nv-resident-field-surfaces'
import { getGradeButtonStyle } from '@/lib/grading-button-styles'
import { isCaretakerTemplate } from '@/lib/caretaker-template'
import { caretakerRowDisplayLabel, indexToCaretakerRowLetter } from '@/lib/caretaker-yesno-display'
import {
  usesStandardInspectionFormUI,
  questionIsStandardInspectionConditionRow,
  questionIsStandardInspectionIssueRow,
  isEstateInspectionFormTemplate,
  isEstateInspectionFormV2Template,
} from '@/lib/standard-inspection-form'
import {
  ESM_GRAFFITI_RECIPIENT_OPTIONS,
  getEsmQuestionRole,
  isEsmInspectionFormTemplate,
} from '@/lib/esm-inspection-form'
import { isGroundsMaintenanceTemplate } from '@/lib/grounds-maintenance-template'
import {
  buildEstateInspectionChecklistQuestionIndexMap,
  isEstateInspectionInstructionalQuestion,
} from '@/lib/estate-standard-inspection-template-patch'
import { applyTemplateDisplayPatches } from '@/lib/caretaker-fire-template-patch'
import { getSectionsWithOrderedQuestions } from '@/lib/inspection-template-render-sections'
import { buildEstateInspectionFormSections } from '@/lib/estate-inspection-form-sections'
import {
  isEstateWalkaboutTemplate,
  ESTATE_WALKABOUT_TEMPLATE_ID,
  buildEstateWalkaboutTemplate,
} from '@/lib/estate-walkabout-template'
import EstateWalkaboutNewInspectionForm from '@/app/components/estate-walkabout/EstateWalkaboutNewInspectionForm'
import InspectionTemplateVersionDebugPanel from '@/app/components/debug/InspectionTemplateVersionDebugPanel'
import { summarizeTemplateSnapshotForDebug, logInspectionTemplateDebug } from '@/lib/template-version-debug'
import CaretakerRoutingBundle from '@/app/components/questions/CaretakerRoutingBundle'
import WizardInspectionQuestion from '@/app/components/wizard/InspectionQuestion'
import IssuesReportSection from '@/app/components/wizard/IssuesReportSection'
import SignOffSection from '@/app/components/wizard/SignOffSection'
import { buildInspectionFormNvTokens } from '@/lib/inspection-form-ui'
import {
  createOfflineDraftId,
  hasInspectionDraftContent,
  readOfflineInspectionDrafts,
  removeOfflineInspectionDraft,
  upsertOfflineInspectionDraft,
} from '@/lib/offline-inspection-drafts'
import { packNvWizardExtras } from '@/lib/nv-notes-pack'

/** Same NV tokens as the inspection wizard — single source in `buildInspectionFormNvTokens`. */
const NV_INLINE = buildInspectionFormNvTokens()

const offlinePanelStyle = {
  maxWidth: 800,
  margin: '0 0 1rem',
  padding: '0.9rem 1rem',
  border: '1px solid #f59e0b',
  borderRadius: '0.5rem',
  background: '#fffbeb',
  color: '#92400e',
}

const smallButtonStyle = {
  padding: '0.45rem 0.7rem',
  border: '1px solid #cbd5e1',
  borderRadius: '0.375rem',
  background: '#fff',
  color: '#1d4ed8',
  fontWeight: 600,
  cursor: 'pointer',
}

const COMMENT_TEXTAREA_SURFACE = {
  backgroundColor: '#F5F0E6',
  color: '#111827',
  colorScheme: 'light',
  borderColor: '#d1d5db',
  boxSizing: 'border-box',
  maxWidth: '100%',
  minWidth: 0,
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

function showRecipientForAnswer(requiredWhen, answerValue) {
  const normalized = normalizeYesNoNaValue(answerValue)
  return (
    requiredWhen === 'always' ||
    (requiredWhen === 'on_yes' && normalized === 'Yes') ||
    (requiredWhen === 'on_no' && normalized === 'No')
  )
}

function parsePhotoAnswer(raw) {
  if (raw == null || raw === '') return []
  if (Array.isArray(raw)) return raw.filter((u) => typeof u === 'string' && u)
  const s = String(raw).trim()
  try {
    const parsed = JSON.parse(s)
    if (Array.isArray(parsed)) return parsed.filter((u) => typeof u === 'string' && u)
  } catch {
    // fall through
  }
  return s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []
}

function stringifyPhotos(urls) {
  const arr = Array.isArray(urls) ? urls.filter((u) => typeof u === 'string' && u) : []
  return arr.length ? JSON.stringify(arr) : ''
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
    .replace(/^\s*\d+[\.)]?\s*/, '')
    .trim()
}

/** Estate: show photo upload only when Airtable marks the question (checkbox, type, or photo-required-when). */
function estateShowsPhotoFromAirtable(question, eq) {
  const e = eq && typeof eq === 'object' ? eq : question
  if (e?.nv_graded_require_comment_photo) return true
  if (question?.include_photo || e?.include_photo) return true
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

function normalizeQuestionTextForMatch(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isEsmLightFittingsCleanlinessQuestion(question) {
  const text = normalizeQuestionTextForMatch(question?.question_text || question?.label)
  return text === 'please confirm the overall rating for cleanliness of light fittings and working condition'
}

function isEsmLightsWorkingConditionQuestion(question) {
  const text = normalizeQuestionTextForMatch(question?.question_text || question?.label)
  return text === 'please confirm the working condition of the lights'
}

function isEsmLiftQuestion(question) {
  const text = normalizeQuestionTextForMatch([
    question?.question_text,
    question?.label,
    question?.resident_wording,
    question?.instructions,
    question?.helper_text,
  ].filter(Boolean).join(' '))
  return /\blifts?\b/.test(text)
}

/** Estate/ESM body row: force graded control path for known display-only overrides. */
function estateEffectiveQuestionForRendering(question, estateInspectionForm, estateChecklistIndex, esmInspectionForm = false) {
  if (!estateInspectionForm && !esmInspectionForm) return question
  const t = getQuestionType(question)
  if (isEsmLightsWorkingConditionQuestion(question)) {
    return {
      ...question,
      question_type: 'graded',
      answer_mode: 'graded',
      grading_options: ['Good', 'Fair', 'Poor'],
      grading_scheme_name: null,
    }
  }
  if (estateChecklistIndex == null) return question
  if (t === 'graded' || t === 'nv_standard') {
    return question
  }
  return {
    ...question,
    question_type: 'graded',
    answer_mode: 'graded',
    grading_options:
      Array.isArray(question.grading_options) && question.grading_options.length
        ? question.grading_options
        : ['A', 'B', 'C', 'D', 'NA'],
    grading_scheme_name: question.grading_scheme_name || 'Croydon NV Grading – Final',
    include_photo: question.include_photo,
    type_includes_photo: question.type_includes_photo,
    photo_required_when: question.photo_required_when,
    require_photo_on_no: question.require_photo_on_no,
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

const CARETAKER_YN_COLORS = {
  Yes: { border: '#15803d', bg: '#dcfce7', selectedBg: '#16a34a', text: '#14532d' },
  No: { border: '#b91c1c', bg: '#fee2e2', selectedBg: '#dc2626', text: '#7f1d1d' },
  NA: { border: '#64748b', bg: '#f1f5f9', selectedBg: '#64748b', text: '#334155' },
}

const ESM_Q4_COST_CODES = [
  'C20395.641620.0000 (South central)',
  'C20400.641620.0000 (North)',
  'C203410.641620.0000 (East)',
]

function hasQuestionPhotos(extras) {
  return Array.isArray(extras?.photo_urls) && extras.photo_urls.some((u) => typeof u === 'string' && u.trim())
}

function hasEsmIdCardPhotos(extras) {
  return Array.isArray(extras?.id_card_photo_urls) && extras.id_card_photo_urls.some((u) => typeof u === 'string' && u.trim())
}

function normalizeOptionObjects(rawOptions) {
  const source = Array.isArray(rawOptions)
    ? rawOptions
    : rawOptions == null || rawOptions === ''
      ? []
      : String(rawOptions).split(/\r?\n|,/)
  const seen = new Set()
  return source
    .map((opt) => {
      const value = typeof opt === 'string' ? opt : opt?.value ?? opt?.id ?? opt?.email ?? opt?.label ?? ''
      const label = typeof opt === 'string' ? opt : opt?.label ?? opt?.name ?? opt?.email ?? opt?.value ?? opt?.id ?? ''
      return {
        value: String(value || '').trim(),
        label: String(label || '').trim(),
      }
    })
    .filter((opt) => {
      if (!opt.value || !opt.label || seen.has(opt.value)) return false
      seen.add(opt.value)
      return true
    })
}

function getCaretakerFixedEmailDestination(question) {
  const category = String(question?.action_category || question?.category || '').toLowerCase()
  if (category === 'asb') return 'Tenancy.Service@croydon.gov.uk'
  if (category === 'fire_safety') return 'simon.roice@croydon.gov.uk'
  if (category === 'repairs') return 'internalhousingrepairs@croydon.gov.uk'
  return ''
}

function CaretakerYesNoButtons({ id, value, onChange, mobileStacked = false }) {
  const selected = value === 'Yes' || value === 'No' || value === 'NA' ? value : ''
  return (
    <div style={{ display: 'flex', gap: mobileStacked ? 10 : 8, flexWrap: 'wrap', width: '100%' }}>
      {['Yes', 'No', 'NA'].map((label, idx) => {
        const sel = selected === label
        const colors = CARETAKER_YN_COLORS[label]
        return (
          <button
            key={label}
            type="button"
            id={idx === 0 && id ? id : undefined}
            onClick={() => onChange(label)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: sel ? `2px solid ${colors.border}` : `1px solid ${colors.border}`,
              background: sel ? colors.selectedBg : colors.bg,
              color: sel ? '#fff' : colors.text,
              fontWeight: 700,
              boxShadow: sel ? `0 0 0 3px ${colors.bg}` : 'none',
              minHeight: mobileStacked ? 50 : 42,
              minWidth: mobileStacked ? 86 : 58,
              flex: mobileStacked ? '1 1 86px' : undefined,
              fontSize: mobileStacked ? '1rem' : undefined,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function InspectionQuestion({
  question,
  value,
  onChange,
  error,
  errorComment,
  errorPhotos,
  errorRecipient,
  errorAuthorisation,
  errorCostCode,
  answerExtras,
  onAnswerExtras,
  createActionOnNo,
  isNvTemplate = false,
  expandedByQuestionId = {},
  peopleOptions = [],
  standardInspectionForm = false,
  caretakerPartLabel = null,
  caretakerTemplate = false,
  estateInspectionForm = false,
  esmInspectionForm = false,
  estateChecklistIndex,
  estateDisplayNumber,
  mobileStackedForm = false,
  lightCommentTextarea = false,
}) {
  const [estateApiCostCodes, setEstateApiCostCodes] = useState([])
  const expandedSectionRef = useRef(null)
  const didScrollRef = useRef(false)
  const rawCostBlob = `${question.question_text || ''} ${question.label || ''}`.toLowerCase()
  const estateCostCodeSelectNeedsApi =
    estateInspectionForm &&
    (() => {
      const qt = getQuestionType(question)
      if (qt !== 'select' && qt !== 'single_select') return false
      if ((question.options || []).length > 0) return false
      return (
        rawCostBlob.includes('cost code') ||
        rawCostBlob.includes('costcode') ||
        rawCostBlob.includes('cost_code')
      )
    })()

  useEffect(() => {
    if (!estateCostCodeSelectNeedsApi) {
      setEstateApiCostCodes([])
      return undefined
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/cost-codes', { cache: 'no-store', credentials: 'include' })
        if (!res.ok || cancelled) return
        const rows = await res.json()
        if (!Array.isArray(rows) || cancelled) return
        setEstateApiCostCodes(
          rows
            .map((c) => ({
              value: c.code,
              label: c.description ? `${c.code} - ${c.description}` : String(c.code),
            }))
            .filter((x) => x.value)
        )
      } catch {
        if (!cancelled) setEstateApiCostCodes([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [estateCostCodeSelectNeedsApi, question.id])

  const id = `answer-${question.id}`

  const rawLayoutType = String(question.question_type_raw ?? '').toLowerCase()
  const isExplicitAirtableLayoutRow =
    /instruction|section_header|divider|^info$|^static$|^label$/i.test(rawLayoutType)
  const skipInstructionalBlockForEstateChecklistRow =
    estateInspectionForm && estateChecklistIndex != null && !isExplicitAirtableLayoutRow

  const eq = estateEffectiveQuestionForRendering(question, estateInspectionForm, estateChecklistIndex, esmInspectionForm)
  const qType = getQuestionType(eq)
  const estatePhotoAllowed = estateInspectionForm && estateShowsPhotoFromAirtable(question, eq)

  const esmDisplayQuestionText =
    (estateInspectionForm || esmInspectionForm) && isEsmLightFittingsCleanlinessQuestion(question)
      ? 'Please confirm the overall rating for cleanliness of light fittings'
      : question.question_text
  const labelText = caretakerPartLabel || esmDisplayQuestionText
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
  const opts = Array.isArray(question.options) ? question.options : normalizeOptionObjects(question.options)
  const isRequired = question.is_required
  const yesNoNaValue = normalizeYesNoNaValue(value)
  const isNo = yesNoNaValue === 'No'
  const isYes = yesNoNaValue === 'Yes'
  const extras = answerExtras && typeof answerExtras === 'object' ? answerExtras : { comment: '', photo_urls: [] }
  const commentWhen = question.comment_required_when
  const photoWhen = question.photo_required_when
  const typeIncludesPhoto = !!question.type_includes_photo
  const caretakerAlwaysPhoto =
    caretakerTemplate &&
    qType !== 'photo' &&
    !question.caretaker_routing_bundle &&
    question.caretaker_photo_always !== false
  const caretakerSimplePhotoCapture = caretakerTemplate && question.caretaker_simple_photo_capture === true
  const caretakerPhotosAdded = caretakerAlwaysPhoto && hasQuestionPhotos(extras)
  const caretakerShowCommentFromPhoto = caretakerPhotosAdded && question.caretaker_comment_on_photo !== false
  const caretakerShowCommentOnYes = caretakerTemplate && question.caretaker_comment_on_yes && isYes
  const caretakerShowPhotoOnYes = caretakerTemplate && question.caretaker_photo_on_yes && isYes
  const esmInspectionQuestion = estateInspectionForm || esmInspectionForm
  const esmRole = esmInspectionQuestion ? getEsmQuestionRole(question) : ''
  const esmLiftPhotoComment = esmInspectionQuestion && isEsmLiftQuestion(question) && hasQuestionPhotos(extras)
  const esmCommentAlways = esmInspectionQuestion && question.esm_comment_always === true && !estatePhotoAllowed
  const esmCommentOnPhoto = esmInspectionQuestion && question.esm_comment_on_photo === true && hasQuestionPhotos(extras)
  const esmShowComment = esmCommentAlways || esmCommentOnPhoto || esmLiftPhotoComment
  const esmRecipientOptions = normalizeOptionObjects(
    Array.isArray(question.esm_recipient_options) && question.esm_recipient_options.length
      ? question.esm_recipient_options
      : Array.isArray(question.caretaker_recipient_options) && question.caretaker_recipient_options.length
        ? question.caretaker_recipient_options
        : esmRole === 'graffiti_removal'
          ? ESM_GRAFFITI_RECIPIENT_OPTIONS
          : []
  )
  const esmShowRecipientDropdown =
    esmInspectionQuestion && question.esm_recipient_on_yes === true && isYes && esmRecipientOptions.length > 0
  const esmMissingEmailWarning = esmInspectionQuestion && isYes ? String(question.esm_missing_email_warning || '') : ''
  const caretakerShowCommentWithPhotoUpload =
    caretakerAlwaysPhoto && !caretakerSimplePhotoCapture && question.caretaker_comment_on_photo === true
  const showCaretakerPhotoCommentUnderUpload =
    caretakerShowCommentWithPhotoUpload ||
    (caretakerShowCommentFromPhoto && !caretakerShowCommentOnYes) ||
    (caretakerShowCommentOnYes && caretakerShowPhotoOnYes)
  const caretakerRecipientOptions = normalizeOptionObjects(
    Array.isArray(question.caretaker_recipient_options) && question.caretaker_recipient_options.length
      ? question.caretaker_recipient_options
      : peopleOptions
  )
  const showComment =
    !esmInspectionQuestion &&
    ((commentWhen === 'on_no' && isNo) ||
      (commentWhen === 'on_yes' && isYes) ||
      commentWhen === 'always' ||
      (caretakerShowCommentFromPhoto && !showCaretakerPhotoCommentUnderUpload) ||
      (caretakerShowCommentOnYes && !showCaretakerPhotoCommentUnderUpload))
  const photoRequired =
    (photoWhen === 'on_no' && isNo) || (photoWhen === 'on_yes' && isYes) || photoWhen === 'always'
  const caretakerYesTriggersFollowUp = caretakerTemplate && question.caretaker_recipient_on_yes
  const actionRecipientWhen = question.action_recipient_required_when
  const showActionRecipient =
    !question.esm_recipient_on_yes &&
    ((actionRecipientWhen === 'on_yes' && isYes) ||
      (actionRecipientWhen === 'on_no' && isNo) ||
      actionRecipientWhen === 'always' ||
      (question.caretaker_recipient_always && Array.isArray(question.caretaker_recipient_options)))
  const showCaretakerRecipientDropdown =
    ((question.caretaker_recipient_on_yes && isYes) || showActionRecipient) && caretakerRecipientOptions.length > 0
  const esmQ4AbandonedVehicle = esmInspectionQuestion && question.esm_q4_abandoned_vehicle === true
  const esmShowPhotoComment = esmInspectionQuestion && qType !== 'photo' && !esmQ4AbandonedVehicle
  const esmPhotoAllowed = esmShowPhotoComment && (estatePhotoAllowed || question.include_photo || question.type_includes_photo)
  const esmUseDedicatedFollowUp =
    esmInspectionQuestion &&
    qType === 'yes_no' &&
    isYes &&
    !esmQ4AbandonedVehicle &&
    (esmPhotoAllowed || esmShowRecipientDropdown || Boolean(esmMissingEmailWarning) || esmRole)
  const caretakerYesCreatesAction =
    caretakerTemplate &&
    isYes &&
    (question.action_trigger_on === 'yes' || question.issue_triggers_on === 'yes') &&
    question.create_action_on_yes !== false
  const showActionBlock =
    qType === 'yes_no' &&
    !esmQ4AbandonedVehicle &&
    ((isNo && createActionOnNo) ||
      showActionRecipient ||
      (caretakerYesTriggersFollowUp && isYes && question.create_action_on_yes !== false) ||
      caretakerYesCreatesAction)
  const caretakerFixedEmailDestination =
    caretakerTemplate && isYes && showActionBlock ? getCaretakerFixedEmailDestination(question) : ''
  const isExpanded = isNvTemplate && !!expandedByQuestionId[question.id]
  const showCommentPhotoBlock =
    !esmUseDedicatedFollowUp &&
    (showComment ||
      showActionBlock ||
      (caretakerAlwaysPhoto && !caretakerSimplePhotoCapture) ||
      caretakerShowPhotoOnYes ||
      esmShowRecipientDropdown ||
      Boolean(esmMissingEmailWarning) ||
      isExpanded)
  const showPhotoInYesNoFollowUp =
    !isNvTemplate ||
    photoRequired ||
    (question.caretaker_recipient_on_yes && isYes) ||
    !!extras.raise_issue ||
    caretakerAlwaysPhoto ||
    caretakerShowPhotoOnYes
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

  const stdInspection = standardInspectionForm && !isNvTemplate
  const isStdConditionRow = stdInspection && questionIsStandardInspectionConditionRow(eq)
  const isStdIssueRow = stdInspection && questionIsStandardInspectionIssueRow(question)
  const textareaSurface = isNvTemplate
    ? NV_TEXTAREA_SURFACE
    : lightCommentTextarea
      ? COMMENT_TEXTAREA_SURFACE
      : {}
  const commentTextareaClassName = !isNvTemplate && lightCommentTextarea ? 'inspection-comment-textarea' : undefined
  const questionWrapStyle = {
    marginBottom: mobileStackedForm ? '1.15rem' : '1rem',
    width: '100%',
    boxSizing: 'border-box',
  }
  const followUpStyle = {
    marginTop: '1rem',
    padding: mobileStackedForm ? '1rem' : '1rem',
    background: showActionBlock ? '#fef3c7' : '#f9fafb',
    borderRadius: mobileStackedForm ? '0.5rem' : '0.375rem',
    border: `1px solid ${showActionBlock ? '#f59e0b' : '#e5e7eb'}`,
    width: '100%',
    boxSizing: 'border-box',
  }

  const handleChange = (val) => {
    onChange(question.id, val)
    if (qType === 'yes_no' && onAnswerExtras) {
      if (esmQ4AbandonedVehicle && (val === 'No' || val === 'NA')) {
        onAnswerExtras(question.id, {
          comment: '',
          photo_urls: [],
          id_card_photo_urls: [],
          authorisation_text: '',
          cost_code: '',
        })
      } else if (question.esm_recipient_on_yes && (val === 'No' || val === 'NA')) {
        onAnswerExtras(question.id, { recipient_person_id: '' })
      } else if (actionRecipientWhen && !showRecipientForAnswer(actionRecipientWhen, val)) {
        onAnswerExtras(question.id, { comment: '', photo_urls: [], recipient_person_id: '' })
      } else if (caretakerYesTriggersFollowUp && (val === 'No' || val === 'NA')) {
        onAnswerExtras(question.id, { comment: '', photo_urls: [], recipient_person_id: '' })
      } else if (commentWhen === 'on_yes' && (val === 'No' || val === 'NA')) {
        onAnswerExtras(question.id, { comment: '', photo_urls: [] })
      } else if (!caretakerYesTriggersFollowUp && (val === 'Yes' || val === 'NA')) {
        onAnswerExtras(question.id, { comment: '', photo_urls: [] })
      }
    }
  }

  const setExtras = (updates) => {
    if (onAnswerExtras) onAnswerExtras(question.id, { ...extras, ...updates })
  }

  const photoId = `photo-${question.id}`
  const photoBlock = (
    <div style={{ marginTop: '0.75rem' }}>
      <PhotoUploadControl
        id={photoId}
        value={Array.isArray(extras.photo_urls) ? extras.photo_urls : []}
        onChange={(urls) => setExtras({ photo_urls: urls })}
        required={photoRequired}
        error={errorPhotos}
        label={photoRequired ? 'Add photo *' : 'Add photo'}
        mobileStacked={mobileStackedForm}
      />
      {showCaretakerPhotoCommentUnderUpload && (
        <div style={{ marginTop: '0.75rem' }}>
          <label htmlFor={`comment-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
            {caretakerShowCommentOnYes ? 'Comment' : 'Comment (optional)'}
            {caretakerShowCommentOnYes && <span style={{ color: '#ef4444' }}>*</span>}
          </label>
          <textarea
            className={commentTextareaClassName}
            id={`comment-${question.id}`}
            name={`comment-${question.id}`}
            value={extras.comment || ''}
            onChange={(e) => setExtras({ comment: e.target.value })}
            placeholder={caretakerShowCommentOnYes ? 'Add details for the action' : 'Add a comment for this photo'}
            rows={2}
            style={{
              ...textareaSurface,
              width: '100%',
              padding: mobileStackedForm ? '0.75rem' : '0.5rem',
              border: errorComment ? '1px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: mobileStackedForm ? '1rem' : '0.875rem',
              fontFamily: 'inherit',
              minHeight: mobileStackedForm ? 96 : undefined,
              boxSizing: 'border-box',
            }}
          />
          {errorComment && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{errorComment}</p>}
        </div>
      )}
    </div>
  )
  const esmAbandonedVehiclePhotoBlock = (
    <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.75rem' }}>
      <div>
        <label htmlFor={`vehicle-photo-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
          Vehicle/issue photo <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>
        </label>
        <PhotoUploadControl
          id={`vehicle-photo-${question.id}`}
          value={Array.isArray(extras.photo_urls) ? extras.photo_urls : []}
          onChange={(urls) => setExtras({ photo_urls: urls })}
          required
          error={errorPhotos}
          label="Add vehicle/issue photo"
          multiple={false}
          mobileStacked={mobileStackedForm}
        />
      </div>
      <div>
        <label htmlFor={`id-card-photo-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
          ID badge photo <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>
        </label>
        <PhotoUploadControl
          id={`id-card-photo-${question.id}`}
          value={Array.isArray(extras.id_card_photo_urls) ? extras.id_card_photo_urls : []}
          onChange={(urls) => setExtras({ id_card_photo_urls: urls })}
          required
          error={errorPhotos && !hasEsmIdCardPhotos(extras) ? errorPhotos : undefined}
          label="Add ID badge photo"
          multiple={false}
          mobileStacked={mobileStackedForm}
        />
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>
          ID badge photo
        </p>
      </div>
    </div>
  )
  const simplePhotoBlock = (
    <div style={{ marginTop: '0.75rem' }}>
      <PhotoUploadControl
        id={photoId}
        value={Array.isArray(extras.photo_urls) ? extras.photo_urls : []}
        onChange={(urls) => setExtras({ photo_urls: urls })}
        error={errorPhotos}
        label="Add photo"
        mobileStacked={mobileStackedForm}
      />
      {caretakerShowCommentFromPhoto && (
        <div style={{ marginTop: '0.75rem' }}>
          <label htmlFor={`comment-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
            Comment (optional)
          </label>
          <textarea
            className={commentTextareaClassName}
            id={`comment-${question.id}`}
            name={`comment-${question.id}`}
            value={extras.comment || ''}
            onChange={(e) => setExtras({ comment: e.target.value })}
            placeholder="Add a comment for this photo"
            rows={2}
            style={{
              ...textareaSurface,
              width: '100%',
              padding: mobileStackedForm ? '0.75rem' : '0.5rem',
              border: errorComment ? '1px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: mobileStackedForm ? '1rem' : '0.875rem',
              fontFamily: 'inherit',
              minHeight: mobileStackedForm ? 96 : undefined,
              boxSizing: 'border-box',
            }}
          />
          {errorComment && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{errorComment}</p>}
        </div>
      )}
    </div>
  )
  const esmCommentBlock = esmShowComment ? (
    <div style={{ marginTop: '0.75rem' }}>
      <label htmlFor={`comment-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
        {question.esm_comment_label || 'Comment'}
      </label>
      {question.esm_comment_helper ? (
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', color: '#6b7280' }}>
          {question.esm_comment_helper}
        </p>
      ) : null}
      <textarea
        className={commentTextareaClassName}
        id={`comment-${question.id}`}
        name={`comment-${question.id}`}
        value={extras.comment || ''}
        onChange={(e) => setExtras({ comment: e.target.value })}
        rows={2}
        style={{
          ...textareaSurface,
          width: '100%',
          padding: mobileStackedForm ? '0.75rem' : '0.5rem',
          border: errorComment ? '1px solid #ef4444' : '1px solid #d1d5db',
          borderRadius: '0.375rem',
          fontSize: mobileStackedForm ? '1rem' : '0.875rem',
          fontFamily: 'inherit',
          minHeight: mobileStackedForm ? 96 : undefined,
          boxSizing: 'border-box',
        }}
      />
      {errorComment && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{errorComment}</p>}
    </div>
  ) : null
  const esmPhotoCommentBlock = esmShowPhotoComment ? (
    <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.75rem' }}>
      {esmPhotoAllowed ? photoBlock : null}
      {esmShowComment ? esmCommentBlock : null}
    </div>
  ) : null

  const buttonGroup = (optionList, firstButtonId) => (
    <div style={{ display: 'flex', gap: mobileStackedForm ? 10 : '10px', flexWrap: 'wrap', width: '100%' }}>
      {(optionList || []).map((opt, idx) => {
        const label = typeof opt === 'string' ? opt : (opt?.label ?? opt?.value ?? opt)
        const val = typeof opt === 'string' ? opt : (opt?.value ?? opt?.label ?? opt)
        const isSelected = value === val || value === label
        return (
          <button
            key={`${val || label}-${idx}`}
            type="button"
            id={idx === 0 && firstButtonId ? firstButtonId : undefined}
            onClick={() => handleChange(val)}
            style={getGradeButtonStyle(label, isSelected, {
              padding: mobileStackedForm ? '12px 14px' : '12px 16px',
              minHeight: mobileStackedForm ? 50 : 48,
              minWidth: mobileStackedForm ? 64 : undefined,
              flex: mobileStackedForm ? '1 1 64px' : undefined,
              fontSize: mobileStackedForm ? '1rem' : '0.9375rem',
              borderRadius: mobileStackedForm ? '0.5rem' : '0.375rem',
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
      <div style={questionWrapStyle}>
        <CaretakerRoutingBundle
          question={question}
          answerExtras={answerExtras}
          onAnswerExtras={onAnswerExtras}
          errorComment={errorComment}
          errorPhotos={errorPhotos}
          textareaStyle={textareaSurface}
          textareaClassName={commentTextareaClassName}
          peopleOptions={peopleOptions}
          mobileStacked={mobileStackedForm}
        />
      </div>
    )
  }

  if (qType === 'yes_no') {
    return (
      <div style={questionWrapStyle}>
        {nvHeading}
        <label htmlFor={id} style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
          {displayPrimaryLabel}
          {isRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
        </label>
        {esmInspectionQuestion ? <EstateQuestionInstructionBlock question={question} /> : null}
        {caretakerTemplate ? (
          <CaretakerYesNoButtons id={id} value={yesNoNaValue} onChange={(val) => handleChange(val)} mobileStacked={mobileStackedForm} />
        ) : (
          <YesNoNaButtons
            id={id}
            value={yesNoNaValue}
            onChange={(val) => handleChange(val)}
            mobileStacked={mobileStackedForm}
          />
        )}
        {esmQ4AbandonedVehicle && isYes && (
          <div style={{ ...followUpStyle, background: '#f9fafb', borderColor: '#e5e7eb' }}>
            <p style={{ fontWeight: 600, marginBottom: '0.75rem', color: '#374151' }}>
              Action will be created automatically
            </p>
            {esmAbandonedVehiclePhotoBlock}
            {errorPhotos && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{errorPhotos}</p>}
            <label htmlFor={`authorisation-${question.id}`} style={{ display: 'block', marginTop: '0.75rem', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
              I hereby give authorisation…
            </label>
            <textarea
              className={commentTextareaClassName}
              id={`authorisation-${question.id}`}
              value={extras.authorisation_text || ''}
              onChange={(e) => setExtras({ authorisation_text: e.target.value })}
              rows={3}
              placeholder="I hereby give authorisation to AVS for the removal of the following vehicle(s): colour, make/model, registration"
              style={{
                ...textareaSurface,
                width: '100%',
                padding: mobileStackedForm ? '0.75rem' : '0.5rem',
                border: errorAuthorisation ? '1px solid #ef4444' : '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: mobileStackedForm ? '1rem' : '0.875rem',
                fontFamily: 'inherit',
                marginBottom: '0.75rem',
                minHeight: mobileStackedForm ? 96 : undefined,
                boxSizing: 'border-box',
              }}
            />
            {errorAuthorisation && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{errorAuthorisation}</p>}
            <label htmlFor={`comment-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
              Comment/location
            </label>
            <textarea
              className={commentTextareaClassName}
              id={`comment-${question.id}`}
              value={extras.comment || ''}
              onChange={(e) => setExtras({ comment: e.target.value })}
              rows={3}
              placeholder="Location, door number, access codes, or other details"
              style={{
                ...textareaSurface,
                width: '100%',
                padding: mobileStackedForm ? '0.75rem' : '0.5rem',
                border: errorComment ? '1px solid #ef4444' : '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: mobileStackedForm ? '1rem' : '0.875rem',
                fontFamily: 'inherit',
                marginBottom: '0.75rem',
                minHeight: mobileStackedForm ? 96 : undefined,
                boxSizing: 'border-box',
              }}
            />
            {errorComment && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{errorComment}</p>}
            <label htmlFor={`cost-code-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
              Cost code
            </label>
            <select
              id={`cost-code-${question.id}`}
              value={extras.cost_code || ''}
              onChange={(e) => setExtras({ cost_code: e.target.value })}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: errorCostCode ? '1px solid #ef4444' : '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '1rem',
                backgroundColor: 'white',
                marginBottom: '0.75rem',
                minHeight: mobileStackedForm ? 48 : undefined,
                boxSizing: 'border-box',
              }}
            >
              <option value="">Select cost code…</option>
              {ESM_Q4_COST_CODES.map((costCode) => (
                <option key={costCode} value={costCode}>
                  {costCode}
                </option>
              ))}
            </select>
            {errorCostCode && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{errorCostCode}</p>}
          </div>
        )}
        {esmUseDedicatedFollowUp && (
          <div style={{ ...followUpStyle, background: '#f9fafb', borderColor: '#e5e7eb', display: 'grid', gap: '0.75rem' }}>
            {(question.esm_email_on_yes || question.triggers_email || question.esm_recipient_on_yes) ? (
              <p style={{ fontWeight: 600, margin: 0, color: '#374151' }}>
                Action will be created automatically
              </p>
            ) : null}
            {esmPhotoCommentBlock}
            {esmShowRecipientDropdown && (
              <div>
                <label htmlFor={`esm-recipient-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                  Email recipient <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  id={`esm-recipient-${question.id}`}
                  value={extras.recipient_person_id || ''}
                  onChange={(e) => setExtras({ recipient_person_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: errorRecipient ? '1px solid #ef4444' : '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '1rem',
                    backgroundColor: 'white',
                    minHeight: mobileStackedForm ? 48 : undefined,
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Select recipient…</option>
                  {esmRecipientOptions.map((opt) => (
                    <option key={`esm-dedicated-recipient-${question.id}-${opt.value}`} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {errorRecipient && <p style={{ margin: '0.35rem 0 0', fontSize: '0.875rem', color: '#ef4444' }}>{errorRecipient}</p>}
              </div>
            )}
            {esmMissingEmailWarning ? (
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#b45309' }}>
                {esmMissingEmailWarning}
              </p>
            ) : null}
          </div>
        )}
        {showCommentPhotoBlock && (
          <div ref={isNvTemplate ? expandedSectionRef : undefined} style={followUpStyle}>
            {showActionBlock && (
              <div style={{ marginBottom: '0.75rem' }}>
                <p style={{ fontWeight: 600, margin: 0, color: '#92400e' }}>
                  Action will be created automatically
                </p>
                {caretakerFixedEmailDestination ? (
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.875rem', color: '#92400e' }}>
                    Email notification will be sent on submission to {caretakerFixedEmailDestination}
                  </p>
                ) : null}
              </div>
            )}
            {showComment && (
              <>
                <label htmlFor={`comment-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                  {caretakerYesTriggersFollowUp
                    ? 'Comment'
                    : question.esm_comment_label || esmCommentAlways || esmCommentOnPhoto
                    ? question.esm_comment_label || 'Comment'
                    : caretakerShowCommentFromPhoto || caretakerShowCommentOnYes
                    ? 'Comment (optional)'
                    : isStdIssueRow
                    ? 'Comment'
                    : `Resident-friendly message (for poster PDF)${commentWhen === 'always' || (commentWhen === 'on_no' && isNo) ? ' ' : ''}`}
                  {(commentWhen === 'always' ||
                    (commentWhen === 'on_no' && isNo) ||
                    (commentWhen === 'on_yes' && isYes)) && <span style={{ color: '#ef4444' }}>*</span>}
                </label>
                <textarea
                  className={commentTextareaClassName}
                  id={`comment-${question.id}`}
                  name={`comment-${question.id}`}
                  value={extras.comment || ''}
                  onChange={(e) => setExtras({ comment: e.target.value })}
                  placeholder={
                    question.esm_comment_helper ||
                    (caretakerYesTriggersFollowUp ? 'Add details for the action' : 'e.g. Please ensure the area is kept clear.')
                  }
                  rows={2}
                  style={{
                    ...textareaSurface,
                    width: '100%',
                    padding: mobileStackedForm ? '0.75rem' : '0.5rem',
                    border: errorComment ? '1px solid #ef4444' : '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: mobileStackedForm ? '1rem' : '0.875rem',
                    fontFamily: 'inherit',
                    marginBottom: '0.75rem',
                    minHeight: mobileStackedForm ? 96 : undefined,
                    boxSizing: 'border-box',
                  }}
                />
                {errorComment && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{errorComment}</p>}
                {showCaretakerRecipientDropdown && (
                  <>
                    <label htmlFor={`recipient-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                      Who does this need to go to <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <select
                      id={`recipient-${question.id}`}
                      value={extras.recipient_person_id || ''}
                      onChange={(e) => setExtras({ recipient_person_id: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: errorRecipient ? '1px solid #ef4444' : '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '1rem',
                        backgroundColor: 'white',
                        marginBottom: '0.75rem',
                        minHeight: mobileStackedForm ? 48 : undefined,
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="">Select recipient…</option>
                      {caretakerRecipientOptions.map((opt) => (
                        <option key={`recipient-${question.id}-${opt.value}`} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {errorRecipient && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{errorRecipient}</p>}
                  </>
                )}
              </>
            )}
            {showActionBlock && question.action_category && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem', fontStyle: 'italic' }}>
                Action category: {question.action_category}
              </p>
            )}
            {esmShowRecipientDropdown && (
              <>
                <label htmlFor={`esm-recipient-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                  Email recipient <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  id={`esm-recipient-${question.id}`}
                  value={extras.recipient_person_id || ''}
                  onChange={(e) => setExtras({ recipient_person_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: errorRecipient ? '1px solid #ef4444' : '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '1rem',
                    backgroundColor: 'white',
                    marginBottom: '0.75rem',
                    minHeight: mobileStackedForm ? 48 : undefined,
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Select recipient…</option>
                  {esmRecipientOptions.map((opt) => (
                    <option key={`esm-recipient-${question.id}-${opt.value}`} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {errorRecipient && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{errorRecipient}</p>}
              </>
            )}
            {esmMissingEmailWarning ? (
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#b45309' }}>
                {esmMissingEmailWarning}
              </p>
            ) : null}
            {!showComment && showCaretakerRecipientDropdown && (
              <>
                <label htmlFor={`recipient-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                  Who does this need to go to <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  id={`recipient-${question.id}`}
                  value={extras.recipient_person_id || ''}
                  onChange={(e) => setExtras({ recipient_person_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: errorRecipient ? '1px solid #ef4444' : '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '1rem',
                    backgroundColor: 'white',
                    marginBottom: '0.75rem',
                    minHeight: mobileStackedForm ? 48 : undefined,
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Select recipient…</option>
                  {caretakerRecipientOptions.map((opt) => (
                    <option key={`recipient-${question.id}-${opt.value}`} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {errorRecipient && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{errorRecipient}</p>}
              </>
            )}
            {showPhotoInYesNoFollowUp ? photoBlock : null}
          </div>
        )}
        {caretakerSimplePhotoCapture ? simplePhotoBlock : null}
        {!isNvTemplate &&
          !caretakerAlwaysPhoto &&
          (estateInspectionForm
            ? !esmInspectionQuestion && estatePhotoAllowed && photoBlock
            : !caretakerTemplate &&
              !question.caretaker_recipient_on_yes &&
              !photoWhen &&
              typeIncludesPhoto &&
              photoBlock)}
        {error && typeof error === 'string' && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
      </div>
    )
  }

  if (qType === 'graded') {
    const gradingOpts = eq.grading_options?.length ? eq.grading_options : ['A', 'B', 'C', 'D', 'NA']
    const needPhoto = !!eq.nv_graded_require_comment_photo
    const showSingleNvPhoto = isNvTemplate && !!eq.nv_allow_single_photo && !needPhoto
    const needComment = needPhoto || !!eq.nv_graded_require_comment_only
    const hasGrade = value != null && String(value).trim() !== ''
    const showGradedExtras =
      isNvTemplate
        ? needComment && hasGrade
        : isStdConditionRow && needComment
          ? true
          : eq.caretaker_graded_always_extras && needComment && hasGrade
    return (
      <div style={questionWrapStyle}>
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
          <div style={{ marginTop: '0.75rem', padding: mobileStackedForm ? '1rem' : '0.75rem', background: '#f9fafb', borderRadius: mobileStackedForm ? '0.5rem' : '0.375rem', border: '1px solid #e5e7eb', width: '100%', boxSizing: 'border-box' }}>
            <p style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.875rem', color: '#374151' }}>
              {needPhoto ? 'Comment and photo' : 'Comment'}
            </p>
            <label htmlFor={`comment-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
              Comment{' '}
              {isRequired && hasGrade ? <span style={{ color: '#ef4444' }}>*</span> : null}
            </label>
            <textarea
              className={commentTextareaClassName}
              id={`comment-${question.id}`}
              name={`comment-${question.id}`}
              value={extras.comment || ''}
              onChange={(e) => setExtras({ comment: e.target.value })}
              rows={2}
              style={{
                ...textareaSurface,
                width: '100%',
                padding: mobileStackedForm ? '0.75rem' : '0.5rem',
                border: errorComment ? '1px solid #ef4444' : '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: mobileStackedForm ? '1rem' : '0.875rem',
                fontFamily: 'inherit',
                marginBottom: needPhoto ? '0.75rem' : 0,
                minHeight: mobileStackedForm ? 96 : undefined,
                boxSizing: 'border-box',
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
                mobileStacked={mobileStackedForm}
              />
            )}
          </div>
        )}
        {showSingleNvPhoto && (
          <div style={{ marginTop: '0.75rem' }}>
            <label htmlFor={`nv-single-photo-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
              Photo (optional, 1 maximum)
            </label>
            <PhotoUploadControl
              id={`nv-single-photo-${question.id}`}
              value={(extras.photo_urls || []).slice(0, 1)}
              onChange={(urls) => setExtras({ photo_urls: urls.slice(0, 1) })}
              label="Add photo"
              multiple={false}
              error={errorPhotos}
              mobileStacked={mobileStackedForm}
            />
          </div>
        )}
        {!isNvTemplate &&
          !caretakerAlwaysPhoto &&
          (estateInspectionForm
            ? esmInspectionQuestion
              ? esmPhotoCommentBlock
              : estatePhotoAllowed && photoBlock
            : !isStdConditionRow && !eq.caretaker_graded_always_extras && photoBlock)}
        {error && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
      </div>
    )
  }

  if (qType === 'select' || qType === 'single_select') {
    const selectPairs =
      opts.length > 0
        ? normalizeOptionObjects(opts)
        : estateApiCostCodes.length > 0
          ? normalizeOptionObjects(estateApiCostCodes.map(({ value: v, label: lab }) => ({ value: v, label: lab || v })))
          : []
    return (
      <div style={questionWrapStyle}>
        <label htmlFor={id} style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
          {displayPrimaryLabel}
          {isRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
        </label>
        {esmInspectionQuestion ? <EstateQuestionInstructionBlock question={question} /> : null}
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
            minHeight: mobileStackedForm ? 48 : undefined,
            boxSizing: 'border-box',
          }}
        >
          <option value="">Select...</option>
          {selectPairs.map((o) => (
            <option key={`select-${question.id}-${o.value}`} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {!caretakerAlwaysPhoto &&
          (esmInspectionQuestion
            ? esmPhotoCommentBlock
            : (((!isNvTemplate && !estateInspectionForm) || estatePhotoAllowed) ? photoBlock : null))}
        {error && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
      </div>
    )
  }

  if (qType === 'rating') {
    const max = 5
    return (
      <div style={questionWrapStyle}>
        <label htmlFor={id} style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
          {displayPrimaryLabel}
          {isRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
        </label>
        {estateInspectionForm ? <EstateQuestionInstructionBlock question={question} /> : null}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', width: '100%' }}>
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
                minHeight: mobileStackedForm ? 48 : undefined,
                flex: mobileStackedForm ? '1 1 56px' : undefined,
              }}
            >
              {n}
            </button>
          ))}
        </div>
        {!caretakerAlwaysPhoto &&
          (esmInspectionQuestion
            ? esmPhotoCommentBlock
            : (((!isNvTemplate && !estateInspectionForm) || estatePhotoAllowed) ? photoBlock : null))}
        {error && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
      </div>
    )
  }

  if (qType === 'photo') {
    const urls = parsePhotoAnswer(value).slice(0, 1)
    return (
      <div style={questionWrapStyle}>
        {nvHeading}
        <label htmlFor={`photo-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
          {displayPrimaryLabel}
          {isRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
        </label>
        <PhotoUploadControl
          id={`photo-${question.id}`}
          value={urls}
          onChange={(next) => handleChange(stringifyPhotos(next.slice(0, 1)))}
          label="Add photo"
          multiple={false}
          required={isRequired}
          error={errorPhotos || error}
          mobileStacked={mobileStackedForm}
        />
        {error && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
      </div>
    )
  }

  if (qType === 'long_text') {
    return (
      <div style={questionWrapStyle}>
        <label htmlFor={id} style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
          {displayPrimaryLabel}
          {isRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
        </label>
        {estateInspectionForm ? <EstateQuestionInstructionBlock question={question} /> : null}
        <textarea
          className={commentTextareaClassName}
          id={id}
          name={id}
          value={value ?? ''}
          onChange={(e) => handleChange(e.target.value)}
          rows={4}
          style={{
            ...textareaSurface,
            width: '100%',
            padding: '0.75rem',
            border: error ? '1px solid #ef4444' : '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '1rem',
            fontFamily: 'inherit',
            minHeight: mobileStackedForm ? 120 : 100,
            boxSizing: 'border-box',
          }}
        />
        {!caretakerAlwaysPhoto &&
          (esmInspectionQuestion
            ? esmPhotoCommentBlock
            : (((!isNvTemplate && !estateInspectionForm) || estatePhotoAllowed) ? photoBlock : null))}
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
        <SignOffSection
          q={question}
          nv={NV_INLINE}
          ext={extras}
          sec={{ id: question._nv_answer_section_id || question.section_id || 'nv-sec-signoff' }}
          btnMinH={NV_INLINE.btnMinHeight}
          prefillResidentName=""
          handleExtras={(questionId, sectionId, updates) => {
            void sectionId
            onAnswerExtras(questionId, { ...(answerExtras || {}), ...updates })
          }}
          handleAnswer={(questionId, answerValue) => onChange(questionId, answerValue)}
        />
        {error && <p style={{ marginTop: 8, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
        {errorPhotos && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{errorPhotos}</p>}
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
      {!caretakerAlwaysPhoto &&
        (esmInspectionQuestion
          ? esmPhotoCommentBlock
          : (((!isNvTemplate && !estateInspectionForm) || estatePhotoAllowed) ? photoBlock : null))}
      {error && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
    </div>
  )
}

export default function NewInspectionForm({ initialBlocks = [] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useUser()
  const [isMobile, setIsMobile] = useState(false)
  const templateIdFromUrl = String(searchParams?.get('template_id') || '').trim()
  const walkaboutFromUrl = searchParams.get('walkabout') === '1'
  const effectiveLockedTemplateId = walkaboutFromUrl
    ? ESTATE_WALKABOUT_TEMPLATE_ID
    : templateIdFromUrl
  const debugTemplateVersion =
    process.env.NODE_ENV === 'development' && searchParams?.get('debug') === '1'
  const isTemplateLocked = !!effectiveLockedTemplateId
  const [apiPayload, setApiPayload] = useState({ templates: [] })
  const blocks = Array.isArray(initialBlocks) ? initialBlocks : []
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [templateId, setTemplateId] = useState('')
  const [postgresBlockId, setPostgresBlockId] = useState('')

  /** Active blocks = live location list (estates not used in UI yet). */
  const locationBlocks = useMemo(
    () => blocks.filter((b) => b == null || b.active !== false),
    [blocks]
  )

  useEffect(() => {
    if (!postgresBlockId) return
    const stillValid = locationBlocks.some((b) => b.id === postgresBlockId)
    if (!stillValid) setPostgresBlockId('')
  }, [postgresBlockId, locationBlocks])
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [answers, setAnswers] = useState({})
  const [answerExtras, setAnswerExtras] = useState({})
  const [submitError, setSubmitError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationErrors, setValidationErrors] = useState({})
  const [startingWizard, setStartingWizard] = useState(false)
  const [lastDraftPostResponse, setLastDraftPostResponse] = useState(null)
  const [expandedByQuestionId, setExpandedByQuestionId] = useState({})
  const [peopleOptions, setPeopleOptions] = useState([])
  const [showEstateFormGuidance, setShowEstateFormGuidance] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [offlineDraftId, setOfflineDraftId] = useState('')
  const [offlineDrafts, setOfflineDrafts] = useState([])
  const [offlineNotice, setOfflineNotice] = useState('')

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
    if (locationRequiredForSelectedTemplate && !postgresBlockId.trim()) {
      setValidationErrors((prev) => ({ ...prev, block_id: 'Please select a location' }))
      setSubmitError('Please select a location')
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
          estate_id: undefined,
          block_id: postgresBlockId.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSubmitError(data?.error || data?.details || `Request failed (${res.status})`)
        return
      }
      if (debugTemplateVersion) {
        setLastDraftPostResponse(data)
        logInspectionTemplateDebug({ source: 'POST /api/inspections draft=true', body: data })
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
          if (process.env.NODE_ENV === 'development') {
            console.warn('[NewInspectionForm] /api/templates failed', status, body)
          }
          if (isAirtableAuth) {
            throw new Error('Templates could not be loaded. Please contact support if this continues.')
          }
          throw new Error(
            templatesRes.status === 503
              ? 'Templates are not available yet. Please try again later.'
              : 'Templates could not be loaded. Please try again.'
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
            if (effectiveLockedTemplateId) {
              const hasRequestedTemplate = list.some((t) => t.id === effectiveLockedTemplateId)
              if (hasRequestedTemplate) setTemplateId(effectiveLockedTemplateId)
              else if (effectiveLockedTemplateId === ESTATE_WALKABOUT_TEMPLATE_ID) {
                setTemplateId(ESTATE_WALKABOUT_TEMPLATE_ID)
              } else if (!templateId) setTemplateId(list[0].id)
            } else if (!templateId) {
              setTemplateId(list[0].id)
            }
          } else if (effectiveLockedTemplateId === ESTATE_WALKABOUT_TEMPLATE_ID) {
            setTemplateId(ESTATE_WALKABOUT_TEMPLATE_ID)
          }
        }
      } catch (err) {
        if (!cancelled) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[NewInspectionForm] load templates', err)
          }
          setLoadError(err instanceof Error ? err.message : 'Templates could not be loaded.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [effectiveLockedTemplateId])

  const templates = apiPayload.templates || []
  const selectedTemplate = useMemo(() => {
    const fromList = templates.find((t) => t.id === templateId)
    if (fromList) return fromList
    if (templateId === ESTATE_WALKABOUT_TEMPLATE_ID) {
      return buildEstateWalkaboutTemplate()
    }
    return undefined
  }, [templates, templateId])
  const locationRequiredForSelectedTemplate = Boolean(
    selectedTemplate &&
      !isNVTemplate(selectedTemplate) &&
      (isCaretakerTemplate(selectedTemplate) ||
        isEsmInspectionFormTemplate(selectedTemplate) ||
        isGroundsMaintenanceTemplate(selectedTemplate))
  )
  const estateInspectionForm = Boolean(selectedTemplate && isEstateInspectionFormTemplate(selectedTemplate))
  const esmInspectionForm = Boolean(selectedTemplate && isEsmInspectionFormTemplate(selectedTemplate))
  const estateInspectionFormV2 = Boolean(selectedTemplate && isEstateInspectionFormV2Template(selectedTemplate))
  const mobileStackedInspectionForm = Boolean(
    isMobile &&
      selectedTemplate &&
      !isNVTemplate(selectedTemplate) &&
      (isCaretakerTemplate(selectedTemplate) || isEsmInspectionFormTemplate(selectedTemplate))
  )
  const lightCommentTextareaForTemplate = Boolean(
    selectedTemplate &&
      !isNVTemplate(selectedTemplate) &&
      (isCaretakerTemplate(selectedTemplate) ||
        isEsmInspectionFormTemplate(selectedTemplate) ||
        isGroundsMaintenanceTemplate(selectedTemplate))
  )
  const inspectionRenderSections = useMemo(() => {
    if (!selectedTemplate) return []
    if (isEstateInspectionFormTemplate(selectedTemplate) && !isEsmInspectionFormTemplate(selectedTemplate)) {
      return buildEstateInspectionFormSections(selectedTemplate)
    }
    return getSectionsWithOrderedQuestions(selectedTemplate)
  }, [selectedTemplate])

  useEffect(() => {
    if ((!estateInspectionForm && !esmInspectionForm) || process.env.NODE_ENV !== 'development') return
    for (const section of inspectionRenderSections) {
      console.log(section.title || section.name, (section.questions || []).length)
    }
  }, [estateInspectionForm, esmInspectionForm, inspectionRenderSections])

  const estateChecklistIndexByQid = useMemo(
    () =>
      estateInspectionForm && selectedTemplate
        ? estateInspectionFormV2
          ? new Map()
          : buildEstateInspectionChecklistQuestionIndexMap({
              ...selectedTemplate,
              sections: inspectionRenderSections,
            })
        : new Map(),
    [estateInspectionForm, estateInspectionFormV2, selectedTemplate, inspectionRenderSections]
  )

  const liveFormTemplateSummary = useMemo(() => {
    if (!selectedTemplate) return null
    return summarizeTemplateSnapshotForDebug({
      ...selectedTemplate,
      sections: inspectionRenderSections,
    })
  }, [selectedTemplate, inspectionRenderSections])
  const showBestPracticeGuide = !!selectedTemplate
  const currentSubmitBody = useMemo(() => {
    const packedAnswerExtras =
      isCaretakerTemplate(selectedTemplate) && !isNVTemplate(selectedTemplate)
        ? Object.fromEntries(
            Object.entries(answerExtras || {}).map(([questionId, extras]) => [
              questionId,
              {
                ...extras,
                notes: packNvWizardExtras(extras),
              },
            ])
          )
        : answerExtras
    return {
      template_id: templateId,
      estate_id: undefined,
      block_id: postgresBlockId.trim() || undefined,
      location: location.trim() || undefined,
      description: description.trim() || undefined,
      answers,
      answer_extras: packedAnswerExtras,
    }
  }, [templateId, postgresBlockId, location, description, answers, answerExtras, selectedTemplate])
  const currentDraftPayload = useMemo(
    () => ({
      formType: selectedTemplate?.name || selectedTemplate?.template_key || templateId || 'Inspection',
      templateId,
      templateName: selectedTemplate?.name || selectedTemplate?.template_name || '',
      blockId: postgresBlockId.trim() || '',
      location: location.trim(),
      description: description.trim(),
      userEmail: user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || '',
      submitBody: currentSubmitBody,
    }),
    [selectedTemplate, templateId, postgresBlockId, location, description, user, currentSubmitBody]
  )

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(typeof navigator === 'undefined' ? true : navigator.onLine)
    updateOnlineStatus()
    setOfflineDrafts(readOfflineInspectionDrafts())
    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)
    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [])

  useEffect(() => {
    if (isOnline || !hasInspectionDraftContent(currentDraftPayload)) return
    const id = offlineDraftId || createOfflineDraftId()
    if (!offlineDraftId) setOfflineDraftId(id)
    setOfflineDrafts(
      upsertOfflineInspectionDraft({
        id,
        label: currentDraftPayload.templateName || currentDraftPayload.formType,
        payload: currentDraftPayload,
      })
    )
    setOfflineNotice('You are offline. Your progress is saved on this device and will submit when you are back online.')
  }, [isOnline, offlineDraftId, currentDraftPayload])

  const saveCurrentOfflineDraft = () => {
    const id = offlineDraftId || createOfflineDraftId()
    if (!offlineDraftId) setOfflineDraftId(id)
    const next = upsertOfflineInspectionDraft({
      id,
      label: currentDraftPayload.templateName || currentDraftPayload.formType,
      payload: currentDraftPayload,
    })
    setOfflineDrafts(next)
    setOfflineNotice('You are offline. Your progress is saved on this device and will submit when you are back online.')
    return id
  }

  const restoreOfflineDraft = (draft) => {
    const payload = draft?.payload || {}
    const body = payload.submitBody || {}
    setOfflineDraftId(draft.id)
    setTemplateId(body.template_id || payload.templateId || '')
    setPostgresBlockId(body.block_id || payload.blockId || '')
    setLocation(body.location || payload.location || '')
    setDescription(body.description || payload.description || '')
    setAnswers(body.answers || {})
    setAnswerExtras(body.answer_extras || {})
    setSubmitError(null)
    setOfflineNotice('Offline draft loaded. Review it, then submit when you are online.')
  }

  const submitOfflineDraft = async (draft) => {
    if (!isOnline) {
      setOfflineNotice('You are offline. Reconnect before submitting saved drafts.')
      return
    }
    const body = draft?.payload?.submitBody
    if (!body) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) {
        setSubmitError(data.error || data.details || `Request failed (${res.status})`)
        return
      }
      setOfflineDrafts(removeOfflineInspectionDraft(draft.id))
      setOfflineDraftId('')
      const inspectionId = data.inspectionId ?? data.id
      if (inspectionId) router.push(`/inspections/${inspectionId}`)
    } catch (err) {
      setSubmitError(err.message || 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  const debugPseudoInspection = useMemo(
    () =>
      selectedTemplate
        ? {
            id: '(new inspection form — no inspection row until draft or submit)',
            template_id: selectedTemplate.id,
            template_version_id: null,
            template_version_meta: null,
          }
        : null,
    [selectedTemplate]
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
      [`${questionId}_recipient`]: undefined,
      [`${questionId}_authorisation`]: undefined,
      [`${questionId}_cost_code`]: undefined,
    }))
  }

  const validate = () => {
    const errs = {}
    if (postgresBlockId) {
      const b = locationBlocks.find((x) => x.id === postgresBlockId)
      if (!b) errs.block_id = 'Choose a valid location or clear the selection'
    }
    if (!templateId) errs.template_id = 'Select a template'
    if (!selectedTemplate) return { ...errs }
    if (locationRequiredForSelectedTemplate && !postgresBlockId.trim()) {
      errs.block_id = 'Please select a location'
    }

    inspectionRenderSections.forEach((sec) => {
      (sec.questions || []).forEach((q) => {
        if (q.nv_hidden) return
        if (!estateInspectionForm && !isNeighbourhoodVoiceQuestionRenderable(q)) return
        if (!estateInspectionForm && !shouldShowQuestion(q, answers)) return
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
          if (q.esm_q4_abandoned_vehicle === true && isYes) {
            if (photoUrls.length === 0) {
              errs[`${q.id}_photos`] = 'Vehicle/issue photo is required'
            }
            const idCardPhotos = Array.isArray(extras.id_card_photo_urls)
              ? extras.id_card_photo_urls.filter((u) => typeof u === 'string' && u)
              : []
            if (idCardPhotos.length === 0) {
              errs[`${q.id}_photos`] = 'Vehicle/issue photo and ID card photo are required'
            }
            if (!(extras.authorisation_text || '').trim()) {
              errs[`${q.id}_authorisation`] = 'Authorisation is required'
            }
            if (!(extras.comment || '').trim()) {
              errs[`${q.id}_comment`] = 'Comment/location is required'
            }
            if (!(extras.cost_code || '').trim()) {
              errs[`${q.id}_cost_code`] = 'Please select a cost code'
            }
          }
          if (q.caretaker_recipient_on_yes && isYes && !(extras.recipient_person_id || '').trim()) {
            errs[`${q.id}_recipient`] = 'Please select a recipient'
          }
          if (q.action_recipient_required_when && showRecipientForAnswer(q.action_recipient_required_when, normalized) && !(extras.recipient_person_id || '').trim()) {
            errs[`${q.id}_recipient`] = 'Please select a recipient'
          }
          if (q.esm_recipient_on_yes === true && isYes && !(extras.recipient_person_id || '').trim()) {
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
            const paperPhotos = Array.isArray(ex.paper_form_photo_urls)
              ? ex.paper_form_photo_urls.filter((u) => typeof u === 'string' && u)
              : Array.isArray(ex.photo_urls)
                ? ex.photo_urls.filter((u) => typeof u === 'string' && u)
                : []
            if (!(ex.completion_method || '').trim()) {
              errs[q.id] = 'Please choose how the inspection was completed'
            } else if (ex.completion_method === 'Using a paper form' && paperPhotos.length === 0) {
              errs[`${q.id}_photos`] = 'Please upload a photo of the completed paper form'
            } else if (!(ex.visit_date || '').trim()) {
              errs[q.id] = 'Please add the date inspection was completed'
            } else if (!(ex.resident_display_name || '').trim()) {
              errs[q.id] = 'Please enter the resident name'
            } else if (!ex.nv_signoff_confirmed) {
              errs[q.id] = 'Please confirm the declaration'
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
      if (!isOnline) {
        saveCurrentOfflineDraft()
        setIsSubmitting(false)
        return
      }
      const res = await fetch('/api/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(currentSubmitBody),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = res.status === 401
          ? 'Please sign in at the top of the page, then try submitting again.'
          : (data.error || data.details || `Request failed (${res.status})`)
        setSubmitError(msg)
        return
      }
      if (debugTemplateVersion) {
        setLastDraftPostResponse(data)
        logInspectionTemplateDebug({ source: 'POST /api/inspections submit', body: data })
      }
      if (data.error) {
        setSubmitError(data.error || data.details || 'Save failed')
        return
      }
      if (data.pdfError) {
        window.alert(
          `Inspection was saved, but the full PDF could not be generated or uploaded:\n\n${String(data.pdfError).slice(0, 500)}`
        )
      }
      const inspectionId = data.inspectionId ?? data.id
      if (inspectionId) {
        router.push(`/inspections/${inspectionId}`)
      } else {
        setSubmitError('Save may have succeeded. Open the inspections list to confirm, or try again.')
      }
    } catch (err) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        saveCurrentOfflineDraft()
        return
      }
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

  if (selectedTemplate && isEstateWalkaboutTemplate(selectedTemplate)) {
    return (
      <EstateWalkaboutNewInspectionForm
        blocks={blocks}
        templates={templates}
        templateId={templateId}
        setTemplateId={setTemplateId}
        templateLocked={isTemplateLocked}
      />
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
          Optional location, location note if needed, then complete the questions below.
        </p>
      </div>

      {debugTemplateVersion && selectedTemplate ? (
        <InspectionTemplateVersionDebugPanel
          inspection={debugPseudoInspection}
          liveAirtableSummary={liveFormTemplateSummary}
          postCreateSnapshotDebug={lastDraftPostResponse?.snapshotDebug}
          draftPostResponse={lastDraftPostResponse}
          heading="New inspection — live /api/templates shape (?debug=1). After draft/submit, see draft_post_response."
        />
      ) : null}

      {(!isOnline || offlineDrafts.length > 0 || offlineNotice) && (
        <div style={offlinePanelStyle}>
          <strong>
            {!isOnline
              ? 'You are offline. Your progress is saved on this device and will submit when you are back online.'
              : 'Offline drafts'}
          </strong>
          <p style={{ margin: '0.4rem 0 0', color: '#475569', fontSize: '0.875rem' }}>
            Photos need a connection in this first offline stage. Saved drafts are only stored on this device.
          </p>
          {offlineNotice && isOnline ? (
            <p style={{ margin: '0.4rem 0 0', color: '#475569', fontSize: '0.875rem' }}>{offlineNotice}</p>
          ) : null}
          {offlineDrafts.length > 0 ? (
            <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.75rem' }}>
              {offlineDrafts.map((draft) => (
                <div key={draft.id} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ flex: '1 1 220px', fontSize: '0.875rem' }}>
                    {draft.label || draft.payload?.templateName || 'Inspection draft'} · {new Date(draft.updatedAt || draft.createdAt).toLocaleString('en-GB')}
                  </span>
                  <button type="button" onClick={() => restoreOfflineDraft(draft)} style={smallButtonStyle}>Reopen draft</button>
                  <button type="button" disabled={!isOnline || isSubmitting} onClick={() => submitOfflineDraft(draft)} style={smallButtonStyle}>
                    Submit saved draft
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          backgroundColor: 'white',
          padding: isMobile ? '1rem' : '2rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          maxWidth: isMobile ? '100%' : '800px',
          width: mobileStackedInspectionForm ? '100%' : undefined,
          boxSizing: 'border-box',
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
            htmlFor="postgres_block_id"
            style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}
          >
            Location
            {locationRequiredForSelectedTemplate && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
          </label>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', color: '#6b7280' }}>
            {locationRequiredForSelectedTemplate
              ? 'If the exact location is not in the dropdown, users should select the closest option and provide full details in the notes/comments field.'
              : 'Optional: choose a location from the list, or leave blank and use the location note below.'}
          </p>
          <select
            id="postgres_block_id"
            name="postgres_block_id"
            value={postgresBlockId}
            onChange={(e) => {
              setPostgresBlockId(e.target.value)
              setValidationErrors((prev) => ({ ...prev, block_id: undefined }))
            }}
            required={locationRequiredForSelectedTemplate}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: validationErrors.block_id ? '1px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
              backgroundColor: 'white',
              minHeight: 44,
            }}
          >
            <option value="">{locationRequiredForSelectedTemplate ? '— Select location —' : '— None selected —'}</option>
            {locationBlocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {locationBlocks.length === 0 && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
              No locations in the list yet. Contact your administrator if you expected to see blocks here.
            </p>
          )}
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
            Location notes/comments (optional)
          </label>
          <input
            type="text"
            id="location"
            name="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Stairwell, entrance, flat number, or exact location details"
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
              <div style={{ margin: '-0.5rem 0 1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowEstateFormGuidance((v) => !v)}
                  style={{
                    padding: '0.25rem 0.65rem',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: '#2563eb',
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  {showEstateFormGuidance ? 'Hide guidance' : 'View guidance'}
                </button>
                {showEstateFormGuidance ? (
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.5 }}>
                    Sections follow your inspection template (order and titles). Grading is A–D–NA. Photo upload appears when
                    the template is set to require or allow a photo for that question.
                  </p>
                ) : null}
              </div>
            ) : null}
            {(isNVTemplate(selectedTemplate)
              ? inspectionRenderSections.filter((s) => s.id !== 'nv-sec-remaining')
              : inspectionRenderSections
            ).map((section, sectionIdx) => (
              <div
                key={section.id}
                style={{
                  marginBottom: mobileStackedInspectionForm ? '1rem' : '2rem',
                  padding: mobileStackedInspectionForm ? '1rem' : '0 0 1.5rem',
                  border: mobileStackedInspectionForm ? '1px solid #e5e7eb' : 'none',
                  borderBottom: mobileStackedInspectionForm ? '1px solid #e5e7eb' : '1px solid #e5e7eb',
                  borderRadius: mobileStackedInspectionForm ? '0.75rem' : 0,
                  backgroundColor: mobileStackedInspectionForm ? '#fff' : 'transparent',
                  boxSizing: 'border-box',
                }}
              >
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                  {estateInspectionForm || esmInspectionForm ? (
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
                {(estateInspectionForm || esmInspectionForm) && (section.what_to_look_for || section.help_text) ? (
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
                  const useEstateListLayout = estateInspectionForm || esmInspectionForm
                  const rows = (section.questions || []).filter((q) => {
                    if (q.nv_hidden) return false
                    if (useEstateListLayout) return true
                    if (!isNeighbourhoodVoiceQuestionRenderable(q)) return false
                    return shouldShowQuestion(q, answers)
                  })
                  const items = rows.map((q) => {
                    estateSectionSeq += 1
                    const estateDisplayNumber = useEstateListLayout
                      ? estateAirtableQuestionDisplayNumber(q, estateSectionSeq)
                      : null
                    const caretakerPartLabel =
                      isCaretakerTemplate(selectedTemplate) && !isNVTemplate(selectedTemplate)
                        ? caretakerRowDisplayLabel(indexToCaretakerRowLetter(caretakerRowIdx++), q)
                        : null
                    const qProps = {
                      question: q,
                      value: answers[q.id],
                      onChange: handleAnswer,
                      error: validationErrors[q.id],
                      errorComment: validationErrors[`${q.id}_comment`],
                      errorPhotos: validationErrors[`${q.id}_photos`],
                      errorRecipient: validationErrors[`${q.id}_recipient`],
                      errorAuthorisation: validationErrors[`${q.id}_authorisation`],
                      errorCostCode: validationErrors[`${q.id}_cost_code`],
                      answerExtras: answerExtras[q.id],
                      onAnswerExtras: (questionId, extras) => setAnswerExtras((prev) => ({ ...prev, [questionId]: extras })),
                      createActionOnNo: q.create_action_on_no,
                      isNvTemplate: isNVTemplate(selectedTemplate),
                      expandedByQuestionId,
                      peopleOptions,
                      standardInspectionForm: usesStandardInspectionFormUI(selectedTemplate),
                      caretakerPartLabel,
                      caretakerTemplate: isCaretakerTemplate(selectedTemplate) && !isNVTemplate(selectedTemplate),
                      estateInspectionForm,
                      esmInspectionForm,
                      estateChecklistIndex: estateChecklistIndexByQid.get(q.id),
                      estateDisplayNumber,
                      mobileStackedForm: mobileStackedInspectionForm,
                      lightCommentTextarea: lightCommentTextareaForTemplate,
                    }
                    return useEstateListLayout ? (
                      <li key={q.id} style={{ margin: 0, padding: mobileStackedInspectionForm ? '0.75rem 0' : 0, listStyle: 'none' }}>
                        <InspectionQuestion {...qProps} />
                      </li>
                    ) : (
                      <InspectionQuestion key={q.id} {...qProps} />
                    )
                  })
                  if (estateInspectionForm || esmInspectionForm) {
                    return (
                      <ol
                        style={{
                          listStyle: 'none',
                          margin: 0,
                          padding: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.25rem',
                        }}
                      >
                        {items}
                      </ol>
                    )
                  }
                  return <>{items}</>
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
              {locationRequiredForSelectedTemplate ? 'Notes / comments' : 'Description'}
            </label>
            <textarea
              className={lightCommentTextareaForTemplate ? 'inspection-comment-textarea' : undefined}
              id="description"
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={locationRequiredForSelectedTemplate ? 'Add any notes/comments, including full details if the closest dropdown location was selected.' : 'Additional notes...'}
              style={{
                ...(lightCommentTextareaForTemplate ? COMMENT_TEXTAREA_SURFACE : {}),
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
      {showBestPracticeGuide && (
        <BestPracticeGuideButton
          title={`${selectedTemplate?.name || 'Inspection'} Best Practice Guide`}
          templateId={selectedTemplate?.id || ''}
          templateKey={selectedTemplate?.template_key || ''}
          templateName={selectedTemplate?.name || selectedTemplate?.template_name || ''}
          guideUrl="/guides/best-practice-guide.pdf"
          openInNewTab
        />
      )}
    </div>
  )
}
