'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import SectionQuestions from '../../../../components/questions/SectionQuestions'
import {
  validateCaretakerTemplate,
  findTriggerQuestion,
  findPhotoCommentQuestion,
  findRecipientQuestion,
  isCaretakerTriggerActive,
  inspectionIsCaretaker,
} from '../../../../../lib/caretaker-template'
import { getActionTriggerOn, isSpecialSection, validateCaretakerQuestion } from '../../../../../lib/template-rules'
import { applyTemplateDisplayPatches } from '../../../../../lib/caretaker-fire-template-patch'
import { inspectionIsSubmitted } from '../../../../../lib/inspection-follow-up-updates'
import {
  buildCaretakerActionDescription,
  shouldAutocreateCaretakerAction,
  normalizeYesNoAnswer,
} from '../../../../../lib/caretaker-action-details'
import { validateRequiredQuestions } from '../../../../../lib/airtable'
import { handleYesAnswer, handleNoAnswer } from '../../../../../lib/yesno-action-handler'
import {
  isEstateInspectionFormTemplate,
  isEsmInspectionFormTemplate,
} from '../../../../../lib/standard-inspection-form'

export default function InspectionSection() {
  const params = useParams()
  const router = useRouter()
  const [id, setId] = useState(null)
  const [sectionId, setSectionId] = useState(null)

  useEffect(() => {
    const loadParams = async () => {
      const resolvedParams = await params
      setId(resolvedParams.id)
      setSectionId(resolvedParams.sectionId)
    }
    loadParams()
  }, [params])
  const [inspection, setInspection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState({})
  const [createdActions, setCreatedActions] = useState([])
  const [actionProcessWarning, setActionProcessWarning] = useState(null)
  const [questions, setQuestions] = useState([])
  const [errors, setErrors] = useState({})
  const [section, setSection] = useState(null)

  useEffect(() => {
    const loadInspection = async () => {
      try {
        if (!id) return
        const response = await fetch(`/api/inspections/${id}`, { credentials: 'include' })
        if (!response.ok) {
          throw new Error('Inspection not found')
        }
        const found = await response.json()
        setInspection(found)
        let version = found.template_version
        if (typeof version === 'string') {
          try {
            version = JSON.parse(version)
          } catch {
            version = null
          }
        }
        if (version && typeof version === 'object') {
          applyTemplateDisplayPatches(version)
        }
        const sections = (version && version.sections) || []
        const currentSection = sections[parseInt(sectionId, 10) - 1] || null
        setSection(currentSection)
      } catch (error) {
        console.error('Error loading inspection:', error)
      } finally {
        setLoading(false)
      }
    }

    if (id && sectionId) {
      loadInspection()
    }
  }, [id, sectionId])

  useEffect(() => {
    const loadAnswers = async () => {
      if (!id || !sectionId) return
      try {
        const response = await fetch(`/api/inspections/${id}/answers?section_id=${sectionId}`, { credentials: 'include' })
        if (response.ok) {
          const data = await response.json()
          const answerMap = {}
          data.forEach(answer => {
            answerMap[answer.question_id] = answer.answer_value || answer.answer_text || answer.answer_boolean
            if (answer.notes) {
              answerMap[`${answer.question_id}_comment`] = answer.notes
            }
          })
          setAnswers(answerMap)
        }
      } catch (error) {
        console.error('Error loading answers:', error)
      }
    }
    loadAnswers()
  }, [id, sectionId])

  const isYesNoQuestion = (q) => {
    const t = (q.question_type || '').toString().toLowerCase().replace(/[\s\-/]+/g, '_').replace(/_+$/g, '')
    return t === 'yes_no' || t === 'yesno'
  }

  async function validateCaretakerTriggerYesPhotos(questions, answers) {
    const errors = {}
    if (!id || !section || !isSpecialSection(section)) return errors
    const trigger = findTriggerQuestion(questions, section)
    if (!trigger || !isCaretakerTriggerActive(answers, trigger)) return errors
    if (findPhotoCommentQuestion(questions)) return errors
    try {
      const res = await fetch(`/api/photos?inspection_id=${id}&question_id=${trigger.id}`, { credentials: 'include' })
      const data = res.ok ? await res.json() : []
      if (!Array.isArray(data) || data.length === 0) {
        errors[`${trigger.id}_photos`] = 'At least one photo is required when trigger is "Yes"'
      }
    } catch {
      errors[`${trigger.id}_photos`] = 'Could not verify photos for this question'
    }
    return errors
  }

  const validateNoAnswers = async (questions, answers) => {
    const errors = {}
    for (const question of questions) {
      if (!isYesNoQuestion(question)) continue
      const answer = answers[question.id]
      const comment = answers[`${question.id}_comment`] || ''
      const photosRes = await fetch(
        `/api/photos?inspection_id=${id}&question_id=${question.id}`,
        { credentials: 'include' }
      )
      const photoData = photosRes.ok ? await photosRes.json() : []
      const qErrors = validateCaretakerQuestion(question, answer, comment, photoData, section)
      Object.assign(errors, qErrors)
    }
    return errors
  }

  const inspectionLocationLine = (inv) => {
    if (!inv) return ''
    const line =
      inv.location_label ||
      [inv.estate_name, inv.block_name].filter(Boolean).join(' / ') ||
      inv.title ||
      ''
    return String(line).trim()
  }

  const processNoAnswers = async (questions, answers) => {
    const warnings = []
    const sectionName = section?.name || `Section ${sectionId}`
    const recipientQ = findRecipientQuestion(questions)
    const recipientPersonIdFor = () =>
      recipientQ && answers[recipientQ.id] ? answers[recipientQ.id] : null

    for (const question of questions) {
      if (!isYesNoQuestion(question)) continue
      const answer = answers[question.id]
      if (!shouldAutocreateCaretakerAction(question, answer, section)) {
        await handleYesAnswer(id, question.id)
        continue
      }
      const norm = normalizeYesNoAnswer(answer)
      const comment = answers[`${question.id}_comment`] || ''
      const photosResponse = await fetch(
        `/api/photos?inspection_id=${id}&question_id=${question.id}`,
        { credentials: 'include' }
      )
      const photos = photosResponse.ok ? await photosResponse.json() : []
      const photoIds = photos.map((p) => p.id)
      const priority = answers[`${question.id}_priority`] || question.action_priority || null
      const recipientPersonId = recipientPersonIdFor()
      const qText = question.label || question.question_text || question.id
      const answerLabel = norm === 'yes' ? 'Yes' : norm === 'no' ? 'No' : String(answer ?? '')
      const richDescription = buildCaretakerActionDescription({
        inspectionId: id,
        completedAtIso: new Date().toISOString(),
        estateBlockLine: inspectionLocationLine(inspection),
        sectionName,
        questionText: qText,
        answerLabel,
        comment,
        photoRefs: photos.map((p) => p.blob_url || p.id).filter(Boolean).join('; '),
        category: question.action_category || 'other',
        assigneeLabel: recipientPersonId ? `Person id ${recipientPersonId}` : '',
        submittedBy: inspection?.inspector_name || inspection?.inspector_id || '',
      })
      try {
        const action = await handleNoAnswer({
          inspectionId: id,
          sectionId: sectionId,
          sectionName: sectionName,
          questionId: question.id,
          questionText: qText,
          question: question,
          comment: comment,
          photos: photoIds,
          priority: priority,
          recipientPersonId: recipientPersonId || null,
          richDescription,
        })
        if (action) {
          setCreatedActions((prev) => {
            const existing = prev.find((a) => a.question_id === question.id)
            if (existing) {
              return prev.map((a) => (a.question_id === question.id ? action : a))
            }
            return [...prev, action]
          })
        }
      } catch (error) {
        console.error(`Error processing issue-trigger answer for ${question.id}:`, error)
        warnings.push(`Action for "${qText}" could not be saved (${error?.message || 'error'}).`)
      }
    }
    return warnings
  }

  const saveAnswers = async () => {
    if (inspectionIsSubmitted(inspection)) {
      throw new Error('This inspection is locked after submission.')
    }
    if (!id || !sectionId || Object.keys(answers).length === 0) return
    try {
await fetch(`/api/inspections/${id}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ section_id: sectionId, answers: answers }),
    })
    } catch (error) {
      console.error('Error saving answers:', error)
      throw error
    }
  }

  const handleSave = async () => {
    try {
      const requiredErrors = validateRequiredQuestions(questions, answers)
      const caretakerErrors = validateCaretakerTemplate(answers, questions, section)
      const triggerPhotoErrors = await validateCaretakerTriggerYesPhotos(questions, answers)
      const noAnswerErrors = await validateNoAnswers(questions, answers)
      const allErrors = { ...requiredErrors, ...caretakerErrors, ...triggerPhotoErrors, ...noAnswerErrors }
      if (Object.keys(allErrors).length > 0) {
        setErrors(allErrors)
        alert('Please complete all required fields (comments and photos where an issue is raised)')
        return
      }
      setErrors({})
      setActionProcessWarning(null)
      await saveAnswers()
      const actionWarnings = await processNoAnswers(questions, answers)
      setActionProcessWarning(actionWarnings.length ? actionWarnings.join(' ') : null)
      if (actionWarnings.length) {
        alert(`Section saved. Note: ${actionWarnings.join(' ')}`)
      } else {
        alert('Section saved!')
      }
    } catch (error) {
      console.error('Error saving section:', error)
      alert('Failed to save section')
    }
  }

  const handleAnswersChange = (newAnswers) => {
    setAnswers(newAnswers)
    setErrors({})
  }

  const handleQuestionsLoaded = (loadedQuestions) => {
    setQuestions(loadedQuestions)
  }

  const handleNext = async () => {
    try {
      const requiredErrors = validateRequiredQuestions(questions, answers)
      const caretakerErrors = validateCaretakerTemplate(answers, questions, section)
      const triggerPhotoErrors = await validateCaretakerTriggerYesPhotos(questions, answers)
      const noAnswerErrors = await validateNoAnswers(questions, answers)
      const allErrors = { ...requiredErrors, ...caretakerErrors, ...triggerPhotoErrors, ...noAnswerErrors }
      if (Object.keys(allErrors).length > 0) {
        setErrors(allErrors)
        alert('Please complete all required fields before continuing')
        return
      }
      setActionProcessWarning(null)
      await saveAnswers()
      const actionWarnings = await processNoAnswers(questions, answers)
      setActionProcessWarning(actionWarnings.length ? actionWarnings.join(' ') : null)
      if (actionWarnings.length) {
        alert(`Section saved. Note: ${actionWarnings.join(' ')}`)
      }
      const nextSection = parseInt(sectionId) + 1
      router.push(`/inspections/${id}/section/${nextSection}`)
    } catch (error) {
      console.error('Error processing answers:', error)
      alert('Failed to save section. Please try again.')
    }
  }

  const handleReview = () => {
    router.push(`/inspections/${id}/review`)
  }

  if (!id || !sectionId || loading) {
    return <div style={{ padding: '2rem' }}>Loading inspection...</div>
  }

  if (!inspection) {
    return (
      <div style={{ padding: '2rem' }}>
        <p>Inspection not found</p>
        <Link href="/inspections">Back to Inspections</Link>
      </div>
    )
  }

  const urlSectionNum = parseInt(String(sectionId), 10)
  const isCaretakerInspection = inspectionIsCaretaker(inspection)
  const isLocked = inspectionIsSubmitted(inspection)
  const caretakerSections12Structured =
    isCaretakerInspection &&
    !Number.isNaN(urlSectionNum) &&
    urlSectionNum >= 1 &&
    urlSectionNum <= 2
  const alwaysShowCaretakerComment =
    isCaretakerInspection &&
    !Number.isNaN(urlSectionNum) &&
    urlSectionNum >= 1 &&
    urlSectionNum <= 2
  const alwaysShowCaretakerCommentPhoto =
    isCaretakerInspection &&
    !Number.isNaN(urlSectionNum) &&
    urlSectionNum >= 1 &&
    urlSectionNum <= 5
  const alwaysShowCaretakerRecipient =
    isCaretakerInspection &&
    !Number.isNaN(urlSectionNum) &&
    urlSectionNum >= 3 &&
    urlSectionNum <= 5

  let estateInspectionForm = false
  let esmInspectionForm = false
  if (inspection && !isCaretakerInspection) {
    let tv = inspection.template_version
    if (typeof tv === 'string') {
      try {
        tv = JSON.parse(tv)
      } catch {
        tv = null
      }
    }
    if (tv && typeof tv === 'object') {
      estateInspectionForm = isEstateInspectionFormTemplate(tv)
      esmInspectionForm = isEsmInspectionFormTemplate(tv)
    } else {
      const templateSpec = {
        name: inspection.template_name,
        id: inspection.template_id,
        template_key: inspection.template_key,
      }
      estateInspectionForm = isEstateInspectionFormTemplate(templateSpec)
      esmInspectionForm = isEsmInspectionFormTemplate(templateSpec)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <Link
          href={`/inspections/${id}`}
          style={{
            color: '#3b82f6',
            textDecoration: 'none',
            fontSize: '0.875rem',
            display: 'inline-block',
            marginBottom: '1rem',
          }}
        >
          ← Back to Inspection
        </Link>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold' }}>
          Section {sectionId}
        </h1>
        <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
          {[inspection.id?.slice(0, 8), inspection.template_name, inspection.location_label || inspection.location, inspection.submitted_at || inspection.created_at ? new Date(inspection.submitted_at || inspection.created_at).toLocaleDateString('en-GB') : null].filter(Boolean).join(' · ')}
        </p>
      </div>

      {isLocked ? (
        <div
          style={{
            marginBottom: '1.5rem',
            padding: '0.85rem 1rem',
            backgroundColor: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: '0.5rem',
            color: '#92400e',
            fontSize: '0.875rem',
            lineHeight: 1.5,
          }}
        >
          This inspection has been submitted and is locked. Answers and photos cannot be changed.{' '}
          <Link href={`/inspections/${id}?addUpdate=1#follow-up-updates`} style={{ color: '#b45309', fontWeight: 600 }}>
            Add a follow-up note
          </Link>{' '}
          instead.
        </div>
      ) : null}

      <div style={{
        backgroundColor: 'white',
        padding: '2rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        marginBottom: '1.5rem'
      }}>
        {section && (
          <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.25rem', fontWeight: '600' }}>
            {section.name || section.title || `Section ${sectionId}`}
          </h2>
        )}
        {section && estateInspectionForm && (section.what_to_look_for || section.help_text) && (
          <div
            style={{
              marginBottom: '1.25rem',
              padding: '1rem',
              backgroundColor: '#f9fafb',
              borderRadius: '0.5rem',
              border: '1px solid #e5e7eb',
              fontSize: '0.875rem',
              color: '#4b5563',
              lineHeight: 1.55,
            }}
          >
            {section.what_to_look_for ? (
              <>
                <p style={{ margin: '0 0 0.35rem', fontWeight: 600, color: '#111827' }}>What to look for</p>
                <p style={{ margin: '0 0 0.75rem', whiteSpace: 'pre-wrap' }}>{section.what_to_look_for}</p>
              </>
            ) : null}
            {section.help_text && section.help_text !== section.what_to_look_for ? (
              <>
                <p style={{ margin: '0 0 0.35rem', fontWeight: 600, color: '#111827' }}>
                  {section.what_to_look_for ? 'Additional help' : 'Help'}
                </p>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{section.help_text}</p>
              </>
            ) : null}
          </div>
        )}
        {section && (
          <SectionQuestions
            sectionId={section.id}
            inspectionId={id}
            section={section}
            sectionQuestions={section.questions || []}
            answers={answers}
            onAnswersChange={handleAnswersChange}
            errors={errors}
            onQuestionsLoaded={handleQuestionsLoaded}
            alwaysShowCaretakerComment={alwaysShowCaretakerComment}
            alwaysShowCaretakerCommentPhoto={alwaysShowCaretakerCommentPhoto}
            alwaysShowCaretakerRecipient={alwaysShowCaretakerRecipient}
            caretakerSections12Structured={caretakerSections12Structured}
            estateInspectionForm={estateInspectionForm}
            esmInspectionForm={esmInspectionForm}
          />
        )}
        {!section && (
          <p style={{ color: '#6b7280' }}>
            Loading questions for Section {sectionId}...
          </p>
        )}
        {actionProcessWarning && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              backgroundColor: '#fffbeb',
              borderRadius: '0.5rem',
              border: '1px solid #f59e0b',
              color: '#92400e',
              fontSize: '0.875rem',
            }}
          >
            {actionProcessWarning}
          </div>
        )}
        {createdActions.length > 0 && (
          <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#eff6ff', borderRadius: '0.5rem', border: '1px solid #3b82f6' }}>
            <p style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#1e40af' }}>
              Auto-created Actions ({createdActions.length}):
            </p>
            <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#1e40af' }}>
              {createdActions.map((action, idx) => (
                <li key={action.id || idx} style={{ marginBottom: '0.25rem' }}>
                  {action.title}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div style={{
        display: 'flex',
        gap: '1rem',
        justifyContent: 'flex-end'
      }}>
        {isLocked ? (
          <Link
            href={`/inspections/${id}`}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#0f766e',
              color: '#fff',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            View locked inspection
          </Link>
        ) : (
          <>
        <button
          onClick={handleSave}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: 'white',
            color: '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: 'pointer',
          }}
        >
          Save Draft
        </button>
        {parseInt(sectionId) < 5 ? (
          <button
            onClick={handleNext}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Next Section →
          </button>
        ) : (
          <button
            onClick={handleReview}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Review & Submit →
          </button>
        )}
          </>
        )}
      </div>
    </div>
  )
}
