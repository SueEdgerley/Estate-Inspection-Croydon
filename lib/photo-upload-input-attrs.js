/**
 * File-input attributes for PhotoUploadControl camera vs gallery paths.
 * Camera always uses capture so mobile opens the rear camera; gallery never sets capture.
 */

export const PHOTO_ACCEPT_CAMERA = 'image/*'
export const PHOTO_ACCEPT_GALLERY =
  'image/jpeg,image/png,image/gif,image/webp,image/heic'

/**
 * @param {{ multiple?: boolean }} [options]
 * @returns {{
 *   camera: { accept: string, capture: 'environment', multiple: false },
 *   gallery: { accept: string, multiple: boolean, capture?: undefined }
 * }}
 */
export function getPhotoUploadInputAttrs({ multiple = true } = {}) {
  return {
    camera: {
      accept: PHOTO_ACCEPT_CAMERA,
      capture: 'environment',
      // Capture + multiple is unreliable on many mobiles; take one shot per open.
      multiple: false,
    },
    gallery: {
      accept: PHOTO_ACCEPT_GALLERY,
      multiple: !!multiple,
    },
  }
}
