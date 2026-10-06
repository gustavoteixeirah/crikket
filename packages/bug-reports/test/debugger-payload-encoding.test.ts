import { describe, expect, it } from "bun:test"
import { gzipSync } from "node:zlib"
import {
  decodeStoredDebuggerPayload,
  looksLikeGzip,
} from "../src/lib/debugger-payload-encoding"

const debuggerPayload = {
  actions: [
    {
      type: "click",
      target: "button.submit",
      timestamp: "2026-10-06T00:00:00.000Z",
      offset: 12,
    },
  ],
  logs: [],
  networkRequests: [],
}

const jsonBuffer = Buffer.from(JSON.stringify(debuggerPayload), "utf8")
const gzipBuffer = gzipSync(jsonBuffer)

describe("decodeStoredDebuggerPayload", () => {
  it("gunzips payloads that still have gzip magic bytes", () => {
    expect(looksLikeGzip(gzipBuffer)).toBeTrue()

    const decoded = decodeStoredDebuggerPayload(gzipBuffer, "gzip")

    expect(JSON.parse(decoded.toString("utf8"))).toEqual(debuggerPayload)
  })

  it("returns already-decompressed JSON when encoding is gzip (MinIO/SDK auto-decompress)", () => {
    expect(looksLikeGzip(jsonBuffer)).toBeFalse()

    const decoded = decodeStoredDebuggerPayload(jsonBuffer, "gzip")

    expect(JSON.parse(decoded.toString("utf8"))).toEqual(debuggerPayload)
  })

  it("gunzips magic-byte payloads even when encoding is omitted", () => {
    const decoded = decodeStoredDebuggerPayload(gzipBuffer, null)

    expect(JSON.parse(decoded.toString("utf8"))).toEqual(debuggerPayload)
  })

  it("returns raw JSON when encoding is not gzip", () => {
    const decoded = decodeStoredDebuggerPayload(jsonBuffer, null)

    expect(JSON.parse(decoded.toString("utf8"))).toEqual(debuggerPayload)
  })

  it("rethrows corrupt gzip that still has magic bytes", () => {
    const truncatedGzip = gzipBuffer.subarray(0, 8)

    expect(looksLikeGzip(truncatedGzip)).toBeTrue()
    expect(() => decodeStoredDebuggerPayload(truncatedGzip, "gzip")).toThrow()
  })
})
