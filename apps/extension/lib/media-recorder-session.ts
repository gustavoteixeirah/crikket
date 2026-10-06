import {
  RECORDING_ALREADY_IN_PROGRESS_ERROR,
  RECORDING_STREAM_NOT_READY_ERROR,
} from "./capture-messages"
import { isInvalidStateError, toFriendlyCaptureError } from "./media-errors"
import { resolveRecordingMimeType } from "./recording-mime-type"

const RECORDING_AUDIO_BITS_PER_SECOND = 64_000
const RECORDING_VIDEO_BITS_PER_SECOND = 550_000
const DEFAULT_TIMESLICE_MS = 1000

export type MediaRecorderSessionState =
  | "idle"
  | "starting"
  | "recording"
  | "stopping"
  | "stopped"

export interface MediaRecorderLike {
  state: "inactive" | "recording" | "paused"
  ondataavailable: ((event: { data: Blob }) => void) | null
  onstop: ((event?: Event) => void) | null
  onerror: ((event: Event) => void) | null
  start: (timeslice?: number) => void
  stop: () => void
}

export type MediaRecorderCtor = new (
  stream: MediaStream,
  options?: MediaRecorderOptions
) => MediaRecorderLike

export interface MediaRecorderSession {
  state: () => MediaRecorderSessionState
  start: (stream: MediaStream, hasAudio: boolean) => Promise<void>
  stop: () => Promise<Blob | null>
  reset: () => Promise<void>
}

export function canStopMediaRecorder(
  recorderState: MediaRecorderLike["state"] | null | undefined
): boolean {
  return recorderState === "recording" || recorderState === "paused"
}

export function createMediaRecorderSession(options?: {
  mediaRecorderCtor?: MediaRecorderCtor
  timesliceMs?: number
  isTypeSupported?: (mimeType: string) => boolean
}): MediaRecorderSession {
  const timesliceMs = options?.timesliceMs ?? DEFAULT_TIMESLICE_MS
  const RecorderCtor =
    options?.mediaRecorderCtor ??
    (MediaRecorder as unknown as MediaRecorderCtor)

  let lifecycle: MediaRecorderSessionState = "idle"
  let recorder: MediaRecorderLike | null = null
  let chunks: Blob[] = []
  let recordedBlob: Blob | null = null
  let stopPromise: Promise<Blob | null> | null = null
  let startedStream: MediaStream | null = null
  let handleTrackEnded: (() => void) | null = null

  const setIdle = () => {
    detachTrackListeners()
    recorder = null
    startedStream = null
    chunks = []
    lifecycle = recordedBlob ? "stopped" : "idle"
  }

  const detachTrackListeners = () => {
    if (!(startedStream && handleTrackEnded)) {
      return
    }
    for (const track of startedStream.getTracks()) {
      track.removeEventListener("ended", handleTrackEnded)
    }
    handleTrackEnded = null
  }

  const assembleBlob = (): Blob => {
    recordedBlob = new Blob(chunks, {
      type: chunks[0]?.type || "video/webm",
    })
    return recordedBlob
  }

  const stopRecorderSafely = (activeRecorder: MediaRecorderLike) => {
    if (!canStopMediaRecorder(activeRecorder.state)) {
      return
    }
    try {
      activeRecorder.stop()
    } catch (error) {
      if (!isInvalidStateError(error)) {
        throw error
      }
    }
  }

  const start = async (
    stream: MediaStream,
    hasAudio: boolean
  ): Promise<void> => {
    if (lifecycle === "stopping" && stopPromise) {
      await stopPromise
    }

    if (lifecycle === "recording" || lifecycle === "starting") {
      throw new Error(RECORDING_ALREADY_IN_PROGRESS_ERROR)
    }

    const liveTracks = stream
      .getTracks()
      .filter((track) => track.readyState === "live")
    if (liveTracks.length === 0) {
      throw new Error(RECORDING_STREAM_NOT_READY_ERROR)
    }

    lifecycle = "starting"
    chunks = []
    recordedBlob = null
    startedStream = stream

    const mimeType = resolveRecordingMimeType(
      hasAudio,
      options?.isTypeSupported
    )
    const recorderOptions: MediaRecorderOptions = {
      videoBitsPerSecond: RECORDING_VIDEO_BITS_PER_SECOND,
    }
    if (mimeType) {
      recorderOptions.mimeType = mimeType
    }
    if (hasAudio) {
      recorderOptions.audioBitsPerSecond = RECORDING_AUDIO_BITS_PER_SECOND
    }

    try {
      recorder = createRecorder(RecorderCtor, stream, recorderOptions)
    } catch (error) {
      lifecycle = "idle"
      throw toFriendlyCaptureError(error, "Failed to start recording")
    }

    const activeRecorder = recorder

    stopPromise = new Promise((resolve) => {
      activeRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      activeRecorder.onerror = () => {
        lifecycle = "stopped"
        resolve(assembleBlob())
      }

      activeRecorder.onstop = () => {
        const blob = assembleBlob()
        detachTrackListeners()
        lifecycle = "stopped"
        resolve(blob)
      }
    })

    handleTrackEnded = () => {
      if (lifecycle !== "recording") {
        return
      }
      stop().catch(() => {
        // Track-ended stop is best-effort; user stop may already be in flight.
      })
    }

    for (const track of stream.getTracks()) {
      track.addEventListener("ended", handleTrackEnded)
    }

    try {
      if (activeRecorder.state !== "inactive") {
        throw new DOMException("Invalid state", "InvalidStateError")
      }
      activeRecorder.start(timesliceMs)
    } catch (error) {
      detachTrackListeners()
      recorder = null
      startedStream = null
      stopPromise = null
      lifecycle = "idle"
      throw toFriendlyCaptureError(error, "Failed to start recording")
    }

    lifecycle = "recording"
  }

  const stop = (): Promise<Blob | null> => {
    if (lifecycle === "stopping") {
      return stopPromise ?? Promise.resolve(recordedBlob)
    }

    if (lifecycle !== "recording" || !recorder) {
      return Promise.resolve(recordedBlob)
    }

    lifecycle = "stopping"

    if (!stopPromise) {
      stopPromise = Promise.resolve(recordedBlob)
    }

    stopRecorderSafely(recorder)
    return stopPromise
  }

  const reset = async (): Promise<void> => {
    if (lifecycle === "recording" || lifecycle === "stopping") {
      await stop()
    }
    recordedBlob = null
    chunks = []
    stopPromise = null
    setIdle()
    lifecycle = "idle"
  }

  return {
    state: () => lifecycle,
    start,
    stop,
    reset,
  }
}

function createRecorder(
  RecorderCtor: MediaRecorderCtor,
  stream: MediaStream,
  recorderOptions: MediaRecorderOptions
): MediaRecorderLike {
  try {
    return new RecorderCtor(stream, recorderOptions)
  } catch {
    return new RecorderCtor(stream)
  }
}
