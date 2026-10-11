const CACHE_PREFIX = 'pack-go-'
const SHELL_CACHE = `${CACHE_PREFIX}shell-v1`
const STATIC_CACHE = `${CACHE_PREFIX}static-v1`
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/app-icon.svg',
  '/favicon.svg',
  '/icons.svg',
]
const PUBLIC_STATIC_PATHS = new Set([
  '/manifest.webmanifest',
  '/app-icon.svg',
  '/favicon.svg',
  '/icons.svg',
])
const BACKEND_PATH = /^\/(?:api(?:\/|$)|plan(?:\/|$)|auth(?:\/|$)|rest\/v1(?:\/|$)|storage\/v1(?:\/|$)|functions\/v1(?:\/|$)|graphql(?:\/|$)|supabase(?:\/|$))/
const STATIC_DIRECTORIES = ['/assets/', '/images/', '/fonts/']
const STATIC_DESTINATIONS = new Set(['script', 'style', 'image', 'font', 'manifest'])

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(SHELL_CACHE)
      await Promise.all(APP_SHELL.map(async (url) => {
        try {
          await cache.add(url)
        } catch (error) {
          console.warn(`Unable to precache app shell resource: ${url}`, error)
        }
      }))
    } catch (error) {
      console.warn('Unable to initialize the app shell cache.', error)
    }

    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const cacheNames = await caches.keys()
      await Promise.all(cacheNames
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== SHELL_CACHE && name !== STATIC_CACHE)
        .map((name) => caches.delete(name)))
    } catch (error) {
      console.warn('Unable to clean up old app caches.', error)
    }

    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const requestUrl = new URL(request.url)

  if (request.method !== 'GET' || requestUrl.origin !== self.location.origin) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  if (BACKEND_PATH.test(requestUrl.pathname) || !isCacheableStaticRequest(request, requestUrl)) {
    return
  }

  event.respondWith(cacheFirstStatic(request))
})

function isCacheableStaticRequest(request, requestUrl) {
  if (requestUrl.search || request.headers.has('authorization')) {
    return false
  }

  const isKnownPublicAsset = PUBLIC_STATIC_PATHS.has(requestUrl.pathname)
  const isStaticDirectoryAsset = STATIC_DIRECTORIES.some((directory) => requestUrl.pathname.startsWith(directory))

  return (isKnownPublicAsset || isStaticDirectoryAsset)
    && (!request.destination || STATIC_DESTINATIONS.has(request.destination))
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request)
  } catch (error) {
    try {
      const shellCache = await caches.open(SHELL_CACHE)
      const fallback = await shellCache.match('/index.html')
      if (fallback) {
        return fallback
      }
    } catch (cacheError) {
      console.warn('Unable to read the cached app shell.', cacheError)
    }

    throw error
  }
}

async function cacheFirstStatic(request) {
  let cache
  let cachedResponse

  try {
    cache = await caches.open(STATIC_CACHE)
    cachedResponse = await cache.match(request)
    if (cachedResponse) {
      return cachedResponse
    }
  } catch (error) {
    console.warn('Unable to read the static asset cache.', error)
  }

  try {
    const response = await fetch(request, { credentials: 'omit' })
    if (isCacheableResponse(response)) {
      try {
        cache = cache || await caches.open(STATIC_CACHE)
        await cache.put(request, response.clone())
      } catch (error) {
        console.warn('Unable to cache a static asset.', error)
      }
    }
    return response
  } catch (error) {
    if (cachedResponse) {
      return cachedResponse
    }
    throw error
  }
}

function isCacheableResponse(response) {
  const cacheControl = response.headers.get('cache-control') || ''
  const varyHeaders = (response.headers.get('vary') || '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
  const responseUrl = response.url ? new URL(response.url) : null

  return response.status === 200
    && response.type === 'basic'
    && !/\b(?:no-store|private)\b/i.test(cacheControl)
    && !response.headers.has('set-cookie')
    && !varyHeaders.some((header) => ['*', 'cookie', 'authorization'].includes(header))
    && (!responseUrl || (
      responseUrl.origin === self.location.origin
      && !BACKEND_PATH.test(responseUrl.pathname)
    ))
}
