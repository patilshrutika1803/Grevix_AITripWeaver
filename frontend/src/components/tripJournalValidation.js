export const MAX_MEDIA_REFERENCES = 10

export function parseMediaReferences(value) {
  return value.split('\n').map(reference => reference.trim()).filter(Boolean)
}

export function validateMediaReferences(value) {
  const references = parseMediaReferences(value)
  if (references.length > MAX_MEDIA_REFERENCES) {
    return `Add no more than ${MAX_MEDIA_REFERENCES} media links.`
  }

  for (const reference of references) {
    if (!/^https?:\/\/[^/?#]+/i.test(reference)) {
      return 'Media links must be absolute HTTP or HTTPS URLs with a hostname and cannot include credentials.'
    }
    try {
      const url = new URL(reference)
      if (
        !['http:', 'https:'].includes(url.protocol)
        || !url.hostname
        || url.username
        || url.password
      ) {
        return 'Media links must be absolute HTTP or HTTPS URLs with a hostname and cannot include credentials.'
      }
    } catch {
      return 'Media links must be absolute HTTP or HTTPS URLs with a hostname and cannot include credentials.'
    }
  }
  return ''
}
