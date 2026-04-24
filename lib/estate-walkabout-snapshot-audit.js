/**
 * Read-only analysis of a persisted template_version JSON snapshot.
 * Use for ?walkabout_audit=1 on GET /api/inspections/:id and scripts.
 */
import { isEstateWalkaboutTemplateVersion } from './estate-walkabout-template'

const EW_IDS = {
  S1: 'ew_sec_staff',
  S3: 'ew_sec_overall',
  S5: 'ew_sec_signature',
  Q_OS: 'ew_os_overall_grade',
  Q_SIG1: 'ew_sig_signature',
  Q_SIG2: 'ew_sig_inspection_date',
}

/**
 * @param {import('./estate-walkabout-template').EstateWalkaboutTemplateVersion} tv
 * @param {{ template_version_id?: string | null }} [meta]
 */
export function auditEstateWalkaboutSnapshot(tv, meta = {}) {
  if (!tv || typeof tv !== 'object') {
    return {
      matchedWalkabout: false,
      reason: 'no_snapshot',
      template_version_id: meta.template_version_id ?? null,
    }
  }

  const matched = isEstateWalkaboutTemplateVersion(tv)
  const sections = Array.isArray(tv.sections) ? tv.sections : []
  const perSection = sections.map((sec, index) => {
    const questions = (sec.questions || []).map((q) => ({
      id: q.id,
      label: (q.label ?? q.question_text ?? '').slice(0, 200),
      question_type: q.question_type ?? q.answer_mode ?? null,
      include_photo: !!(q.include_photo ?? false),
      type_includes_photo: !!(q.type_includes_photo ?? false),
      comment_required_when: q.comment_required_when ?? null,
      photo_required_when: q.photo_required_when ?? null,
    }))
    return {
      index: index + 1,
      id: sec.id,
      title: sec.title ?? sec.name ?? null,
      questionCount: questions.length,
      questions,
    }
  })

  const findSec = (id) => perSection.find((s) => s.id === id) || null
  const s1 = findSec(EW_IDS.S1)
  const s3 = findSec(EW_IDS.S3)
  const s5 = findSec(EW_IDS.S5)

  const s1AnyPhoto = !!(
    s1 &&
    s1.questions?.some(
      (q) => q.include_photo || q.type_includes_photo || q.photo_required_when
    )
  )

  const osQ = s3 ? s3.questions?.find((q) => q.id === EW_IDS.Q_OS) : null
  const section3HasInternalCleanlinessGraded = !!(
    osQ &&
    String(osQ.label || '')
      .toLowerCase()
      .includes('internal cleanliness') &&
    String(osQ.question_type || '')
      .toLowerCase()
      .includes('grad')
  )

  const s5Wording = {
    sectionHelp:
      (sections.find((s) => s.id === EW_IDS.S5)?.help_text || '').trim() || null,
    qSignature: s5 ? s5.questions?.find((q) => q.id === EW_IDS.Q_SIG1)?.label : null,
    qDate: s5 ? s5.questions?.find((q) => q.id === EW_IDS.Q_SIG2)?.label : null,
  }
  const section5ExpectedPhrases = /signature|inspection|date|true record/i
  const section5WordingOk =
    !!s5Wording.qSignature &&
    !!s5Wording.qDate &&
    (section5ExpectedPhrases.test(String(s5Wording.sectionHelp || '')) ||
      (section5ExpectedPhrases.test(String(s5Wording.qSignature)) &&
        /date|inspection/i.test(String(s5Wording.qDate || '')))

  return {
    matchedWalkabout: matched,
    template_version_id: meta.template_version_id ?? null,
    snapshot_id: tv.id ?? null,
    template_key: tv.template_key ?? null,
    template_type: tv.template_type ?? tv.type ?? null,
    perSection,
    fieldCounts: {
      sections: perSection.length,
      questions: perSection.reduce((a, s) => a + (s.questionCount || 0), 0),
      withIncludePhoto: perSection.reduce(
        (a, s) => a + (s.questions || []).filter((q) => q.include_photo).length,
        0
      ),
      withPhotoRequiredWhen: perSection.reduce(
        (a, s) => a + (s.questions || []).filter((q) => q.photo_required_when).length,
        0
      ),
    },
    checks: {
      section1HasPhotoInSnapshot: s1AnyPhoto,
      section3InternalCleanlinessGradedQuestion: section3HasInternalCleanlinessGraded,
      section3OverallGradeIdPresent: !!osQ,
      section5SignatureWording: section5WordingOk,
      section5HelpText: s5Wording,
    },
  }
}
