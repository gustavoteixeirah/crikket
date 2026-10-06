import { afterEach, describe, expect, it, mock } from "bun:test"
import { gunzipSync } from "node:zlib"
import {
  buildDebuggerArtifactForUpload,
  uploadArtifactToStorage,
} from "../src/upload/client"

const originalFetch = globalThis.fetch

afterEach(() => {
  mock.restore()
  globalThis.fetch = originalFetch
})

describe("debugger artifact upload", () => {
  it("gzips the payload but does not set Content-Encoding on PUT", async () => {
    let capturedInit: RequestInit | undefined
    const fetchMock = mock(
      (
        _input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1]
      ) => {
        capturedInit = init
        return Promise.resolve(new Response(null, { status: 200 }))
      }
    )

    globalThis.fetch = Object.assign(
      (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1]
      ) => fetchMock(input, init),
      {
        preconnect: originalFetch.preconnect,
      }
    )

    const artifact = await buildDebuggerArtifactForUpload({
      actions: [],
      logs: [
        {
          level: "error",
          message: "boom",
          timestamp: "2026-10-06T00:00:00.000Z",
          offset: 0,
        },
      ],
      networkRequests: [],
    })

    expect(artifact).not.toBeNull()
    if (!artifact) {
      throw new Error("expected debugger artifact")
    }
    expect(artifact.contentEncoding).toBe("gzip")

    const compressedBytes = Buffer.from(await artifact.blob.arrayBuffer())
    expect(compressedBytes[0]).toBe(0x1f)
    expect(compressedBytes[1]).toBe(0x8b)
    expect(JSON.parse(gunzipSync(compressedBytes).toString("utf8"))).toEqual({
      actions: [],
      logs: [
        {
          level: "error",
          message: "boom",
          timestamp: "2026-10-06T00:00:00.000Z",
          offset: 0,
        },
      ],
      networkRequests: [],
    })

    await uploadArtifactToStorage(
      {
        headers: {
          "content-type": "application/gzip",
        },
        method: "PUT",
        url: "https://storage.example.com/debugger-upload",
      },
      artifact.blob
    )

    expect(capturedInit?.headers).toEqual({
      "content-type": "application/gzip",
    })
    expect(
      new Headers(capturedInit?.headers).has("content-encoding")
    ).toBeFalse()
  })
})
