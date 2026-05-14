'use client'

import { useState, useEffect, useMemo } from 'react'
import QuestionRenderer from './QuestionRenderer'
import { getVisibleQuestions } from '@/lib/airtable'

export default function SectionQuestions({
  sectionId,
  inspectionId,
  section,
  sectionQuestions = [],
  answers = {},
  onAnswersChange,
  errors = {},
  onQuestionsLoaded,
  alwaysShowCaretakerComment = false,
  alwaysShowCaretakerCommentPhoto = false,
  alwaysShowCaretakerRecipient = false,
  caretakerSections12Structured = false,
  estateInspectionForm = false,
  esmInspectionForm = false,
}) {
  const [questions, setQuestions] = useState([])
  const [localAnswers, setLocalAnswers] = useState(answers)

  useEffect(() => {
    setQuestions(sectionQuestions)
    if (onQuestionsLoaded) onQuestionsLoaded(sectionQuestions)
  }, [sectionId, sectionQuestions, onQuestionsLoaded])

  useEffect(() => {
    // Update local answers when prop changes
    setLocalAnswers(answers)
  }, [answers])

  const handleAnswerChange = (questionId, value) => {
    const newAnswers = {
      ...localAnswers,
      [questionId]: value
    }
    setLocalAnswers(newAnswers)
    onAnswersChange(newAnswers)
  }

  // Estate staff form shows every checklist row; other forms use their Airtable visibility rules.
  const visibleQuestions = useMemo(() => {
    if (estateInspectionForm) {
      return questions.filter((q) => !q.nv_hidden && !q.esm_hidden)
    }
    return getVisibleQuestions(questions, localAnswers).filter((q) => !q.esm_hidden)
  }, [estateInspectionForm, questions, localAnswers])

  if (questions.length === 0) {
    return <div style={{ padding: '1rem', color: '#6b7280' }}>No questions found for this section.</div>
  }

  return (
    <div>
      {visibleQuestions.map((question, index) => (
        <QuestionRenderer
          key={question.id}
          question={question}
          sectionName={section?.name || 'Section'}
          inspectionId={inspectionId}
          value={localAnswers[question.id]}
          onChange={handleAnswerChange}
          errors={errors}
          section={section}
          sectionQuestions={questions}
          allAnswers={localAnswers}
          alwaysShowCaretakerComment={alwaysShowCaretakerComment}
          alwaysShowCaretakerCommentPhoto={alwaysShowCaretakerCommentPhoto}
          alwaysShowCaretakerRecipient={alwaysShowCaretakerRecipient}
          caretakerSections12Structured={caretakerSections12Structured}
          subLabelIndex={index}
          estateInspectionForm={estateInspectionForm}
          esmInspectionForm={esmInspectionForm}
        />
      ))}
      
      {visibleQuestions.length === 0 && (
        <p style={{ color: '#6b7280', fontStyle: 'italic' }}>
          No questions are visible based on your previous answers.
        </p>
      )}
    </div>
  )
}
