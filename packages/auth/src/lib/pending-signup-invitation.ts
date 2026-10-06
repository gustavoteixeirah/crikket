import { db } from "@crikket/db"
import { invitation } from "@crikket/db/schema/auth"
import { and, eq, gt, sql } from "drizzle-orm"

import { normalizeSignupEmail } from "./signup-allowlist"

export async function hasPendingOrganizationInvitation(
  email: string
): Promise<boolean> {
  const normalizedEmail = normalizeSignupEmail(email)
  if (!normalizedEmail.includes("@")) {
    return false
  }

  const pendingInvitation = await db.query.invitation.findFirst({
    columns: {
      id: true,
    },
    where: and(
      eq(invitation.status, "pending"),
      gt(invitation.expiresAt, new Date()),
      sql`lower(${invitation.email}) = ${normalizedEmail}`
    ),
  })

  return pendingInvitation != null
}
