export function shouldEnqueueCreateIssue(input: {
  enabled: boolean
  hasLinearIssue: boolean
  requireEnabled: boolean
  submissionReady: boolean
}): boolean {
  if (!input.submissionReady) {
    return false
  }

  if (input.hasLinearIssue) {
    return false
  }

  if (input.requireEnabled && !input.enabled) {
    return false
  }

  return true
}

export function shouldEnqueueLaunchAgent(input: {
  hasCursorAgent: boolean
  launchCloudAgent: boolean
  requireEnabled: boolean
}): boolean {
  if (input.hasCursorAgent) {
    return false
  }

  if (input.requireEnabled && !input.launchCloudAgent) {
    return false
  }

  return true
}

export function assertReportBelongsToOrg(input: {
  organizationId: string
  reportOrganizationId: string
}): void {
  if (input.organizationId !== input.reportOrganizationId) {
    throw new Error("Bug report does not belong to this organization.")
  }
}
