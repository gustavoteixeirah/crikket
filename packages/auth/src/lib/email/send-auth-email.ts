import { env } from "@crikket/env/server"
import { render } from "@react-email/render"
import type { ReactElement } from "react"
import { Resend } from "resend"

import {
  executeAuthEmailSend,
  isAuthEmailProviderConfigured,
  resolveAuthEmailDelivery,
} from "../auth-email-delivery"

type SendAuthEmailInput = {
  to: string
  subject: string
  text: string
  react: ReactElement
  requireDelivery?: boolean
}

const resendClient = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null
const fromEmail = env.RESEND_FROM_EMAIL
const fromName = "Crikket"

export function isAuthEmailConfigured(): boolean {
  return isAuthEmailProviderConfigured({
    hasApiKey: Boolean(env.RESEND_API_KEY),
    hasFromEmail: Boolean(env.RESEND_FROM_EMAIL),
  })
}

export const sendAuthEmail = async ({
  to,
  subject,
  text,
  react,
  requireDelivery = true,
}: SendAuthEmailInput): Promise<{ delivered: boolean }> => {
  const decision = resolveAuthEmailDelivery({
    hasApiKey: Boolean(resendClient),
    hasFromEmail: Boolean(fromEmail),
    nodeEnv: env.NODE_ENV,
    requireDelivery,
  })

  if (decision.action === "error") {
    throw new Error(decision.message)
  }

  if (decision.action === "skip" || !resendClient || !fromEmail) {
    const reason =
      decision.action === "skip"
        ? decision.reason
        : "Email provider unavailable"
    console.warn(`[email] ${reason}. Skipping email delivery for ${to}.`)
    return { delivered: false }
  }

  return await executeAuthEmailSend({
    requireDelivery,
    to,
    send: async () => {
      const html = await render(react)

      const { error } = await resendClient.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to,
        subject,
        html,
        text,
      })

      if (error) {
        throw new Error(`Failed to send auth email: ${error.message}`)
      }
    },
  })
}
