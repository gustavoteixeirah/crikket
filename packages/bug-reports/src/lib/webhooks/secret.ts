import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"

import { WEBHOOK_SECRET_PREFIX } from "./constants"

const ENCRYPTION_VERSION = "v1"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const SECRET_RANDOM_BYTES = 32

export function generateWebhookSigningSecret(): string {
  return `${WEBHOOK_SECRET_PREFIX}${randomBytes(SECRET_RANDOM_BYTES).toString("base64url")}`
}

export function webhookSecretLastFour(secret: string): string {
  return secret.slice(-4)
}

export function maskWebhookSecret(lastFour: string): string {
  return `${WEBHOOK_SECRET_PREFIX}${"•".repeat(8)}${lastFour}`
}

export function deriveWebhookEncryptionKey(secretMaterial: string): Buffer {
  return createHash("sha256")
    .update("crikket.webhook.secret.v1")
    .update(secretMaterial)
    .digest()
}

export function encryptWebhookSecret(input: {
  encryptionKey: Buffer
  secret: string
}): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv("aes-256-gcm", input.encryptionKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })
  const ciphertext = Buffer.concat([
    cipher.update(input.secret, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".")
}

export function decryptWebhookSecret(input: {
  encryptionKey: Buffer
  encrypted: string
}): string {
  const [version, ivPart, ciphertextPart, tagPart] = input.encrypted.split(".")
  if (
    version !== ENCRYPTION_VERSION ||
    !ivPart ||
    !ciphertextPart ||
    !tagPart
  ) {
    throw new Error("Webhook signing secret could not be decrypted.")
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    input.encryptionKey,
    Buffer.from(ivPart, "base64url"),
    { authTagLength: AUTH_TAG_LENGTH }
  )
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final(),
  ])

  return plaintext.toString("utf8")
}
