import { useCallback, useEffect, useState } from "react"

import { client } from "@/lib/orpc"
import {
  pickReportOrganizationId,
  type ReportOrganizationOption,
  readStoredReportOrganizationId,
  writeStoredReportOrganizationId,
} from "@/lib/report-organization"

export function useReportOrganization() {
  const [organizations, setOrganizations] = useState<
    ReportOrganizationOption[]
  >([])
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<
    string | null
  >(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isCancelled = false

    async function loadOrganizations() {
      setIsLoading(true)
      setError(null)

      try {
        const [storedOrganizationId, snapshot] = await Promise.all([
          readStoredReportOrganizationId(),
          client.auth.getMyOrganizations(),
        ])

        if (isCancelled) {
          return
        }

        const membershipIds = snapshot.organizations.map(
          (organization) => organization.id
        )
        const nextSelectedId = pickReportOrganizationId({
          activeOrganizationId: snapshot.activeOrganizationId,
          membershipIds,
          preferredOrganizationId: snapshot.preferredOrganizationId,
          storedOrganizationId,
        })

        setOrganizations(snapshot.organizations)
        setSelectedOrganizationId(nextSelectedId)

        if (nextSelectedId && nextSelectedId !== storedOrganizationId) {
          await writeStoredReportOrganizationId(nextSelectedId)
        }
      } catch {
        if (isCancelled) {
          return
        }

        setOrganizations([])
        setSelectedOrganizationId(null)
        setError(
          "Sign in to Crikket so this report can go to the right organization."
        )
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    loadOrganizations().catch(() => undefined)

    return () => {
      isCancelled = true
    }
  }, [])

  const selectOrganization = useCallback(async (organizationId: string) => {
    setSelectedOrganizationId(organizationId)
    await writeStoredReportOrganizationId(organizationId)
  }, [])

  const selectedOrganization =
    organizations.find(
      (organization) => organization.id === selectedOrganizationId
    ) ?? null

  return {
    error,
    isLoading,
    organizations,
    selectOrganization,
    selectedOrganization,
    selectedOrganizationId,
  }
}
