import { db } from "@crikket/db"
import {
  session as authSession,
  member,
  organization,
  userPreferredOrganization,
} from "@crikket/db/schema/auth"
import { and, asc, eq } from "drizzle-orm"

import {
  type OrganizationMembership,
  resolveSessionActiveOrganizationId,
  shouldPersistSingleMembershipPreferred,
} from "./active-organization"

export type UserOrganizationMembership = OrganizationMembership & {
  logo: string | null
  name: string
  role: string
  slug: string
}

export async function listUserOrganizationMemberships(
  userId: string
): Promise<UserOrganizationMembership[]> {
  const rows = await db
    .select({
      createdAt: member.createdAt,
      logo: organization.logo,
      name: organization.name,
      organizationId: member.organizationId,
      role: member.role,
      slug: organization.slug,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt))

  return rows
}

export async function getPreferredOrganizationId(
  userId: string
): Promise<string | null> {
  const [row] = await db
    .select({
      organizationId: userPreferredOrganization.organizationId,
    })
    .from(userPreferredOrganization)
    .where(eq(userPreferredOrganization.userId, userId))
    .limit(1)

  return row?.organizationId ?? null
}

export async function setPreferredOrganizationId(input: {
  organizationId: string
  userId: string
}): Promise<void> {
  const now = new Date()

  await db
    .insert(userPreferredOrganization)
    .values({
      createdAt: now,
      organizationId: input.organizationId,
      updatedAt: now,
      userId: input.userId,
    })
    .onConflictDoUpdate({
      target: userPreferredOrganization.userId,
      set: {
        organizationId: input.organizationId,
        updatedAt: now,
      },
    })
}

export async function clearStalePreferredOrganization(input: {
  memberships: OrganizationMembership[]
  preferredOrganizationId: string | null
  userId: string
}): Promise<string | null> {
  if (!input.preferredOrganizationId) {
    return null
  }

  const isMember = input.memberships.some(
    (membership) => membership.organizationId === input.preferredOrganizationId
  )

  if (isMember) {
    return input.preferredOrganizationId
  }

  await db
    .delete(userPreferredOrganization)
    .where(
      and(
        eq(userPreferredOrganization.userId, input.userId),
        eq(
          userPreferredOrganization.organizationId,
          input.preferredOrganizationId
        )
      )
    )

  return null
}

export async function applySessionActiveOrganization(input: {
  currentActiveOrganizationId?: string | null
  persistSession?: boolean
  sessionId?: string | null
  userId: string
}): Promise<{
  activeOrganizationId: string | null
  memberships: UserOrganizationMembership[]
  preferredOrganizationId: string | null
}> {
  const memberships = await listUserOrganizationMemberships(input.userId)
  const storedPreferred = await getPreferredOrganizationId(input.userId)
  const preferredOrganizationId = await clearStalePreferredOrganization({
    memberships,
    preferredOrganizationId: storedPreferred,
    userId: input.userId,
  })

  if (
    shouldPersistSingleMembershipPreferred({
      memberships,
      preferredOrganizationId,
    })
  ) {
    const onlyOrganizationId = memberships[0]?.organizationId
    if (onlyOrganizationId) {
      await setPreferredOrganizationId({
        organizationId: onlyOrganizationId,
        userId: input.userId,
      })
    }
  }

  const nextPreferredOrganizationId =
    preferredOrganizationId ??
    (memberships.length === 1 ? (memberships[0]?.organizationId ?? null) : null)

  const activeOrganizationId = resolveSessionActiveOrganizationId({
    currentActiveOrganizationId: input.currentActiveOrganizationId,
    memberships,
    preferredOrganizationId: nextPreferredOrganizationId,
  })

  if (
    input.persistSession !== false &&
    input.sessionId &&
    activeOrganizationId &&
    activeOrganizationId !== input.currentActiveOrganizationId
  ) {
    await db
      .update(authSession)
      .set({
        activeOrganizationId,
      })
      .where(eq(authSession.id, input.sessionId))
  }

  return {
    activeOrganizationId,
    memberships,
    preferredOrganizationId: nextPreferredOrganizationId,
  }
}
