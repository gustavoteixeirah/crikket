import { CURSOR_AGENTS_API_URL, LINEAR_REQUEST_TIMEOUT_MS } from "./constants"
import { isRetryableLinearHttpStatus } from "./policy"

export type CursorFetch = typeof fetch

export class CursorApiError extends Error {
  readonly retryable: boolean
  readonly status: number | null

  constructor(input: {
    message: string
    retryable: boolean
    status?: number | null
  }) {
    super(input.message)
    this.name = "CursorApiError"
    this.retryable = input.retryable
    this.status = input.status ?? null
  }
}

export type CursorCreatedAgent = {
  id: string
  name: string | null
  url: string
}

export async function createCursorCloudAgent(input: {
  apiKey: string
  autoCreatePr?: boolean
  fetchImpl?: CursorFetch
  name?: string
  prompt: string
  repoUrl: string
  startingRef: string
  timeoutMs?: number
}): Promise<CursorCreatedAgent> {
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(CURSOR_AGENTS_API_URL, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(input.timeoutMs ?? LINEAR_REQUEST_TIMEOUT_MS),
    headers: {
      accept: "application/json",
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      autoCreatePR: input.autoCreatePr ?? true,
      name: input.name,
      prompt: {
        text: input.prompt,
      },
      repos: [
        {
          startingRef: input.startingRef,
          url: input.repoUrl,
        },
      ],
    }),
  })

  const raw = await response.text()
  if (!response.ok) {
    throw new CursorApiError({
      message: `Cursor Cloud Agents API returned HTTP ${response.status}.`,
      retryable: isRetryableLinearHttpStatus(response.status),
      status: response.status,
    })
  }

  let parsed: {
    agent?: { id?: string; name?: string | null; url?: string }
  }
  try {
    parsed = JSON.parse(raw) as {
      agent?: { id?: string; name?: string | null; url?: string }
    }
  } catch {
    throw new CursorApiError({
      message: "Cursor Cloud Agents API returned invalid JSON.",
      retryable: true,
      status: response.status,
    })
  }

  const agent = parsed.agent
  if (!(agent?.id && agent.url)) {
    throw new CursorApiError({
      message: "Cursor Cloud Agents API did not return an agent URL.",
      retryable: true,
      status: response.status,
    })
  }

  return {
    id: agent.id,
    name: agent.name ?? null,
    url: agent.url,
  }
}

export async function testCursorApiKey(input: {
  apiKey: string
  fetchImpl?: CursorFetch
}): Promise<{ ok: true }> {
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(`${CURSOR_AGENTS_API_URL}?limit=1`, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(LINEAR_REQUEST_TIMEOUT_MS),
    headers: {
      accept: "application/json",
      authorization: `Bearer ${input.apiKey}`,
    },
  })

  if (response.status === 401 || response.status === 403) {
    throw new CursorApiError({
      message: "Cursor API key was rejected.",
      retryable: false,
      status: response.status,
    })
  }

  if (!response.ok) {
    throw new CursorApiError({
      message: `Cursor Cloud Agents API returned HTTP ${response.status}.`,
      retryable: isRetryableLinearHttpStatus(response.status),
      status: response.status,
    })
  }

  return { ok: true }
}
