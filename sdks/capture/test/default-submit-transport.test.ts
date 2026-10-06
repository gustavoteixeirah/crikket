import { afterEach, describe, expect, it, mock } from "bun:test"

import { defaultSubmitTransport } from "../src/transport/default-submit-transport"
import type { CaptureSubmitRequest } from "../src/types"

const originalFetch = globalThis.fetch

const request = {
  config: {
    host: "https://api.crikket.io",
    key: "crk_transport",
    submitPath: "/api/embed/bug-reports",
    zIndex: 2_147_483_640,
  },
  report: {
    captureType: "screenshot",
    title: "Checkout issue",
    description: "Button is disabled",
    priority: "high",
    visibility: "public",
    pageUrl: "https://example.com/checkout",
    pageTitle: "Checkout",
    durationMs: null,
    deviceInfo: {
      browser: "bun-test",
    },
    debuggerSummary: {
      actions: 1,
      logs: 2,
      networkRequests: 3,
    },
    debuggerPayload: {
      actions: [],
      logs: [],
      networkRequests: [],
    },
    media: new Blob(["capture"], { type: "image/png" }),
  },
} satisfies CaptureSubmitRequest

afterEach(() => {
  mock.restore()
  globalThis.fetch = originalFetch
})

function installFetchMock(
  responseFactory: (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ) => Promise<Response>
) {
  const fetchMock = mock(responseFactory)

  globalThis.fetch = Object.assign(
    (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
      fetchMock(input, init),
    {
      preconnect: originalFetch.preconnect,
    }
  )

  return fetchMock
}

describe("default submit transport regression", () => {
  it("mints a submit token, creates an upload session, uploads artifacts, and finalizes the report", async () => {
    const fetchMock = installFetchMock(
      (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1]
      ) => {
        if (String(input).endsWith("/capture-token")) {
          return Promise.resolve(
            new Response(JSON.stringify({ token: "tok_123" }), {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            })
          )
        }

        if (String(input).endsWith("/bug-report-upload-session")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                bugReportId: "br_123",
                captureUpload: {
                  headers: {
                    "content-type": "image/png",
                  },
                  method: "PUT",
                  url: "https://storage.example.com/capture-upload",
                },
                debuggerUpload: {
                  headers: {
                    "content-type": "application/gzip",
                  },
                  method: "PUT",
                  url: "https://storage.example.com/debugger-upload",
                },
                finalizeToken: "fin_123",
              }),
              {
                status: 200,
                headers: {
                  "content-type": "application/json",
                },
              }
            )
          )
        }

        if (
          String(input).startsWith("https://storage.example.com/") &&
          init?.method === "PUT"
        ) {
          return Promise.resolve(new Response(null, { status: 200 }))
        }

        return Promise.resolve(
          new Response(
            JSON.stringify({ report: { id: "br_123", url: "/s/br_123" } }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            }
          )
        )
      }
    )

    const result = await defaultSubmitTransport(request)

    expect(result).toEqual({
      reportId: "br_123",
      shareUrl: "https://api.crikket.io/s/br_123",
      raw: {
        report: {
          id: "br_123",
          url: "/s/br_123",
        },
      },
    })
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.crikket.io/api/embed/capture-token"
    )
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "omit",
      headers: {
        "content-type": "application/json",
        "x-crikket-public-key": "crk_transport",
      },
      method: "POST",
      mode: "cors",
    })
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.crikket.io/api/embed/bug-report-upload-session"
    )
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      credentials: "omit",
      headers: {
        "content-type": "application/json",
        "x-crikket-capture-token": "tok_123",
        "x-crikket-public-key": "crk_transport",
      },
      method: "POST",
      mode: "cors",
    })
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "https://storage.example.com/capture-upload"
    )
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      headers: {
        "content-type": "image/png",
      },
      method: "PUT",
    })
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      "https://storage.example.com/debugger-upload"
    )
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
      headers: {
        "content-type": "application/gzip",
      },
      method: "PUT",
    })
    expect(
      new Headers(fetchMock.mock.calls[3]?.[1]?.headers).has("content-encoding")
    ).toBeFalse()
    expect(fetchMock.mock.calls[4]?.[0]).toBe(
      "https://api.crikket.io/api/embed/bug-report-finalize"
    )
    expect(fetchMock.mock.calls[4]?.[1]).toMatchObject({
      credentials: "omit",
      headers: {
        "content-type": "application/json",
        "x-crikket-capture-finalize-token": "fin_123",
        "x-crikket-public-key": "crk_transport",
      },
      method: "POST",
      mode: "cors",
    })
  })

  it("surfaces json error payloads and falls back when the response is not json", async () => {
    installFetchMock(
      (
        input: Parameters<typeof fetch>[0],
        _init?: Parameters<typeof fetch>[1]
      ) =>
        Promise.resolve(
          String(input).endsWith("/capture-token")
            ? new Response(JSON.stringify({ token: "tok_123" }), {
                status: 200,
                headers: {
                  "content-type": "application/json",
                },
              })
            : new Response(JSON.stringify({ message: "Origin not allowed." }), {
                status: 403,
                headers: {
                  "content-type": "application/json",
                },
              })
        )
    )

    await expect(defaultSubmitTransport(request)).rejects.toThrow(
      "Origin not allowed."
    )

    installFetchMock(
      (
        input: Parameters<typeof fetch>[0],
        _init?: Parameters<typeof fetch>[1]
      ) =>
        Promise.resolve(
          String(input).endsWith("/capture-token")
            ? new Response(JSON.stringify({ token: "tok_123" }), {
                status: 200,
                headers: {
                  "content-type": "application/json",
                },
              })
            : new Response("upstream exploded", {
                status: 502,
                headers: {
                  "content-type": "text/plain",
                },
              })
        )
    )

    await expect(defaultSubmitTransport(request)).rejects.toThrow(
      "Capture submission failed with status 502."
    )
  })

  it("fails before making network requests when the upload is too large", async () => {
    const fetchMock = installFetchMock(() => {
      return Promise.resolve(new Response(null, { status: 204 }))
    })
    const oversizedRequest = {
      ...request,
      report: {
        ...request.report,
        captureType: "video",
        media: {
          size: 96 * 1024 * 1024,
          type: "video/webm",
        } as Blob,
      },
    } satisfies CaptureSubmitRequest

    await expect(defaultSubmitTransport(oversizedRequest)).rejects.toThrow(
      "This recording is too large to upload reliably. Retry with a shorter recording or a screenshot."
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
