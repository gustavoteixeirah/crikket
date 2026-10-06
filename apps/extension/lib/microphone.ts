import { MIC_DENIED_WARNING, MIC_UNAVAILABLE_WARNING } from "./capture-messages"
import { isPermissionDeniedError } from "./media-errors"

export interface MicrophoneRequestResult {
  stream: MediaStream | null
  warning: string | null
}

export interface MicrophonePermissionResult {
  allowed: boolean
  warning: string | null
}

export async function requestMicrophoneStream(): Promise<MicrophoneRequestResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { stream: null, warning: MIC_UNAVAILABLE_WARNING }
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    })

    if (stream.getAudioTracks().length === 0) {
      for (const track of stream.getTracks()) {
        track.stop()
      }
      return { stream: null, warning: MIC_UNAVAILABLE_WARNING }
    }

    return { stream, warning: null }
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      return { stream: null, warning: MIC_DENIED_WARNING }
    }

    return { stream: null, warning: MIC_UNAVAILABLE_WARNING }
  }
}

export async function primeMicrophonePermission(): Promise<MicrophonePermissionResult> {
  const result = await requestMicrophoneStream()
  if (result.stream) {
    for (const track of result.stream.getTracks()) {
      track.stop()
    }
    return { allowed: true, warning: null }
  }

  return { allowed: false, warning: result.warning }
}
