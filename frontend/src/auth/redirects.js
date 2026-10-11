const PRODUCTION_FRONTEND_URL = 'https://grevix-ai-trip-weaver.vercel.app'

export function getAuthRedirectUrl(path, currentOrigin, isProduction = Boolean((import.meta.env || {}).PROD)) {
  const origin = isProduction ? PRODUCTION_FRONTEND_URL : currentOrigin
  return new URL(path, origin).toString()
}
