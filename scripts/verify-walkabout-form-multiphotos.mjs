/**
 * Trace Walkabout form multi-photo shape: checklist item → draft merge → submit payload.
 * (Self-contained — avoids Next `@/` aliases under plain node.)
 * Run: node scripts/verify-walkabout-form-multiphotos.mjs
 */

import assert from 'node:assert/strict'

const MAX_ACTION_PHOTOS = 5
const CHECKLIST_QID = 'ew_checklist_json'

function normalizeActionPhotoUrls(raw) {
  if (Array.isArray(raw)) return raw.filter((url) => typeof url === 'string' && url.trim())
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return normalizeActionPhotoUrls(JSON.parse(raw))
    } catch {
      return raw.startsWith('http') ? [raw] : []
    }
  }
  return []
}

function capActionPhotoUrls(urls, max = MAX_ACTION_PHOTOS) {
  return normalizeActionPhotoUrls(urls).slice(0, Math.max(1, Number(max) || MAX_ACTION_PHOTOS))
}

function mergeAnswerExtrasPatch(submitBody, questionId, patch) {
  if (!submitBody || typeof submitBody !== 'object') return submitBody
  return {
    ...submitBody,
    answer_extras: {
      ...(submitBody.answer_extras || {}),
      [questionId]: {
        ...((submitBody.answer_extras || {})[questionId] || {}),
        ...patch,
      },
    },
  }
}

function mergeWalkaboutChecklistItemPhotoUrls(submitBody, checklistQuestionId, itemId, urls) {
  if (!submitBody || typeof submitBody !== 'object') return submitBody
  const answers = { ...(submitBody.answers || {}) }
  let checklist = []
  try {
    checklist = JSON.parse(answers[checklistQuestionId] || '[]')
  } catch {
    checklist = []
  }
  if (!Array.isArray(checklist)) checklist = []
  const nextUrls = Array.isArray(urls) ? urls.filter((u) => typeof u === 'string' && u.trim()) : []
  const nextChecklist = checklist.map((item) =>
    item?.id === itemId ? { ...item, photo_urls: nextUrls } : item
  )
  return {
    ...submitBody,
    answers: {
      ...answers,
      [checklistQuestionId]: JSON.stringify(nextChecklist),
    },
  }
}

const three = [
  'https://cdn.example/a.jpg',
  'https://cdn.example/b.jpg',
  'https://cdn.example/c.jpg',
]

assert.equal(MAX_ACTION_PHOTOS >= 3, true)
assert.deepEqual(capActionPhotoUrls(three), three)
assert.deepEqual(normalizeActionPhotoUrls(JSON.stringify(three)), three)

let state = []
state = capActionPhotoUrls([...state, three[0]])
state = capActionPhotoUrls([...state, three[1]])
state = capActionPhotoUrls([...state, three[2]])
assert.deepEqual(state, three)

let submitBody = {
  answers: {
    [CHECKLIST_QID]: JSON.stringify([
      {
        id: 'item-1',
        description: 'Broken gate',
        photo_urls: [],
        action_required: true,
        action_summary: 'Repair gate',
        order_raised_number: '',
      },
    ]),
  },
  answer_extras: {},
}

submitBody = mergeWalkaboutChecklistItemPhotoUrls(submitBody, CHECKLIST_QID, 'item-1', [three[0]])
submitBody = mergeWalkaboutChecklistItemPhotoUrls(submitBody, CHECKLIST_QID, 'item-1', [
  three[0],
  three[1],
])
submitBody = mergeWalkaboutChecklistItemPhotoUrls(submitBody, CHECKLIST_QID, 'item-1', three)

const checklist = JSON.parse(submitBody.answers[CHECKLIST_QID])
assert.deepEqual(checklist[0].photo_urls, three)
assert.equal('photo_url' in checklist[0], false)

submitBody = mergeAnswerExtrasPatch(submitBody, 'ew_it_graffiti', { photo_urls: three })
assert.deepEqual(submitBody.answer_extras.ew_it_graffiti.photo_urls, three)

const actionRow = {
  question_id: `ew_chk_${checklist[0].id}`,
  photo_urls: normalizeActionPhotoUrls(checklist[0].photo_urls),
}
assert.equal(actionRow.photo_urls.length, 3)

const afterRemove = three.filter((u) => u !== three[1])
submitBody = mergeWalkaboutChecklistItemPhotoUrls(submitBody, CHECKLIST_QID, 'item-1', afterRemove)
assert.deepEqual(JSON.parse(submitBody.answers[CHECKLIST_QID])[0].photo_urls, afterRemove)

const legacyItem = { id: 'legacy', photo_url: 'https://cdn.example/legacy.jpg', photo_urls: [] }
const hydratedLegacy = {
  ...legacyItem,
  photo_urls: capActionPhotoUrls(
    normalizeActionPhotoUrls(legacyItem.photo_urls).length
      ? legacyItem.photo_urls
      : legacyItem.photo_url
  ),
}
assert.deepEqual(hydratedLegacy.photo_urls, ['https://cdn.example/legacy.jpg'])

console.log('verify-walkabout-form-multiphotos: ok')
console.log(
  JSON.stringify(
    {
      maxActionPhotos: MAX_ACTION_PHOTOS,
      threePhotoActionSurvives: true,
      checklistPhotoUrls: JSON.parse(submitBody.answers[CHECKLIST_QID])[0].photo_urls,
      extrasPhotoUrls: submitBody.answer_extras.ew_it_graffiti.photo_urls,
      actionRowPhotoUrls: actionRow.photo_urls,
    },
    null,
    2
  )
)
