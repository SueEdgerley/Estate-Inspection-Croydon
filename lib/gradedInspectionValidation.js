/**
 * Compare template graded questions to persisted inspection_answers for analytics QA.
 */

function walkGradedQuestions(templateVersion) {
  const list = []
  const sections = Array.isArray(templateVersion?.sections) ? templateVersion.sections : []
  for (const sec of sections) {
    const questions = Array.isArray(sec?.questions) ? sec.questions : []
    for (const q of questions) {
      if (String(q?.question_type || '').toLowerCase() === 'graded') {
        list.push({
          question_id: q.id,
          question_text: q.question_text ?? q.label ?? '',
          section_id: sec.id,
          section_title: sec.title ?? sec.name ?? '',
          grading_scheme_id: q.grading_scheme_id ?? null,
          grading_scheme_name: q.grading_scheme_name ?? null,
        })
      }
    }
  }
  return list
}

/**
 * @param {object} templateVersion - inspections.template_version JSON
 * @param {Array<{ question_id: string, question_type: string, answer_value: string|null, answer_text: string|null, answer_number: unknown }>} answerRows
 */
export function buildGradedValidationReport(templateVersion, answerRows) {
  const expected = walkGradedQuestions(templateVersion)
  const byQid = new Map(answerRows.map((r) => [r.question_id, r]))

  const perQuestion = expected.map((exp) => {
    const row = byQid.get(exp.question_id)
    const stored = row
      ? row.answer_value ?? row.answer_text ?? (row.answer_number != null ? String(row.answer_number) : null)
      : null
    const trimmed = stored != null ? String(stored).trim() : ''
    const questionTypeOk = row ? String(row.question_type || '').toLowerCase() === 'graded' : false
    return {
      ...exp,
      has_answer_row: !!row,
      question_type_in_db: row?.question_type ?? null,
      question_type_ok: questionTypeOk,
      stored_grade: trimmed || null,
      has_value: trimmed !== '',
    }
  })

  const extraGradedRows = answerRows.filter((r) => {
    if (String(r.question_type || '').toLowerCase() !== 'graded') return false
    return !expected.some((e) => e.question_id === r.question_id)
  })

  const missingInTemplate = extraGradedRows.map((r) => ({
    question_id: r.question_id,
    question_type: r.question_type,
  }))

  const allExpectedHaveTypeAndValue = perQuestion.every(
    (p) => (!p.has_value) || (p.question_type_ok && p.has_value)
  )

  return {
    expected_graded_count: expected.length,
    expected_graded_question_ids: expected.map((e) => e.question_id),
    per_question: perQuestion,
    graded_rows_not_in_template: missingInTemplate,
    summary: {
      all_graded_questions_have_db_type_graded: perQuestion.filter((p) => p.has_value).every((p) => p.question_type_ok),
      any_expected_missing_answer_row: perQuestion.some((p) => !p.has_answer_row && p.has_value === false),
      note:
        'deriveInspectionGrading uses template question_type === graded and answer values; ' +
        'v_graded_inspection_answers_analytics includes rows when template or DB marks graded.',
    },
    all_expected_have_type_and_value,
  }
}
