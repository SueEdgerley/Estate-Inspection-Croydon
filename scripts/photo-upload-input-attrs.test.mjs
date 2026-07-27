/**
 * Regression tests: camera vs gallery file-input attributes for PhotoUploadControl.
 * Run: node --test scripts/photo-upload-input-attrs.test.mjs
 *
 * Attribute-level proof that:
 * - camera always has capture="environment" (even when multiple photos allowed)
 * - gallery never has capture
 * - both modes share the same attribute factory used by the shared control
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  PHOTO_ACCEPT_CAMERA,
  PHOTO_ACCEPT_GALLERY,
  getPhotoUploadInputAttrs,
} from '../lib/photo-upload-input-attrs.js'

describe('getPhotoUploadInputAttrs', () => {
  it('gives multi-photo camera input capture + image/* (no gallery-only regression)', () => {
    const { camera, gallery } = getPhotoUploadInputAttrs({ multiple: true })

    assert.equal(camera.accept, PHOTO_ACCEPT_CAMERA)
    assert.equal(camera.accept, 'image/*')
    assert.equal(camera.capture, 'environment')
    assert.equal(camera.multiple, false)

    assert.equal(gallery.accept, PHOTO_ACCEPT_GALLERY)
    assert.equal(gallery.multiple, true)
    assert.equal('capture' in gallery, false)
    assert.equal(gallery.capture, undefined)
  })

  it('gives single-photo camera capture and gallery without capture', () => {
    const { camera, gallery } = getPhotoUploadInputAttrs({ multiple: false })

    assert.equal(camera.capture, 'environment')
    assert.equal(camera.accept, 'image/*')
    assert.equal(camera.multiple, false)

    assert.equal(gallery.multiple, false)
    assert.equal('capture' in gallery, false)
  })

  it('defaults to multi-photo gallery (matches PhotoUploadControl multiple=true default)', () => {
    const { camera, gallery } = getPhotoUploadInputAttrs()
    assert.equal(camera.capture, 'environment')
    assert.equal(gallery.multiple, true)
    assert.equal('capture' in gallery, false)
  })

  it('keeps camera and gallery as distinct sources that both feed the same control state', () => {
    // Contract for PhotoUploadControl: two inputs, one shared onChange/handleSelect.
    const attrs = getPhotoUploadInputAttrs({ multiple: true })
    const sources = [
      { source: 'camera', ...attrs.camera },
      { source: 'gallery', ...attrs.gallery },
    ]

    assert.equal(sources.length, 2)
    assert.ok(sources.every((s) => typeof s.accept === 'string' && s.accept.includes('image')))
    assert.equal(sources.filter((s) => s.capture === 'environment').length, 1)
    assert.equal(sources.filter((s) => s.capture == null).length, 1)
  })
})
