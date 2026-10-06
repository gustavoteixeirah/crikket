import { useCallback, useRef, useState } from "react"
import {
  AUDIO_CAPTURE_WARNING_STORAGE_KEY,
  MICROPHONE_CAPTURE_ALLOWED_STORAGE_KEY,
  readAndClearCaptureTabId,
} from "@/lib/capture-context"
import { TAB_CAPTURE_LOCK_ERROR } from "@/lib/capture-messages"
import { requestTabCaptureStream } from "@/lib/display-media"
import { toFriendlyCaptureError } from "@/lib/media-errors"
import {
  createMediaRecorderSession,
  type MediaRecorderSession,
} from "@/lib/media-recorder-session"
import { requestMicrophoneStream } from "@/lib/microphone"
import {
  createMixedCapture,
  type MixedCapture,
  stopMediaStreamTracks,
} from "@/lib/tab-audio-mixer"

export interface UseScreenCaptureReturn {
  isRecording: boolean
  recordedBlob: Blob | null
  screenshotBlob: Blob | null
  error: string | null
  warning: string | null
  startRecording: () => Promise<boolean>
  stopRecording: () => Promise<Blob | null>
  takeScreenshot: () => Promise<Blob | null>
  reset: () => void
  setRecordedBlob: (blob: Blob | null) => void
  setScreenshotBlob: (blob: Blob | null) => void
}

export function useScreenCapture(): UseScreenCaptureReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [screenshotBlob, setScreenshotBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  const sessionRef = useRef<MediaRecorderSession | null>(null)
  const mixedCaptureRef = useRef<MixedCapture | null>(null)

  const getSession = useCallback((): MediaRecorderSession => {
    if (!sessionRef.current) {
      sessionRef.current = createMediaRecorderSession()
    }
    return sessionRef.current
  }, [])

  const disposeCaptureGraph = useCallback(() => {
    mixedCaptureRef.current?.dispose()
    mixedCaptureRef.current = null
  }, [])

  const startRecording = useCallback(async (): Promise<boolean> => {
    try {
      setError(null)
      setWarning(null)
      setRecordedBlob(null)

      const session = getSession()
      await session.reset()
      disposeCaptureGraph()

      const captureTabId = await readAndClearCaptureTabId()
      if (!captureTabId) {
        throw new Error(TAB_CAPTURE_LOCK_ERROR)
      }

      const stored = await chrome.storage.local.get([
        MICROPHONE_CAPTURE_ALLOWED_STORAGE_KEY,
        AUDIO_CAPTURE_WARNING_STORAGE_KEY,
      ])
      await chrome.storage.local.remove([
        MICROPHONE_CAPTURE_ALLOWED_STORAGE_KEY,
        AUDIO_CAPTURE_WARNING_STORAGE_KEY,
      ])

      const storedWarning = stored[AUDIO_CAPTURE_WARNING_STORAGE_KEY]
      const microphoneAllowed = stored[MICROPHONE_CAPTURE_ALLOWED_STORAGE_KEY]
      let audioWarning =
        typeof storedWarning === "string" ? storedWarning : null

      const tabStream = await requestTabCaptureStream(captureTabId)

      let micStream: MediaStream | null = null
      if (microphoneAllowed !== false) {
        const microphone = await requestMicrophoneStream()
        micStream = microphone.stream
        audioWarning = microphone.warning ?? audioWarning
      }

      const mixedCapture = await createMixedCapture({
        micStream,
        tabStream,
      })
      mixedCaptureRef.current = mixedCapture

      await session.start(mixedCapture.recordingStream, mixedCapture.hasAudio)
      setWarning(audioWarning)
      setIsRecording(true)
      return true
    } catch (err) {
      disposeCaptureGraph()
      const friendly = toFriendlyCaptureError(err, "Failed to start recording")
      setError(friendly.message)
      setIsRecording(false)
      return false
    }
  }, [disposeCaptureGraph, getSession])

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    const session = sessionRef.current
    if (!session) {
      disposeCaptureGraph()
      setIsRecording(false)
      return null
    }

    try {
      const blob = await session.stop()
      disposeCaptureGraph()
      setRecordedBlob(blob)
      setIsRecording(false)
      return blob
    } catch (err) {
      disposeCaptureGraph()
      const friendly = toFriendlyCaptureError(err, "Failed to stop recording")
      setError(friendly.message)
      setIsRecording(false)
      return null
    }
  }, [disposeCaptureGraph])

  const takeScreenshot = useCallback(async (): Promise<Blob | null> => {
    try {
      setError(null)
      setScreenshotBlob(null)

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser",
        },
        audio: false,
      })

      const videoTrack = stream.getVideoTracks()[0]
      const settings = videoTrack.getSettings()

      const video = document.createElement("video")
      video.srcObject = stream
      video.autoplay = true

      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          video.play()
          resolve()
        }
      })

      await new Promise((resolve) => setTimeout(resolve, 100))

      const canvas = document.createElement("canvas")
      canvas.width = settings.width || video.videoWidth
      canvas.height = settings.height || video.videoHeight

      const ctx = canvas.getContext("2d")
      if (!ctx) {
        throw new Error("Could not get canvas context")
      }

      ctx.drawImage(video, 0, 0)

      stopMediaStreamTracks(stream)
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          setScreenshotBlob(blob)
          resolve(blob)
        }, "image/png")
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to take screenshot"
      setError(message)
      return null
    }
  }, [])

  const reset = useCallback(() => {
    const session = sessionRef.current
    if (session) {
      session.reset().catch(() => {
        // Reset is best-effort; a concurrent stop may already be tearing down.
      })
    }
    disposeCaptureGraph()
    setRecordedBlob(null)
    setScreenshotBlob(null)
    setError(null)
    setWarning(null)
    setIsRecording(false)
  }, [disposeCaptureGraph])

  return {
    isRecording,
    recordedBlob,
    screenshotBlob,
    error,
    warning,
    startRecording,
    stopRecording,
    takeScreenshot,
    reset,
    setRecordedBlob,
    setScreenshotBlob,
  }
}
