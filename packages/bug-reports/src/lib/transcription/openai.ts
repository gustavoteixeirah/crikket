import {
  OPENAI_MODELS_URL,
  OPENAI_REQUEST_TIMEOUT_MS,
  OPENAI_TEST_TIMEOUT_MS,
  OPENAI_TRANSCRIPTIONS_URL,
  type TranscriptionModel,
} from "./constants"
import { isRetryableOpenAiHttpStatus } from "./policy"
import type { TranscriptSegment } from "./types"

export type OpenAiTranscriptionResult = {
  durationSeconds: number | null
  language: string | null
  segments: TranscriptSegment[]
  text: string
}

export type OpenAiRequestError = Error & {
  retryable: boolean
  status: number | null
}

export type OpenAiFetch = (
  url: string,
  init: RequestInit
) => Promise<Pick<Response, "ok" | "status" | "text">>

export function createOpenAiRequestError(input: {
  message: string
  retryable: boolean
  status?: number | null
}): OpenAiRequestError {
  const error = new Error(input.message) as OpenAiRequestError
  error.retryable = input.retryable
  error.status = input.status ?? null
  return error
}

export function isOpenAiRequestError(
  error: unknown
): error is OpenAiRequestError {
  return (
    error instanceof Error &&
    "retryable" in error &&
    typeof (error as { retryable?: unknown }).retryable === "boolean"
  )
}

export function buildTranscriptionFormData(input: {
  file: Blob
  filename: string
  language?: string | null
  model: TranscriptionModel
}): FormData {
  const form = new FormData()
  form.append("file", input.file, input.filename)
  form.append("model", input.model)
  if (input.language) {
    form.append("language", input.language)
  }

  if (input.model === "whisper-1") {
    form.append("response_format", "verbose_json")
  } else {
    form.append("response_format", "json")
  }

  return form
}

export function parseOpenAiTranscriptionResponse(
  payload: unknown
): OpenAiTranscriptionResult {
  if (!payload || typeof payload !== "object") {
    throw createOpenAiRequestError({
      message: "OpenAI transcription returned an unexpected payload.",
      retryable: false,
    })
  }

  const record = payload as Record<string, unknown>
  const text = typeof record.text === "string" ? record.text : ""
  const language =
    typeof record.language === "string" && record.language.length > 0
      ? record.language
      : null
  const durationSeconds =
    typeof record.duration === "number" && Number.isFinite(record.duration)
      ? record.duration
      : null

  return {
    durationSeconds,
    language,
    segments: parseSegments(record.segments),
    text,
  }
}

function parseSegments(value: unknown): TranscriptSegment[] {
  if (!Array.isArray(value)) {
    return []
  }

  const segments: TranscriptSegment[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue
    }

    const record = item as Record<string, unknown>
    const text = typeof record.text === "string" ? record.text.trim() : ""
    const start =
      typeof record.start === "number" && Number.isFinite(record.start)
        ? record.start
        : null
    const end =
      typeof record.end === "number" && Number.isFinite(record.end)
        ? record.end
        : null

    if (text.length === 0 || start === null || end === null) {
      continue
    }

    segments.push({ end, start, text })
  }

  return segments
}

export async function transcribeAudioWithOpenAi(input: {
  apiKey: string
  fetchImpl?: OpenAiFetch
  file: Blob
  filename: string
  language?: string | null
  model: TranscriptionModel
}): Promise<OpenAiTranscriptionResult> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch
  const form = buildTranscriptionFormData({
    file: input.file,
    filename: input.filename,
    language: input.language,
    model: input.model,
  })

  const response = await fetchImpl(OPENAI_TRANSCRIPTIONS_URL, {
    body: form,
    headers: {
      authorization: `Bearer ${input.apiKey}`,
    },
    method: "POST",
    signal: AbortSignal.timeout(OPENAI_REQUEST_TIMEOUT_MS),
  })

  const raw = await response.text()
  if (!response.ok) {
    throw createOpenAiRequestError({
      message: `OpenAI transcription failed with HTTP ${response.status}${summarizeOpenAiError(raw)}`,
      retryable: isRetryableOpenAiHttpStatus(response.status),
      status: response.status,
    })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw createOpenAiRequestError({
      message: "OpenAI transcription returned invalid JSON.",
      retryable: false,
      status: response.status,
    })
  }

  return parseOpenAiTranscriptionResponse(parsed)
}

export async function testOpenAiTranscriptionKey(input: {
  apiKey: string
  fetchImpl?: OpenAiFetch
  model: TranscriptionModel
}): Promise<{ message: string; ok: boolean }> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch
  const response = await fetchImpl(`${OPENAI_MODELS_URL}/${input.model}`, {
    headers: {
      authorization: `Bearer ${input.apiKey}`,
    },
    method: "GET",
    signal: AbortSignal.timeout(OPENAI_TEST_TIMEOUT_MS),
  })

  if (response.ok) {
    return {
      message: `OpenAI accepted the key and the ${input.model} model is available.`,
      ok: true,
    }
  }

  const raw = await response.text()
  return {
    message: `OpenAI rejected the key (HTTP ${response.status})${summarizeOpenAiError(raw)}`,
    ok: false,
  }
}

function summarizeOpenAiError(raw: string): string {
  if (raw.trim().length === 0) {
    return ""
  }

  try {
    const parsed = JSON.parse(raw) as { error?: { message?: unknown } }
    if (typeof parsed.error?.message === "string") {
      return `: ${parsed.error.message}`
    }
  } catch {
    // Use a truncated raw body when OpenAI does not return JSON.
  }

  return `: ${raw.slice(0, 180)}`
}
