"use client"

import { authClient } from "@crikket/auth/client"
import { Badge } from "@crikket/ui/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@crikket/ui/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@crikket/ui/components/ui/sidebar"
import { Check, ChevronsUpDown, Plus, Star } from "lucide-react"
import { useRouter } from "nextjs-toploader/app"
import * as React from "react"
import { toast } from "sonner"

import { CreateOrganizationDialog } from "@/components/create-organization-dialog"
import { client, queryClient } from "@/utils/orpc"

type Organization = typeof authClient.$Infer.Organization

interface TeamSwitcherProps {
  organizations: Organization[]
  activeOrganization?: Organization
  preferredOrganizationId?: string | null
}

export function TeamSwitcher({
  organizations,
  activeOrganization,
  preferredOrganizationId,
}: TeamSwitcherProps) {
  const { isMobile } = useSidebar()
  const router = useRouter()
  const [showCreateDialog, setShowCreateDialog] = React.useState(false)
  const [isUpdatingPreferred, setIsUpdatingPreferred] = React.useState(false)

  const invalidateDashboardData = React.useCallback(async () => {
    await queryClient.invalidateQueries()
  }, [])

  const setActiveOrganization = React.useCallback(
    async (orgId: string) => {
      const { error } = await authClient.organization.setActive({
        organizationId: orgId,
      })

      if (error) {
        throw new Error(error.message ?? "Failed to switch organization")
      }

      await invalidateDashboardData()
      router.refresh()
    },
    [invalidateDashboardData, router]
  )

  const handleSwitchOrganization = React.useCallback(
    async (orgId: string) => {
      if (orgId === activeOrganization?.id) {
        return
      }

      try {
        await setActiveOrganization(orgId)
        toast.success("Organization switched successfully")
      } catch (error) {
        console.error(error)
        toast.error("Failed to switch organization")
      }
    },
    [activeOrganization?.id, setActiveOrganization]
  )

  const handleSetDefault = React.useCallback(
    async (orgId: string) => {
      if (orgId === preferredOrganizationId || isUpdatingPreferred) {
        return
      }

      setIsUpdatingPreferred(true)

      try {
        if (orgId !== activeOrganization?.id) {
          await setActiveOrganization(orgId)
        }

        await client.auth.setPreferredOrganization({
          organizationId: orgId,
        })
        await invalidateDashboardData()
        toast.success("Default organization saved")
        router.refresh()
      } catch (error) {
        console.error(error)
        toast.error("Failed to save default organization")
      } finally {
        setIsUpdatingPreferred(false)
      }
    },
    [
      activeOrganization?.id,
      invalidateDashboardData,
      isUpdatingPreferred,
      preferredOrganizationId,
      router,
      setActiveOrganization,
    ]
  )

  const isActiveDefault =
    Boolean(activeOrganization?.id) &&
    activeOrganization?.id === preferredOrganizationId

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger className="w-full">
            <SidebarMenuButton
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              render={(props) => <div {...props} />}
              size="lg"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                {activeOrganization?.logo ? (
                  <img
                    alt={activeOrganization.name}
                    className="size-4"
                    src={activeOrganization.logo}
                  />
                ) : (
                  <span className="font-semibold text-sm uppercase">
                    {activeOrganization?.name.slice(0, 2) ?? "OR"}
                  </span>
                )}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {activeOrganization?.name ?? "Select organization"}
                </span>
                <span className="truncate text-muted-foreground text-xs">
                  {activeOrganization
                    ? isActiveDefault
                      ? `${activeOrganization.slug} · default`
                      : `${activeOrganization.slug} · not default`
                    : "No organization"}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                Organizations
              </DropdownMenuLabel>
              {organizations.map((org) => {
                const isActive = org.id === activeOrganization?.id
                const isDefault = org.id === preferredOrganizationId

                return (
                  <DropdownMenuItem
                    className="gap-2 p-2"
                    key={org.id}
                    onClick={() => {
                      handleSwitchOrganization(org.id).catch(() => undefined)
                    }}
                  >
                    <div className="flex size-6 items-center justify-center rounded-sm border">
                      {org.logo ? (
                        <img alt={org.name} className="size-4" src={org.logo} />
                      ) : (
                        <span className="font-medium text-xs uppercase">
                          {org.name.slice(0, 2)}
                        </span>
                      )}
                    </div>
                    <div className="grid min-w-0 flex-1 text-left leading-tight">
                      <span className="truncate">{org.name}</span>
                      <span className="truncate text-muted-foreground text-xs">
                        {org.slug}
                      </span>
                    </div>
                    {isDefault ? (
                      <Badge variant="secondary">Default</Badge>
                    ) : (
                      <button
                        className="rounded-md px-1.5 py-0.5 text-muted-foreground text-xs hover:bg-muted hover:text-foreground"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          handleSetDefault(org.id).catch(() => undefined)
                        }}
                        onPointerDown={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                        }}
                        type="button"
                      >
                        Set default
                      </button>
                    )}
                    {isActive ? <Check className="size-4" /> : null}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {activeOrganization && !isActiveDefault ? (
              <>
                <DropdownMenuItem
                  className="gap-2 p-2"
                  disabled={isUpdatingPreferred}
                  onClick={() => {
                    handleSetDefault(activeOrganization.id).catch(
                      () => undefined
                    )
                  }}
                >
                  <Star className="size-4" />
                  Set {activeOrganization.name} as default
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem
              className="gap-2 p-2"
              onClick={() => setShowCreateDialog(true)}
            >
              <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                <Plus className="size-4" />
              </div>
              <div className="font-medium text-muted-foreground">
                Add organization
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <CreateOrganizationDialog
          onOpenChange={setShowCreateDialog}
          open={showCreateDialog}
        />
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
