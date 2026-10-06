export type AuthEmailDeliveryDecision =
  | { action: "send" }
  | { action: "skip"; reason: string }
  | { action: "error"; message: string }

export function resolveAuthEmailDelivery(input: {
  hasApiKey: boolean
  hasFromEmail: boolean
  nodeEnv: string
  requireDelivery: boolean
}): AuthEmailDeliveryDecision {
  if (input.hasApiKey && input.hasFromEmail) {
    return { action: "send" }
  }

  const missingKeyReason = "Missing RESEND_API_KEY"
  const missingFromReason = "Missing RESEND_FROM_EMAIL"

  if (!input.requireDelivery) {
    return {
      action: "skip",
      reason: input.hasApiKey ? missingFromReason : missingKeyReason,
    }
  }

  if (!input.hasApiKey) {
    if (input.nodeEnv === "production") {
      return {
        action: "error",
        message:
          "Missing RESEND_API_KEY. Set RESEND_API_KEY in apps/server/.env.",
      }
    }

    return {
      action: "skip",
      reason: missingKeyReason,
    }
  }

  return {
    action: "error",
    message:
      "Missing RESEND_FROM_EMAIL. Set RESEND_FROM_EMAIL in apps/server/.env.",
  }
}

export function isAuthEmailProviderConfigured(input: {
  hasApiKey: boolean
  hasFromEmail: boolean
}): boolean {
  return (
    resolveAuthEmailDelivery({
      hasApiKey: input.hasApiKey,
      hasFromEmail: input.hasFromEmail,
      nodeEnv: "production",
      requireDelivery: false,
    }).action === "send"
  )
}
