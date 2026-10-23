import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_MEDIA_REFERENCES,
  parseMediaReferences,
  validateMediaReferences,
} from '../src/components/tripJournalValidation.js'

test('accepts absolute HTTP and HTTPS media URLs and ignores blank lines', () => {
  assert.equal(validateMediaReferences('https://example.com/photo.jpg\n\nhttp://example.com/video'), '')
  assert.deepEqual(
    parseMediaReferences('https://example.com/photo.jpg\n \nhttp://example.com/video\n'),
    ['https://example.com/photo.jpg', 'http://example.com/video'],
  )
})

test('rejects malformed URLs, unsupported protocols, missing hostnames, and credentials', () => {
  for (const value of [
    'https://[invalid',
    'ftp://example.com/photo.jpg',
    'https:///photo.jpg',
    'https://user:password@example.com/photo.jpg',
  ]) {
    assert.match(validateMediaReferences(value), /absolute HTTP or HTTPS URLs with a hostname/)
  }
})

test('accepts up to ten non-blank media references and rejects an eleventh', () => {
  const tenReferences = Array.from({ length: MAX_MEDIA_REFERENCES }, (_, index) =>
    `https://example.com/${index}.jpg`,
  )
  assert.equal(validateMediaReferences(tenReferences.join('\n')), '')
  assert.equal(
    validateMediaReferences([...tenReferences, 'https://example.com/10.jpg'].join('\n')),
    'Add no more than 10 media links.',
  )
  assert.equal(validateMediaReferences(`${tenReferences[0]}\n\n`), '')
})
