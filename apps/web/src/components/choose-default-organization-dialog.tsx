"use client"

import { authClient } from "@crikket/auth/client"
import { Button } from "@crikket/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@crikket/ui/components/ui/dialog"
import { useRouter } from "nextjs-toploader/app"
import { useState } from "react"
import { toast } from "sonner"

import { client, queryClient } from "@/utils/orpc"

type OrganizationOption = {
  id: string
  name: string
  slug: string
}

interface ChooseDefaultOrganizationDialogProps {
  open: boolean
  organizations: OrganizationOption[]
}

export function ChooseDefaultOrganizationDialog({
  open,
  organizations,
}: ChooseDefaultOrganizationDialogProps) {
  const router = useRouter()
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<
    string | null
  >(organizations[0]?.id ?? null)
  const [isSaving, setIsSaving] = useState(false)

  const handleConfirm = async () => {
    if (!selectedOrganizationId) {
      return
    }

    setIsSaving(true)

    try {
      const { error: setActiveError } = await authClient.organization.setActive(
        {
          organizationId: selectedOrganizationId,
        }
      )

      if (setActiveError) {
        throw new Error(
          setActiveError.message ?? "Failed to switch organization"
        )
      }

      await client.auth.setPreferredOrganization({
        organizationId: selectedOrganizationId,
      })
      await queryClient.invalidateQueries()
      toast.success("Default organization saved")
      router.refresh()
    } catch (error) {
      console.error(error)
      toast.error("Failed to save your default organization")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Choose your default organization</DialogTitle>
          <DialogDescription>
            You belong to more than one organization. Pick which one new
            sessions and reports should use by default. You can change this
            later in the organization switcher.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {organizations.map((organization) => {
            const isSelected = organization.id === selectedOrganizationId

            return (
              <button
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "hover:border-border hover:bg-muted/60"
                }`}
                key={organization.id}
                onClick={() => setSelectedOrganizationId(organization.id)}
                type="button"
              >
                <p className="font-medium text-sm">{organization.name}</p>
                <p className="text-muted-foreground text-xs">
                  {organization.slug}
                </p>
              </button>
            )
          })}
        </div>
        <DialogFooter>
          <Button
            disabled={!selectedOrganizationId || isSaving}
            onClick={() => {
              handleConfirm().catch(() => undefined)
            }}
            type="button"
          >
            {isSaving ? "Saving..." : "Use as default"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
