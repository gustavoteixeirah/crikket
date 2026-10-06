export type ReportOrganizationOption = {
  id: string
  name: string
  slug: string
}

export const REPORT_ORGANIZATION_STORAGE_KEY = "crikket:report-organization"

export function pickReportOrganizationId(input: {
  activeOrganizationId?: string | null
  membershipIds: readonly string[]
  preferredOrganizationId?: string | null
  storedOrganizationId?: string | null
}): string | null {
  const memberIds = new Set(input.membershipIds)

  if (input.storedOrganizationId && memberIds.has(input.storedOrganizationId)) {
    return input.storedOrganizationId
  }

  if (
    input.preferredOrganizationId &&
    memberIds.has(input.preferredOrganizationId)
  ) {
    return input.preferredOrganizationId
  }

  if (input.activeOrganizationId && memberIds.has(input.activeOrganizationId)) {
    return input.activeOrganizationId
  }

  return input.membershipIds[0] ?? null
}

export async function readStoredReportOrganizationId(): Promise<string | null> {
  const stored = await chrome.storage.local.get([
    REPORT_ORGANIZATION_STORAGE_KEY,
  ])
  const value = stored[REPORT_ORGANIZATION_STORAGE_KEY]

  return typeof value === "string" && value.length > 0 ? value : null
}

export async function writeStoredReportOrganizationId(
  organizationId: string
): Promise<void> {
  await chrome.storage.local.set({
    [REPORT_ORGANIZATION_STORAGE_KEY]: organizationId,
  })
}
