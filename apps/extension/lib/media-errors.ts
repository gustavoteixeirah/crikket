import { RECORDING_STREAM_NOT_READY_ERROR } from "./capture-messages"

export function isPermissionDeniedError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false
  }

  const name = "name" in error ? String(error.name) : ""
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return true
  }

  const message = "message" in error ? String(error.message).toLowerCase() : ""
  return (
    message.includes("permission denied") || message.includes("not allowed")
  )
}

export function isInvalidStateError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false
  }

  const name = "name" in error ? String(error.name) : ""
  if (name === "InvalidStateError") {
    return true
  }

  const message = "message" in error ? String(error.message).toLowerCase() : ""
  return message.includes("invalid state")
}

export function toFriendlyCaptureError(
  error: unknown,
  fallbackMessage: string
): Error {
  if (isInvalidStateError(error)) {
    return new Error(RECORDING_STREAM_NOT_READY_ERROR)
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error
  }

  return new Error(fallbackMessage)
}
