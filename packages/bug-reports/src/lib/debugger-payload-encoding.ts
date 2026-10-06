import { gunzipSync } from "node:zlib"

const GZIP_MAGIC_0 = 0x1f
const GZIP_MAGIC_1 = 0x8b

export function looksLikeGzip(payload: Buffer): boolean {
  return (
    payload.length >= 2 &&
    payload[0] === GZIP_MAGIC_0 &&
    payload[1] === GZIP_MAGIC_1
  )
}

/**
 * Decode a debugger artifact as stored in object storage.
 *
 * Clients gzip the JSON payload. Some S3-compatible stores (MinIO) and SDK GET
 * paths auto-decompress objects that were uploaded with `Content-Encoding: gzip`,
 * so the bytes we read may already be JSON. Detect gzip magic first; if the
 * recorded encoding says gzip but gunzip fails with Z_DATA_ERROR, use the raw
 * bytes.
 */
export function decodeStoredDebuggerPayload(
  storedPayload: Buffer,
  contentEncoding?: string | null
): Buffer {
  if (looksLikeGzip(storedPayload)) {
    return gunzipSync(storedPayload)
  }

  if (!isGzipContentEncoding(contentEncoding)) {
    return storedPayload
  }

  try {
    return gunzipSync(storedPayload)
  } catch (error) {
    if (isZlibDataError(error)) {
      return storedPayload
    }

    throw error
  }
}

function isGzipContentEncoding(contentEncoding: string | null | undefined) {
  return contentEncoding?.trim().toLowerCase() === "gzip"
}

function isZlibDataError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const code = "code" in error ? error.code : undefined
  return code === "Z_DATA_ERROR"
}
