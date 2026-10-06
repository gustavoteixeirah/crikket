import { describe, expect, it } from "bun:test"
import { randomBytes } from "node:crypto"
import {
  decryptOrgSecret,
  encryptOrgSecret,
  getOrgSecretsEncryptionKeyUnavailableReason,
  maskOrgSecret,
  orgSecretLastFour,
  parseOrgSecretsEncryptionKey,
} from "../src/lib/org-secrets"

function sampleKey(): Buffer {
  return randomBytes(32)
}

describe("org secrets encryption", () => {
  it("round-trips AES-256-GCM and refuses the wrong key", () => {
    const encryptionKey = sampleKey()
    const secret = "sk-test-openai-key-abcdef1234"
    const encrypted = encryptOrgSecret({ encryptionKey, secret })

    expect(encrypted.startsWith("v1.")).toBe(true)
    expect(decryptOrgSecret({ encrypted, encryptionKey })).toBe(secret)
    expect(orgSecretLastFour(secret)).toBe("1234")
    expect(maskOrgSecret("1234")).toBe("••••••••1234")

    expect(() =>
      decryptOrgSecret({
        encrypted,
        encryptionKey: sampleKey(),
      })
    ).toThrow()
  })

  it("parses a 32-byte base64 key and treats missing or invalid values as unavailable", () => {
    const raw = sampleKey().toString("base64")
    expect(parseOrgSecretsEncryptionKey(raw)?.length).toBe(32)
    expect(parseOrgSecretsEncryptionKey(undefined)).toBeNull()
    expect(parseOrgSecretsEncryptionKey("")).toBeNull()
    expect(parseOrgSecretsEncryptionKey("not-base64-32-bytes")).toBeNull()
    expect(getOrgSecretsEncryptionKeyUnavailableReason(undefined)).toContain(
      "ORG_SECRETS_ENCRYPTION_KEY is not configured"
    )
    expect(getOrgSecretsEncryptionKeyUnavailableReason("short")).toContain(
      "32 bytes"
    )
    expect(getOrgSecretsEncryptionKeyUnavailableReason(raw)).toBeNull()
  })
})
