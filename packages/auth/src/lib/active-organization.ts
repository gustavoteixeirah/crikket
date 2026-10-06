export type OrganizationMembership = {
  createdAt: Date
  organizationId: string
}

export type ResolveIngestOrganizationResult =
  | {
      ok: true
      organizationId: string
      source: "explicit" | "session"
    }
  | {
      ok: false
      code: "not_a_member" | "no_organization"
    }

function membershipIds(memberships: OrganizationMembership[]): Set<string> {
  return new Set(memberships.map((membership) => membership.organizationId))
}

function oldestMembership(
  memberships: OrganizationMembership[]
): OrganizationMembership | undefined {
  return [...memberships].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
  )[0]
}

export function isOrganizationMember(
  organizationId: string | null | undefined,
  memberships: OrganizationMembership[] | readonly string[]
): boolean {
  if (!organizationId) {
    return false
  }

  if (memberships.length === 0) {
    return false
  }

  if (typeof memberships[0] === "string") {
    return (memberships as readonly string[]).includes(organizationId)
  }

  return membershipIds(memberships as OrganizationMembership[]).has(
    organizationId
  )
}

export function resolvePreferredActiveOrganizationId(input: {
  memberships: OrganizationMembership[]
  preferredOrganizationId?: string | null
}): string | null {
  const memberIds = membershipIds(input.memberships)

  if (
    input.preferredOrganizationId &&
    memberIds.has(input.preferredOrganizationId)
  ) {
    return input.preferredOrganizationId
  }

  if (input.memberships.length === 1) {
    return input.memberships[0]?.organizationId ?? null
  }

  return oldestMembership(input.memberships)?.organizationId ?? null
}

export function resolveSessionActiveOrganizationId(input: {
  currentActiveOrganizationId?: string | null
  memberships: OrganizationMembership[]
  preferredOrganizationId?: string | null
}): string | null {
  if (
    isOrganizationMember(input.currentActiveOrganizationId, input.memberships)
  ) {
    return input.currentActiveOrganizationId ?? null
  }

  return resolvePreferredActiveOrganizationId(input)
}

export function shouldPersistSingleMembershipPreferred(input: {
  memberships: OrganizationMembership[]
  preferredOrganizationId?: string | null
}): boolean {
  if (input.memberships.length !== 1) {
    return false
  }

  return !isOrganizationMember(input.preferredOrganizationId, input.memberships)
}

export function shouldPromptForDefaultOrganization(input: {
  memberships: OrganizationMembership[]
  preferredOrganizationId?: string | null
}): boolean {
  return (
    input.memberships.length > 1 &&
    !isOrganizationMember(input.preferredOrganizationId, input.memberships)
  )
}

/**
 * Report ingest must honor an explicit org the reporter chose.
 * If that org is not a membership, fail instead of falling back to the
 * session, an owned org, or the oldest membership.
 */
export function resolveIngestOrganizationId(input: {
  explicitOrganizationId?: string | null
  membershipOrganizationIds: readonly string[]
  sessionActiveOrganizationId?: string | null
}): ResolveIngestOrganizationResult {
  const memberIds = new Set(input.membershipOrganizationIds)

  if (input.explicitOrganizationId) {
    if (!memberIds.has(input.explicitOrganizationId)) {
      return { ok: false, code: "not_a_member" }
    }

    return {
      ok: true,
      organizationId: input.explicitOrganizationId,
      source: "explicit",
    }
  }

  if (
    input.sessionActiveOrganizationId &&
    memberIds.has(input.sessionActiveOrganizationId)
  ) {
    return {
      ok: true,
      organizationId: input.sessionActiveOrganizationId,
      source: "session",
    }
  }

  return { ok: false, code: "no_organization" }
}
