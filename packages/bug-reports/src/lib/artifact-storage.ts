import { z } from "zod"

const bugReportArtifactKindValues = [
  "capture",
  "thumbnail",
  "debugger",
] as const

export const bugReportArtifactKindSchema = z.enum(bugReportArtifactKindValues)

export type BugReportArtifactKind = z.infer<typeof bugReportArtifactKindSchema>

export const DEBUGGER_ARTIFACT_CONTENT_TYPE = "application/gzip"

export function buildCaptureArtifactKey(input: {
  organizationId: string
  bugReportId: string
  captureType: "video" | "screenshot"
}): string {
  return (
    buildBugReportArtifactBasePath(input) +
    getCaptureFilename(input.captureType)
  )
}

export function buildThumbnailArtifactKey(input: {
  organizationId: string
  bugReportId: string
}): string {
  return `${buildBugReportArtifactBasePath(input)}thumbnail.png`
}

export function buildDebuggerArtifactKey(input: {
  organizationId: string
  bugReportId: string
}): string {
  const basePath = buildBugReportBasePath(input)
  return `${basePath}/debugger/payload.json.gz`
}

function buildBugReportArtifactBasePath(input: {
  organizationId: string
  bugReportId: string
}): string {
  const basePath = buildBugReportBasePath(input)
  return `${basePath}/capture/`
}

function buildBugReportBasePath(input: {
  organizationId: string
  bugReportId: string
}): string {
  return `organizations/${input.organizationId}/bug-reports/${input.bugReportId}`
}

function getCaptureFilename(captureType: "video" | "screenshot"): string {
  return captureType === "video" ? "video.webm" : "screenshot.png"
}
