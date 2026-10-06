const AUDIO_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const

const VIDEO_ONLY_MIME_CANDIDATES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const

export function resolveRecordingMimeType(
  hasAudio: boolean,
  isTypeSupported: (mimeType: string) => boolean = defaultIsTypeSupported
): string {
  const candidates = hasAudio
    ? AUDIO_MIME_CANDIDATES
    : VIDEO_ONLY_MIME_CANDIDATES

  for (const candidate of candidates) {
    if (isTypeSupported(candidate)) {
      return candidate
    }
  }

  return ""
}

function defaultIsTypeSupported(mimeType: string): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    MediaRecorder.isTypeSupported(mimeType)
  )
}
