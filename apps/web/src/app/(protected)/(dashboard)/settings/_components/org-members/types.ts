export type OrganizationRole = "owner" | "admin" | "member" | string

export interface OrganizationMemberRow {
  memberId: string
  userId: string
  name: string
  email: string
  role: OrganizationRole
  joinedAt: string
}

export interface OrganizationInvitationRow {
  invitationId: string
  email: string
  role: OrganizationRole
  status: string
  createdAt: string
  expiresAt: string
  inviteUrl: string
}
