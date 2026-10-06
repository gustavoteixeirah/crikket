import { describe, expect, it } from "bun:test"
import {
  authenticateOrganizationApiKey,
  createOrganizationApiKey,
  generateOrganizationApiKeySecret,
  hashesEqual,
  hashOrganizationApiKey,
  isOrganizationApiKeySecretFormat,
  listOrganizationApiKeys,
  ORGANIZATION_API_KEY_PREFIX,
  type OrganizationApiKeyRecord,
  type OrganizationApiKeyStore,
  parseBearerToken,
  revokeOrganizationApiKey,
} from "../src/lib/organization-api-keys"

function createMemoryStore(
  seed: OrganizationApiKeyRecord[] = []
): OrganizationApiKeyStore & { records: OrganizationApiKeyRecord[] } {
  const records = [...seed]

  return {
    records,
    findByHash(keyHash) {
      return Promise.resolve(
        records.find((record) => record.keyHash === keyHash) ?? null
      )
    },
    insert(input) {
      const now = new Date("2026-10-06T00:00:00.000Z")
      const record: OrganizationApiKeyRecord = {
        createdAt: now,
        createdBy: input.createdBy,
        id: input.id,
        keyHash: input.keyHash,
        keyPrefix: input.keyPrefix,
        label: input.label,
        lastUsedAt: null,
        organizationId: input.organizationId,
        revokedAt: null,
        scope: input.scope,
        updatedAt: now,
      }
      records.push(record)
      return Promise.resolve(record)
    },
    listByOrganizationId(organizationId) {
      return Promise.resolve(
        records.filter((record) => record.organizationId === organizationId)
      )
    },
    revoke(input) {
      const record = records.find(
        (entry) =>
          entry.id === input.keyId &&
          entry.organizationId === input.organizationId &&
          entry.revokedAt === null
      )
      if (!record) {
        return Promise.resolve(false)
      }

      record.revokedAt = new Date("2026-10-06T01:00:00.000Z")
      return Promise.resolve(true)
    },
    touchLastUsedAt(input) {
      const record = records.find((entry) => entry.id === input.keyId)
      if (record) {
        record.lastUsedAt = input.lastUsedAt
      }
      return Promise.resolve()
    },
  }
}

describe("organization API keys", () => {
  it("parses Bearer tokens and rejects missing or non-bearer headers", () => {
    expect(parseBearerToken("Bearer crik_ak_test")).toBe("crik_ak_test")
    expect(parseBearerToken("bearer crik_ak_test")).toBe("crik_ak_test")
    expect(parseBearerToken("Basic abc")).toBeNull()
    expect(parseBearerToken(null)).toBeNull()
  })

  it("hashes secrets stably and compares them in constant time", () => {
    const generated = generateOrganizationApiKeySecret()
    expect(generated.secret.startsWith(ORGANIZATION_API_KEY_PREFIX)).toBeTrue()
    expect(isOrganizationApiKeySecretFormat(generated.secret)).toBeTrue()
    expect(hashOrganizationApiKey(generated.secret)).toBe(generated.hash)
    expect(hashesEqual(generated.hash, generated.hash)).toBeTrue()
    expect(
      hashesEqual(generated.hash, hashOrganizationApiKey("other"))
    ).toBeFalse()
  })

  it("returns the plaintext key only at creation time", async () => {
    const store = createMemoryStore()
    const created = await createOrganizationApiKey(
      {
        createdBy: "user_1",
        label: "Cursor agent",
        organizationId: "org_a",
      },
      store
    )

    expect(created.key.startsWith(ORGANIZATION_API_KEY_PREFIX)).toBeTrue()
    expect(created.keyPrefix).toBe(created.key.slice(0, 12))
    expect(store.records[0]?.keyHash).toBe(hashOrganizationApiKey(created.key))
    expect("keyHash" in created).toBeFalse()

    const listed = await listOrganizationApiKeys(
      { organizationId: "org_a" },
      store
    )
    expect(listed).toHaveLength(1)
    expect("key" in listed[0]!).toBeFalse()
    expect(listed[0]?.keyPrefix).toBe(created.keyPrefix)
  })

  it("authenticates only active keys and scopes them to their organization", async () => {
    const store = createMemoryStore()
    const orgA = await createOrganizationApiKey(
      { label: "Org A", organizationId: "org_a" },
      store
    )
    const orgB = await createOrganizationApiKey(
      { label: "Org B", organizationId: "org_b" },
      store
    )

    const authA = await authenticateOrganizationApiKey(orgA.key, store)
    expect(authA).toEqual({
      keyId: orgA.id,
      organizationId: "org_a",
      scope: "read",
    })
    expect(authA?.organizationId).not.toBe("org_b")

    const authB = await authenticateOrganizationApiKey(orgB.key, store)
    expect(authB?.organizationId).toBe("org_b")

    expect(
      await authenticateOrganizationApiKey(
        "crik_ak_not-a-real-key-value-xxxxx",
        store
      )
    ).toBeNull()
    expect(
      await authenticateOrganizationApiKey("crk_widget_key", store)
    ).toBeNull()
  })

  it("rejects revoked keys and does not revoke keys from another org", async () => {
    const store = createMemoryStore()
    const orgA = await createOrganizationApiKey(
      { label: "Org A", organizationId: "org_a" },
      store
    )
    const orgB = await createOrganizationApiKey(
      { label: "Org B", organizationId: "org_b" },
      store
    )

    expect(
      await revokeOrganizationApiKey(
        { keyId: orgB.id, organizationId: "org_a" },
        store
      )
    ).toBeFalse()
    expect(await authenticateOrganizationApiKey(orgB.key, store)).not.toBeNull()

    expect(
      await revokeOrganizationApiKey(
        { keyId: orgA.id, organizationId: "org_a" },
        store
      )
    ).toBeTrue()
    expect(await authenticateOrganizationApiKey(orgA.key, store)).toBeNull()
  })
})
