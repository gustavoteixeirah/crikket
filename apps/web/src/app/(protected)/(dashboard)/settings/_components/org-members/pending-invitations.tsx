"use client"

import { Badge } from "@crikket/ui/components/ui/badge"
import { Button } from "@crikket/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@crikket/ui/components/ui/card"
import { Input } from "@crikket/ui/components/ui/input"

import { CopyValueButton } from "../public-keys/components/copy-value-button"
import type { OrganizationInvitationRow } from "./types"

interface PendingInvitationsProps {
  invitations: OrganizationInvitationRow[]
  canManageMembers: boolean
  cancelingInvitationId: string | null
  resendingInvitationId: string | null
  onCancelInvitation: (invitationId: string) => Promise<void>
  onResendInvitation: (invitation: OrganizationInvitationRow) => Promise<void>
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString()
}

export function PendingInvitations({
  invitations,
  canManageMembers,
  cancelingInvitationId,
  resendingInvitationId,
  onCancelInvitation,
  onResendInvitation,
}: PendingInvitationsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Pending Invitations</CardTitle>
      </CardHeader>
      <CardContent>
        {invitations.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No pending invitations.
          </p>
        ) : (
          <div className="space-y-3">
            {invitations.map((invitation) => {
              const isCanceling =
                cancelingInvitationId === invitation.invitationId
              const isResending =
                resendingInvitationId === invitation.invitationId
              const isBusy = isCanceling || isResending

              return (
                <div
                  className="flex flex-col gap-3 rounded-md border p-3"
                  key={invitation.invitationId}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{invitation.email}</p>
                      <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                        <Badge variant="outline">{invitation.role}</Badge>
                        <span>Invited {formatDate(invitation.createdAt)}</span>
                        <span>Expires {formatDate(invitation.expiresAt)}</span>
                      </div>
                    </div>
                    {canManageMembers ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={isBusy}
                          onClick={async () => onResendInvitation(invitation)}
                          size="sm"
                          variant="outline"
                        >
                          {isResending ? "Resending..." : "Resend"}
                        </Button>
                        <Button
                          disabled={isBusy}
                          onClick={async () =>
                            onCancelInvitation(invitation.invitationId)
                          }
                          size="sm"
                          variant="outline"
                        >
                          {isCanceling ? "Revoking..." : "Revoke"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {canManageMembers ? (
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label={`Invite link for ${invitation.email}`}
                        readOnly
                        value={invitation.inviteUrl}
                      />
                      <CopyValueButton
                        ariaLabel={`Copy invite link for ${invitation.email}`}
                        value={invitation.inviteUrl}
                        variant="outline"
                      />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
