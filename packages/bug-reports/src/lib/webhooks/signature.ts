import { createHmac, timingSafeEqual } from "node:crypto"

import {
  WEBHOOK_SIGNATURE_PREFIX,
  WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
} from "./constants"

export function buildWebhookSignedPayload(input: {
  body: string
  timestamp: string
}): string {
  return `${input.timestamp}.${input.body}`
}

export function signWebhookPayload(input: {
  body: string
  secret: string
  timestamp: string
}): string {
  const digest = createHmac("sha256", input.secret)
    .update(buildWebhookSignedPayload(input), "utf8")
    .digest("hex")

  return `${WEBHOOK_SIGNATURE_PREFIX}${digest}`
}

export function verifyWebhookSignature(input: {
  body: string
  nowSeconds?: number
  secret: string
  signatureHeader: string
  timestampHeader: string
  toleranceSeconds?: number
}): boolean {
  const timestamp = Number(input.timestampHeader)
  if (!Number.isInteger(timestamp) || timestamp <= 0) {
    return false
  }

  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  const tolerance =
    input.toleranceSeconds ?? WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS
  if (Math.abs(nowSeconds - timestamp) > tolerance) {
    return false
  }

  const expected = signWebhookPayload({
    body: input.body,
    secret: input.secret,
    timestamp: input.timestampHeader,
  })

  return timingSafeEqualText(expected, input.signatureHeader)
}

function timingSafeEqualText(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}
