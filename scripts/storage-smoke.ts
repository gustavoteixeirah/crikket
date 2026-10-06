#!/usr/bin/env bun
/**
 * Live MinIO / S3 smoke for Crikket storage.
 *
 * Uses createS3StorageProvider (the same module the server uses) and a
 * presigned PUT of an opaque application/gzip debugger payload, matching the
 * Chrome MV3 extension (see packages/capture-core/src/upload/client.ts).
 *
 * Required env: STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY,
 * and STORAGE_REGION or STORAGE_ENDPOINT.
 * Optional: STORAGE_ADDRESSING_STYLE, STORAGE_PUBLIC_URL, STORAGE_DENY_BUCKET.
 *
 * DATABASE_URL / BETTER_AUTH_* are required by @crikket/env/server even though
 * this script does not touch Postgres. Dummy values are filled only when unset.
 */
import { gunzipSync, gzipSync } from "node:zlib"

const DUMMY_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:5432/crikket-storage-smoke"
const DUMMY_BETTER_AUTH_SECRET = "0".repeat(32)
const DUMMY_BETTER_AUTH_URL = "http://127.0.0.1:3000"
const GZIP_CONTENT_TYPE = "application/gzip"
const DEFAULT_ORIGIN = "https://crikket.kodegt.com"

export const SMOKE_DEBUGGER_PAYLOAD = {
  actions: [],
  logs: [
    {
      level: "error",
      message: "kod-280 storage smoke",
      timestamp: "2026-10-06T00:00:00.000Z",
      offset: 1,
    },
  ],
  networkRequests: [],
} as const

export function ensureSmokeProcessEnv(): void {
  process.env.DATABASE_URL ??= DUMMY_DATABASE_URL
  process.env.BETTER_AUTH_SECRET ??= DUMMY_BETTER_AUTH_SECRET
  process.env.BETTER_AUTH_URL ??= DUMMY_BETTER_AUTH_URL
}

export function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env ${name}`)
  }
  return value
}

export function buildOpaqueGzipDebuggerPayload(
  payload: unknown = SMOKE_DEBUGGER_PAYLOAD
): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(payload), "utf8"))
}

export function looksLikeGzip(bytes: Buffer): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
}

export function isOutsideBucketDenied(error: unknown): boolean {
  if (getHttpStatus(error) === 403) {
    return true
  }

  const haystack = serializeError(error).toLowerCase()
  return (
    haystack.includes("accessdenied") ||
    haystack.includes("access denied") ||
    haystack.includes("not allowed") ||
    haystack.includes("forbidden") ||
    haystack.includes("status code 403")
  )
}

function getHttpStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("$metadata" in error)) {
    return undefined
  }

  const metadata = error.$metadata
  if (
    typeof metadata === "object" &&
    metadata !== null &&
    "httpStatusCode" in metadata &&
    typeof metadata.httpStatusCode === "number"
  ) {
    return metadata.httpStatusCode
  }

  return undefined
}

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    const extra =
      "Code" in error && typeof error.Code === "string" ? ` ${error.Code}` : ""
    return `${error.name}: ${error.message}${extra}`
  }
  return String(error)
}

export function resolveSmokeStorageOptions() {
  const bucket = requiredEnv("STORAGE_BUCKET")
  const accessKeyId = requiredEnv("STORAGE_ACCESS_KEY_ID")
  const secretAccessKey = requiredEnv("STORAGE_SECRET_ACCESS_KEY")
  const endpoint = process.env.STORAGE_ENDPOINT
  const region = process.env.STORAGE_REGION ?? (endpoint ? "auto" : null)

  if (!region) {
    throw new Error(
      "Missing STORAGE_REGION. Set STORAGE_REGION or STORAGE_ENDPOINT."
    )
  }

  const addressingStyle = process.env.STORAGE_ADDRESSING_STYLE
  if (
    addressingStyle &&
    addressingStyle !== "auto" &&
    addressingStyle !== "path" &&
    addressingStyle !== "virtual"
  ) {
    throw new Error(
      `Invalid STORAGE_ADDRESSING_STYLE=${addressingStyle}. Use auto, path, or virtual.`
    )
  }

  return {
    bucket,
    region,
    endpoint,
    addressingStyle,
    accessKeyId,
    secretAccessKey,
    publicUrl: process.env.STORAGE_PUBLIC_URL,
    denyBucket: process.env.STORAGE_DENY_BUCKET ?? "crikket-policy-deny-probe",
  }
}

export async function runStorageSmoke(): Promise<void> {
  ensureSmokeProcessEnv()
  const options = resolveSmokeStorageOptions()
  const [{ createS3StorageProvider }, { DEBUGGER_ARTIFACT_CONTENT_TYPE }] =
    await Promise.all([
      import("../packages/bug-reports/src/lib/storage"),
      import("../packages/bug-reports/src/lib/artifact-storage"),
    ])

  if (DEBUGGER_ARTIFACT_CONTENT_TYPE !== GZIP_CONTENT_TYPE) {
    throw new Error(
      `Expected debugger content type ${GZIP_CONTENT_TYPE}, got ${DEBUGGER_ARTIFACT_CONTENT_TYPE}`
    )
  }

  const storage = createS3StorageProvider({
    bucket: options.bucket,
    region: options.region,
    endpoint: options.endpoint,
    addressingStyle: options.addressingStyle,
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    publicUrl: options.publicUrl,
  })

  const objectKey = `organizations/smoke/bug-reports/kod-280/${Date.now()}-${crypto.randomUUID()}/debugger/payload.json.gz`
  const gzipBody = buildOpaqueGzipDebuggerPayload()

  try {
    const upload = await storage.createUploadUrl({
      filename: objectKey,
      contentType: DEBUGGER_ARTIFACT_CONTENT_TYPE,
    })

    if (upload.method !== "PUT") {
      throw new Error(`Expected PUT upload, got ${upload.method}`)
    }
    if (upload.headers["content-type"] !== GZIP_CONTENT_TYPE) {
      throw new Error(
        `Expected content-type ${GZIP_CONTENT_TYPE}, got ${JSON.stringify(upload.headers)}`
      )
    }
    if (upload.headers["content-encoding"]) {
      throw new Error("Presigned upload must not set content-encoding")
    }

    const putResponse = await fetch(upload.url, {
      method: upload.method,
      headers: {
        ...upload.headers,
        Origin: process.env.STORAGE_SMOKE_ORIGIN ?? DEFAULT_ORIGIN,
      },
      body: gzipBody,
    })

    if (!putResponse.ok) {
      const detail = await putResponse.text()
      throw new Error(
        `Presigned PUT failed with status ${putResponse.status}: ${detail}`
      )
    }

    const exists = await storage.exists(objectKey)
    if (!exists) {
      throw new Error("HeadObject/exists returned false after successful PUT")
    }

    const stored = await storage.read(objectKey)
    if (!looksLikeGzip(stored)) {
      throw new Error(
        "Stored object is not gzip. MinIO may have auto-decompressed a Content-Encoding: gzip upload."
      )
    }
    if (!stored.equals(gzipBody)) {
      throw new Error(
        "GET body does not match the gzip payload that was uploaded"
      )
    }

    const decoded = gunzipSync(stored).toString("utf8")
    if (
      JSON.parse(decoded).logs[0]?.message !==
      SMOKE_DEBUGGER_PAYLOAD.logs[0].message
    ) {
      throw new Error("Gunzipped debugger JSON did not match the smoke payload")
    }

    const denyStorage = createS3StorageProvider({
      bucket: options.denyBucket,
      region: options.region,
      endpoint: options.endpoint,
      addressingStyle: options.addressingStyle,
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    })
    await assertOutsideBucketDenied(denyStorage, options, objectKey)

    console.log("storage-smoke: ok")
    console.log(`  bucket=${options.bucket}`)
    console.log(`  key=${objectKey}`)
    console.log(`  bytes=${stored.length}`)
    console.log(`  deny-bucket=${options.denyBucket}`)
  } finally {
    await storage.remove(objectKey)
  }
}

async function assertOutsideBucketDenied(
  denyStorage: {
    save: (filename: string, data: Buffer) => Promise<void>
    remove: (filename: string) => Promise<void>
  },
  options: ReturnType<typeof resolveSmokeStorageOptions>,
  objectKey: string
): Promise<void> {
  try {
    await denyStorage.save(objectKey, Buffer.from("should-be-denied"))
    try {
      await denyStorage.remove(objectKey)
    } catch {
      // Best-effort cleanup if the deny bucket was writable.
    }
    throw new Error(
      `Least-privilege check failed: PutObject succeeded on ${options.denyBucket}`
    )
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Least-privilege check failed")
    ) {
      throw error
    }
    if (!isOutsideBucketDenied(error)) {
      throw new Error(
        `Expected AccessDenied outside ${options.bucket}, got: ${serializeError(error)}`
      )
    }
  }
}

if (import.meta.main) {
  try {
    await runStorageSmoke()
  } catch (error) {
    console.error("storage-smoke: failed")
    console.error(serializeError(error))
    process.exitCode = 1
  }
}
