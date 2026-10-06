import { describe, expect, it } from "bun:test"
import {
  buildCaptureArtifactKey,
  buildDebuggerArtifactKey,
  buildThumbnailArtifactKey,
  DEBUGGER_ARTIFACT_CONTENT_TYPE,
} from "../src/lib/artifact-storage"

describe("artifact storage key builders", () => {
  it("builds capture keys under the bug report capture folder", () => {
    expect(
      buildCaptureArtifactKey({
        organizationId: "org_123",
        bugReportId: "br_123",
        captureType: "video",
      })
    ).toBe("organizations/org_123/bug-reports/br_123/capture/video.webm")

    expect(
      buildCaptureArtifactKey({
        organizationId: "org_123",
        bugReportId: "br_123",
        captureType: "screenshot",
      })
    ).toBe("organizations/org_123/bug-reports/br_123/capture/screenshot.png")
  })

  it("builds thumbnail keys under the capture folder", () => {
    expect(
      buildThumbnailArtifactKey({
        organizationId: "org_123",
        bugReportId: "br_123",
      })
    ).toBe("organizations/org_123/bug-reports/br_123/capture/thumbnail.png")
  })

  it("builds debugger artifact keys under the debugger folder", () => {
    expect(
      buildDebuggerArtifactKey({
        organizationId: "org_123",
        bugReportId: "br_123",
      })
    ).toBe("organizations/org_123/bug-reports/br_123/debugger/payload.json.gz")
  })

  it("stores debugger payloads as application/gzip without Content-Encoding", () => {
    expect(DEBUGGER_ARTIFACT_CONTENT_TYPE).toBe("application/gzip")
  })
})
