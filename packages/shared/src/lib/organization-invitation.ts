export type OrganizationInvitationStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "canceled"
  | string

export type OrganizationInvitationRecord = {
  id: string
  email: string
  role: string | null
  status: OrganizationInvitationStatus
  expiresAt: Date | string
  organizationName: string
}

export type InvitationViewState =
  | { kind: "not-found" }
  | { kind: "canceled" }
  | { kind: "rejected" }
  | { kind: "accepted" }
  | { kind: "unavailable"; status: string }
  | { kind: "expired"; organizationName: string; invitedEmail: string }
  | {
      kind: "wrong-email"
      invitedEmail: string
      sessionEmail: string
      organizationName: string
      role: string
    }
  | {
      kind: "needs-account"
      invitedEmail: string
      organizationName: string
      role: string
    }
  | {
      kind: "can-accept"
      invitedEmail: string
      organizationName: string
      role: string
    }

export type AddExistingMemberDecision =
  | { allowed: true }
  | {
      allowed: false
      code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST"
      message: string
    }

export function normalizeInvitationEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function canManageOrganizationMembers(role: string): boolean {
  return role === "owner" || role === "admin"
}

export function resolveInvitationRole(role: string | null | undefined): string {
  if (role && role.trim().length > 0) {
    return role
  }

  return "member"
}

export function buildOrganizationInvitationUrl(
  appOrigin: string,
  invitationId: string
): string {
  return new URL(`/invite/${invitationId}`, appOrigin).toString()
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

export function resolveInvitationView(input: {
  invitation: OrganizationInvitationRecord | null
  sessionEmail: string | null
  now?: Date
}): InvitationViewState {
  const invitation = input.invitation
  if (!invitation) {
    return { kind: "not-found" }
  }

  const invitedEmail = normalizeInvitationEmail(invitation.email)
  const organizationName = invitation.organizationName
  const role = resolveInvitationRole(invitation.role)

  if (invitation.status === "canceled") {
    return { kind: "canceled" }
  }

  if (invitation.status === "rejected") {
    return { kind: "rejected" }
  }

  if (invitation.status === "accepted") {
    return { kind: "accepted" }
  }

  if (invitation.status !== "pending") {
    return { kind: "unavailable", status: invitation.status }
  }

  const expiresAt = toDate(invitation.expiresAt)
  const now = input.now ?? new Date()
  if (
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.getTime() <= now.getTime()
  ) {
    return { kind: "expired", organizationName, invitedEmail }
  }

  const sessionEmail = input.sessionEmail
    ? normalizeInvitationEmail(input.sessionEmail)
    : null

  if (sessionEmail && sessionEmail !== invitedEmail) {
    return {
      kind: "wrong-email",
      invitedEmail,
      sessionEmail,
      organizationName,
      role,
    }
  }

  if (!sessionEmail) {
    return {
      kind: "needs-account",
      invitedEmail,
      organizationName,
      role,
    }
  }

  return {
    kind: "can-accept",
    invitedEmail,
    organizationName,
    role,
  }
}

export function evaluateAddExistingMember(input: {
  actorRole: string
  targetRole: string
  userExists: boolean
  alreadyMember: boolean
}): AddExistingMemberDecision {
  if (!canManageOrganizationMembers(input.actorRole)) {
    return {
      allowed: false,
      code: "FORBIDDEN",
      message: "Only organization owners and admins can add members.",
    }
  }

  if (input.targetRole !== "admin" && input.targetRole !== "member") {
    return {
      allowed: false,
      code: "BAD_REQUEST",
      message: "You can only add members with the admin or member role.",
    }
  }

  if (!input.userExists) {
    return {
      allowed: false,
      code: "NOT_FOUND",
      message:
        "No account exists for that email. Create an invite and share the link instead.",
    }
  }

  if (input.alreadyMember) {
    return {
      allowed: false,
      code: "CONFLICT",
      message: "That user is already a member of this organization.",
    }
  }

  return { allowed: true }
}
