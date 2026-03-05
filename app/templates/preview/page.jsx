'use client'

import { useState } from 'react'
import Link from 'next/link'
import QuestionCard from '@/app/components/questions/QuestionCard'

// Mock template data for preview (no Prisma/Neon)
const MOCK_TEMPLATE = {
  id: 'preview-mock',
  name: 'Caretaker / NV preview',
  sections: [
    {
      id: 'sec-1',
      title: 'Cleaning & communal areas',
      help_text: 'Check communal areas and bin stores.',
      questions: [
        {
          id: 'q1',
          question_text: 'Are communal areas clean and free of debris?',
          helper_text: 'Include landings, stairs and shared corridors.',
          category: 'Cleaning',
          no_triggers_issue: true,
          show_photo: true,
          show_comment: true,
        },
        {
          id: 'q2',
          question_text: 'Are bin stores accessible and lids closed?',
          category: 'Cleaning',
          no_triggers_issue: true,
          show_comment: true,
        },
      ],
    },
    {
      id: 'sec-2',
      title: 'Fire safety',
      help_text: 'Visual checks only; do not test equipment yourself.',
      questions: [
        {
          id: 'q3',
          question_text: 'Are fire doors clear of obstructions?',
          category: 'Fire safety',
          no_triggers_issue: true,
          show_photo: true,
          show_comment: true,
        },
      ],
    },
  ],
}

export default function TemplatesPreviewPage() {
  const [answers, setAnswers] = useState({})
  const [comments, setComments] = useState({})
  const [photos, setPhotos] = useState({})

  const handleAnswer = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  const handleComment = (questionId, comment) => {
    setComments((prev) => ({ ...prev, [questionId]: comment }))
  }

  const handlePhoto = (questionId, urls) => {
    setPhotos((prev) => ({ ...prev, [questionId]: urls }))
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#F9FAFB',
        padding: '16px',
        fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <Link
          href="/templates"
          style={{ display: 'inline-block', marginBottom: 16, color: '#1E3A8A', fontSize: 14, textDecoration: 'none' }}
        >
          ← Back to templates
        </Link>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#111827', marginBottom: 4 }}>
          Template preview
        </h1>
        <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 24 }}>
          Mock data · QuestionCard used by caretaker & NV templates
        </p>

        {(MOCK_TEMPLATE.sections || []).map((sec) => (
          <section key={sec.id} style={{ marginBottom: 32 }}>
            <h2
              style={{
                fontSize: '1.125rem',
                fontWeight: 600,
                color: '#1E3A8A',
                borderLeft: '4px solid #1E3A8A',
                paddingLeft: 12,
                marginBottom: 8,
              }}
            >
              {sec.title}
            </h2>
            {sec.help_text && (
              <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 16 }}>{sec.help_text}</p>
            )}
            {(sec.questions || []).map((q) => (
              <QuestionCard
                key={q.id}
                id={q.id}
                questionText={q.question_text}
                helperText={q.helper_text}
                category={q.category}
                value={answers[q.id]}
                onChange={(v) => handleAnswer(q.id, v)}
                noTriggersIssue={q.no_triggers_issue}
                showPhoto={q.show_photo}
                photoUrls={photos[q.id] || []}
                onChangePhoto={q.show_photo ? (urls) => handlePhoto(q.id, urls) : undefined}
                showComment={q.show_comment}
                comment={comments[q.id] || ''}
                onChangeComment={q.show_comment ? (c) => handleComment(q.id, c) : undefined}
              />
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
