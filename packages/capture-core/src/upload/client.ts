import type { BugReportDebuggerPayload } from "../debugger/types"

export interface DirectUploadTarget {
  headers: Record<string, string>
  method: "PUT"
  url: string
}

export async function uploadArtifactToStorage(
  target: DirectUploadTarget,
  blob: Blob
): Promise<void> {
  let response: Response

  try {
    // Do not set Content-Encoding on the stored object. MinIO and some S3 SDK
    // GET paths auto-decompress gzip Content-Encoding, which then fails
    // server-side gunzip (Z_DATA_ERROR). Compressed debugger bytes are stored
    // as an opaque application/gzip object instead.
    response = await fetch(target.url, {
      method: target.method,
      headers: {
        ...target.headers,
      },
      body: blob,
      mode: "cors",
    })
  } catch (error) {
    throw new Error(
      "Direct upload to storage failed before the server responded. Check storage CORS and network access, then retry.",
      {
        cause: error,
      }
    )
  }

  if (!response.ok) {
    throw new Error(`Artifact upload failed with status ${response.status}.`)
  }
}

export async function buildDebuggerArtifactForUpload(
  payload: BugReportDebuggerPayload | undefined
): Promise<{ blob: Blob; contentEncoding?: string } | null> {
  if (!payload) {
    return null
  }

  const uncompressedBlob = new Blob([JSON.stringify(payload)], {
    type: "application/json",
  })

  if (typeof CompressionStream !== "function") {
    return {
      blob: uncompressedBlob,
      contentEncoding: undefined,
    }
  }

  const compressedStream = uncompressedBlob
    .stream()
    .pipeThrough(new CompressionStream("gzip"))
  const compressedBlob = await new Response(compressedStream).blob()

  return {
    blob: compressedBlob,
    // Finalize metadata: the stored bytes are gzip. Do not send this as an HTTP
    // Content-Encoding header; see uploadArtifactToStorage.
    contentEncoding: "gzip",
  }
}
