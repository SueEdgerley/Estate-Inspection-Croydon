export const RETIRED_BLOCK_LOCATION_MESSAGE =
  'This saved location is no longer in the current list. Your answers and photos are still here. Select the current block before submitting.'

function activeBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : []).filter((block) => block != null && block.active !== false)
}

/**
 * A grounds site id is not a block. An empty id needs no retired-block warning.
 * Any other id must still be in the current active list.
 */
export function retiredBlockResumeNotice(blockId, blocks) {
  const id = String(blockId || '').trim()
  if (!id || id.startsWith('gm:')) return ''
  const current = activeBlocks(blocks).some((block) => String(block.id) === id)
  return current ? '' : RETIRED_BLOCK_LOCATION_MESSAGE
}

/**
 * Keep answers and photos. Clear only a block id that is no longer active.
 */
export function resumeDraftWithCurrentBlocks(payload, blocks) {
  const blockId = String(payload?.blockId || '').trim()
  const notice = retiredBlockResumeNotice(blockId, blocks)
  return {
    blockId: notice ? '' : blockId,
    answers: payload?.answers && typeof payload.answers === 'object' ? payload.answers : {},
    photos: Array.isArray(payload?.photos) ? payload.photos : [],
    notice,
  }
}
