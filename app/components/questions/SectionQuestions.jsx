'use client'

import { useState, useEffect } from 'react'
import QuestionRenderer from './QuestionRenderer'
import { getSectionQuestions, getVisibleQuestions, validateRequiredQuestions } from '@/lib/airtable'

export default function SectionQuestions({ sectionId, inspectionId, answers = {}, onAnswersChange, errors = {}, onQuestionsLoaded }) {
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [localAnswers, setLocalAnswers] = useState(answers)

  useEffect(() => {
    loadQuestions()
  }, [sectionId])

  useEffect(() => {
    // Update local answers when prop changes
    setLocalAnswers(answers)
  }, [answers])

  const loadQuestions = async () => {
    try {
      setLoading(true)
      const fetchedQuestions = await getSectionQuestions(sectionId)
      setQuestions(fetchedQuestions)
      // Notify parent component of loaded questions
      if (onQuestionsLoaded) {
        onQuestionsLoaded(fetchedQuestions)
      }
    } catch (error) {
      console.error('Error loading questions:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAnswerChange = (questionId, value) => {
    const newAnswers = {
      ...localAnswers,
      [questionId]: value
    }
    setLocalAnswers(newAnswers)
    onAnswersChange(newAnswers)
  }

  // Get visible questions based on conditional logic
  const visibleQuestions = getVisibleQuestions(questions, localAnswers)

  if (loading) {
    return <div style={{ padding: '1rem', color: '#6b7280' }}>Loading questions...</div>
  }

  if (questions.length === 0) {
    return <div style={{ padding: '1rem', color: '#6b7280' }}>No questions found for this section.</div>
  }

  return (
    <div>
      {visibleQuestions.map((question) => (
        <QuestionRenderer
          key={question.id}
          question={question}
          sectionName={section?.name || 'Section'}
          inspectionId={inspectionId}
          value={localAnswers[question.id]}
          onChange={handleAnswerChange}
          errors={errors}
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
