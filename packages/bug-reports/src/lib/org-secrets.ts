import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ENCRYPTION_VERSION = "v1"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

export const ORG_SECRETS_ENCRYPTION_KEY_BYTES = 32
export const ORG_SECRETS_ENCRYPTION_KEY_NAME = "ORG_SECRETS_ENCRYPTION_KEY"

export function parseOrgSecretsEncryptionKey(
  raw: string | null | undefined
): Buffer | null {
  if (raw == null) {
    return null
  }

  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return null
  }

  const decoded = Buffer.from(trimmed, "base64")
  if (decoded.length !== ORG_SECRETS_ENCRYPTION_KEY_BYTES) {
    return null
  }

  return decoded
}

export function getOrgSecretsEncryptionKeyUnavailableReason(
  raw: string | null | undefined
): string | null {
  if (raw == null || raw.trim().length === 0) {
    return `${ORG_SECRETS_ENCRYPTION_KEY_NAME} is not configured. Generate a 32-byte key with \`openssl rand -base64 32\` and set it on the server.`
  }

  if (parseOrgSecretsEncryptionKey(raw) == null) {
    return `${ORG_SECRETS_ENCRYPTION_KEY_NAME} must be 32 bytes encoded as standard base64.`
  }

  return null
}

export function orgSecretLastFour(secret: string): string {
  return secret.slice(-4)
}

export function maskOrgSecret(lastFour: string): string {
  return `••••••••${lastFour}`
}

export function encryptOrgSecret(input: {
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

export function decryptOrgSecret(input: {
  encrypted: string
  encryptionKey: Buffer
}): string {
  const [version, ivPart, ciphertextPart, tagPart] = input.encrypted.split(".")
  if (
    version !== ENCRYPTION_VERSION ||
    !ivPart ||
    !ciphertextPart ||
    !tagPart
  ) {
    throw new Error("Organization secret could not be decrypted.")
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
