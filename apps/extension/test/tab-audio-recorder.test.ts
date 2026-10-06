import { describe, expect, it } from "bun:test"

import {
  MIC_DENIED_WARNING,
  RECORDING_ALREADY_IN_PROGRESS_ERROR,
  RECORDING_STREAM_NOT_READY_ERROR,
} from "../lib/capture-messages"
import {
  isInvalidStateError,
  isPermissionDeniedError,
  toFriendlyCaptureError,
} from "../lib/media-errors"
import {
  canStopMediaRecorder,
  createMediaRecorderSession,
  type MediaRecorderLike,
} from "../lib/media-recorder-session"
import { requestMicrophoneStream } from "../lib/microphone"
import { resolveRecordingMimeType } from "../lib/recording-mime-type"
import {
  canCreateMediaStreamSource,
  createMixedCapture,
  planCaptureMix,
} from "../lib/tab-audio-mixer"

class FakeMediaRecorder implements MediaRecorderLike {
  state: "inactive" | "recording" | "paused" = "inactive"
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: ((event?: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  startCalls = 0
  stopCalls = 0
  mimeType: string | undefined

  constructor(_stream: MediaStream, recorderOptions?: MediaRecorderOptions) {
    this.mimeType = recorderOptions?.mimeType
  }

  start(_timeslice?: number) {
    if (this.state !== "inactive") {
      throw new DOMException("Invalid state", "InvalidStateError")
    }
    this.startCalls += 1
    this.state = "recording"
  }

  stop() {
    if (this.state === "inactive") {
      throw new DOMException("Invalid state", "InvalidStateError")
    }
    this.stopCalls += 1
    this.state = "inactive"
    this.ondataavailable?.({
      data: new Blob(["chunk"], { type: "video/webm" }),
    })
    this.onstop?.()
  }
}

function createFakeTrack(
  kind: "audio" | "video",
  readyState: MediaStreamTrackState = "live"
) {
  const listeners = new Map<string, Set<() => void>>()

  const track = {
    kind,
    readyState,
    enabled: true,
    id: `${kind}-${Math.random().toString(16).slice(2)}`,
    addEventListener(type: string, handler: () => void) {
      const bucket = listeners.get(type) ?? new Set()
      bucket.add(handler)
      listeners.set(type, bucket)
    },
    removeEventListener(type: string, handler: () => void) {
      listeners.get(type)?.delete(handler)
    },
    stop() {
      this.readyState = "ended"
    },
  }

  return track
}

function createFakeStream(audioCount: number, videoCount: number): MediaStream {
  const audioTracks = Array.from({ length: audioCount }, () =>
    createFakeTrack("audio")
  )
  const videoTracks = Array.from({ length: videoCount }, () =>
    createFakeTrack("video")
  )

  return {
    getAudioTracks: () => audioTracks,
    getVideoTracks: () => videoTracks,
    getTracks: () => [...audioTracks, ...videoTracks],
  } as unknown as MediaStream
}

function createThrowingAudioContext() {
  let sourceCalls = 0
  const destination = { id: "speakers" }
  const mixDestination = {
    stream: createFakeStream(1, 0),
  }

  return {
    context: {
      state: "running",
      destination,
      createMediaStreamSource(stream: MediaStream) {
        sourceCalls += 1
        if (stream.getAudioTracks().length === 0) {
          throw new DOMException("Invalid state", "InvalidStateError")
        }
        return {
          connect() {
            // Test double: graph wiring is asserted via source-call counts.
          },
          disconnect() {
            // Test double: disconnect is optional during teardown.
          },
        }
      },
      createMediaStreamDestination() {
        return mixDestination
      },
      resume() {
        return Promise.resolve()
      },
      close() {
        return Promise.resolve()
      },
    },
    getSourceCalls: () => sourceCalls,
  }
}

describe("capture mix plan", () => {
  it("mixes tab audio and microphone when both are present", () => {
    expect(
      planCaptureMix({ tabAudioTrackCount: 1, micAudioTrackCount: 1 })
    ).toEqual({ kind: "mix-tab-and-mic" })
  })

  it("loops tab audio back without mixing when the mic is missing", () => {
    expect(
      planCaptureMix({ tabAudioTrackCount: 1, micAudioTrackCount: 0 })
    ).toEqual({ kind: "tab-audio-loopback" })
  })

  it("attaches microphone audio onto video when the tab has no audio", () => {
    expect(
      planCaptureMix({ tabAudioTrackCount: 0, micAudioTrackCount: 1 })
    ).toEqual({ kind: "mic-on-video" })
  })

  it("records video only when neither source has audio", () => {
    expect(
      planCaptureMix({ tabAudioTrackCount: 0, micAudioTrackCount: 0 })
    ).toEqual({ kind: "video-only" })
  })

  it("refuses MediaStreamSource creation without audio tracks", () => {
    expect(canCreateMediaStreamSource(0)).toBe(false)
    expect(canCreateMediaStreamSource(1)).toBe(true)
  })
})

describe("createMixedCapture", () => {
  it("does not create an AudioContext source for a silent tab without a mic", async () => {
    const audio = createThrowingAudioContext()
    const mixed = await createMixedCapture({
      tabStream: createFakeStream(0, 1),
      micStream: null,
      createAudioContext: () => audio.context,
    })

    expect(mixed.plan).toBe("video-only")
    expect(mixed.hasAudio).toBe(false)
    expect(audio.getSourceCalls()).toBe(0)
    mixed.dispose()
  })

  it("loops tab audio to the speakers without mixing when there is no mic", async () => {
    const audio = createThrowingAudioContext()
    const tabStream = createFakeStream(1, 1)
    const mixed = await createMixedCapture({
      tabStream,
      micStream: null,
      createAudioContext: () => audio.context,
    })

    expect(mixed.plan).toBe("tab-audio-loopback")
    expect(mixed.recordingStream).toBe(tabStream)
    expect(audio.getSourceCalls()).toBe(1)
    mixed.dispose()
  })

  it("mixes tab audio and mic without InvalidStateError", async () => {
    const audio = createThrowingAudioContext()
    const mixed = await createMixedCapture({
      tabStream: createFakeStream(1, 1),
      micStream: createFakeStream(1, 0),
      createAudioContext: () => audio.context,
      createMediaStreamFromTracks: (tracks) =>
        ({
          getAudioTracks: () =>
            tracks.filter((track) => track.kind === "audio"),
          getVideoTracks: () =>
            tracks.filter((track) => track.kind === "video"),
          getTracks: () => tracks,
        }) as unknown as MediaStream,
    })

    expect(mixed.plan).toBe("mix-tab-and-mic")
    expect(mixed.hasAudio).toBe(true)
    expect(audio.getSourceCalls()).toBe(2)
    mixed.dispose()
  })
})

describe("recording mime type", () => {
  it("prefers an audio codec only when the stream has audio", () => {
    expect(
      resolveRecordingMimeType(true, (type) => type.includes("opus"))
    ).toBe("video/webm;codecs=vp9,opus")
    expect(
      resolveRecordingMimeType(false, (type) => type.includes("vp9"))
    ).toBe("video/webm;codecs=vp9")
  })
})

describe("media recorder session", () => {
  it("knows when MediaRecorder.stop() is legal", () => {
    expect(canStopMediaRecorder("recording")).toBe(true)
    expect(canStopMediaRecorder("paused")).toBe(true)
    expect(canStopMediaRecorder("inactive")).toBe(false)
    expect(canStopMediaRecorder(null)).toBe(false)
  })

  it("starts, stops, and restarts without InvalidStateError", async () => {
    const recorders: FakeMediaRecorder[] = []
    const session = createMediaRecorderSession({
      mediaRecorderCtor: class extends FakeMediaRecorder {
        constructor(
          stream: MediaStream,
          recorderOptions?: MediaRecorderOptions
        ) {
          super(stream, recorderOptions)
          recorders.push(this)
        }
      },
      isTypeSupported: () => true,
    })

    await session.start(createFakeStream(1, 1), true)
    expect(session.state()).toBe("recording")
    expect(recorders[0]?.mimeType).toContain("webm")

    const first = await session.stop()
    expect(first).toBeInstanceOf(Blob)
    expect(session.state()).toBe("stopped")
    expect(recorders[0]?.stopCalls).toBe(1)

    const secondStop = await session.stop()
    expect(secondStop).toBe(first)
    expect(recorders[0]?.stopCalls).toBe(1)

    await session.reset()
    await session.start(createFakeStream(0, 1), false)
    const restarted = await session.stop()
    expect(restarted).toBeInstanceOf(Blob)
    expect(recorders[1]?.startCalls).toBe(1)
    expect(recorders[1]?.stopCalls).toBe(1)
  })

  it("ignores overlapping stop calls while recording", async () => {
    const session = createMediaRecorderSession({
      mediaRecorderCtor: FakeMediaRecorder,
      isTypeSupported: () => true,
    })

    await session.start(createFakeStream(1, 1), true)
    const [first, second] = await Promise.all([session.stop(), session.stop()])
    expect(first).toBeInstanceOf(Blob)
    expect(second).toBe(first)
  })

  it("rejects a second start while recording", async () => {
    const session = createMediaRecorderSession({
      mediaRecorderCtor: FakeMediaRecorder,
      isTypeSupported: () => true,
    })

    await session.start(createFakeStream(1, 1), true)
    await expect(session.start(createFakeStream(1, 1), true)).rejects.toThrow(
      RECORDING_ALREADY_IN_PROGRESS_ERROR
    )
    await session.stop()
  })

  it("does not start on a stream with no live tracks", async () => {
    const ended = createFakeStream(0, 1)
    for (const track of ended.getTracks()) {
      track.stop()
    }

    const session = createMediaRecorderSession({
      mediaRecorderCtor: FakeMediaRecorder,
      isTypeSupported: () => true,
    })

    await expect(session.start(ended, false)).rejects.toThrow(
      RECORDING_STREAM_NOT_READY_ERROR
    )
    expect(session.state()).toBe("idle")
  })
})

describe("media errors", () => {
  it("detects permission denied and invalid state errors", () => {
    expect(
      isPermissionDeniedError(
        new DOMException("Permission denied", "NotAllowedError")
      )
    ).toBe(true)
    expect(isPermissionDeniedError(new Error("boom"))).toBe(false)
    expect(
      isInvalidStateError(
        new DOMException("Invalid state", "InvalidStateError")
      )
    ).toBe(true)
    expect(
      toFriendlyCaptureError(
        new DOMException("Invalid state", "InvalidStateError"),
        "x"
      ).message
    ).toBe(RECORDING_STREAM_NOT_READY_ERROR)
  })
})

describe("microphone fallback", () => {
  it("returns a tab-audio-only warning when permission is denied", async () => {
    const originalNavigator = globalThis.navigator
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: () =>
            Promise.reject(
              new DOMException("Permission denied", "NotAllowedError")
            ),
        },
      },
    })

    try {
      const result = await requestMicrophoneStream()
      expect(result.stream).toBeNull()
      expect(result.warning).toBe(MIC_DENIED_WARNING)
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: originalNavigator,
      })
    }
  })
})
