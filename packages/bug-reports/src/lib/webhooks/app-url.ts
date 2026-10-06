import { env } from "@crikket/env/server"

const TRAILING_SLASHES = /\/+$/

export function isWebhookPrivateUrlAllowed(): boolean {
  return env.WEBHOOK_ALLOW_PRIVATE_URLS
}

export function resolveWebhookAppBaseUrl(): string {
  const configured = env.WEBHOOK_APP_BASE_URL?.replace(TRAILING_SLASHES, "")
  if (configured) {
    return configured
  }

  const corsOrigin = env.CORS_ORIGINS?.[0]?.replace(TRAILING_SLASHES, "")
  if (corsOrigin) {
    return corsOrigin
  }

  return env.BETTER_AUTH_URL.replace(TRAILING_SLASHES, "")
}

export function buildBugReportAppUrl(reportId: string): string {
  return `${resolveWebhookAppBaseUrl()}/s/${reportId}`
}
