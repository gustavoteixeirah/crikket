import { Field, FieldLabel } from "@crikket/ui/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@crikket/ui/components/ui/select"

import type { ReportOrganizationOption } from "@/lib/report-organization"

interface OrganizationSelectProps {
  disabled?: boolean
  error?: string | null
  isLoading?: boolean
  onChange: (organizationId: string) => void
  organizations: ReportOrganizationOption[]
  selectedOrganizationId: string | null
}

export function OrganizationSelect({
  disabled,
  error,
  isLoading,
  onChange,
  organizations,
  selectedOrganizationId,
}: OrganizationSelectProps) {
  const selectedOrganization =
    organizations.find(
      (organization) => organization.id === selectedOrganizationId
    ) ?? null

  return (
    <Field>
      <FieldLabel htmlFor="report-organization">Submit to</FieldLabel>
      {isLoading ? (
        <p className="text-muted-foreground text-sm">
          Loading organizations...
        </p>
      ) : error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : organizations.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No organizations available. Sign in, then try again.
        </p>
      ) : organizations.length === 1 && selectedOrganization ? (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          {selectedOrganization.name}
          <span className="mt-0.5 block text-muted-foreground text-xs">
            {selectedOrganization.slug}
          </span>
        </p>
      ) : (
        <Select
          disabled={disabled}
          onValueChange={(value) => {
            if (value) {
              onChange(value)
            }
          }}
          value={selectedOrganizationId ?? undefined}
        >
          <SelectTrigger className="w-full" id="report-organization">
            <SelectValue placeholder="Choose an organization">
              {selectedOrganization ? (
                <span className="truncate">{selectedOrganization.name}</span>
              ) : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {organizations.map((organization) => (
              <SelectItem key={organization.id} value={organization.id}>
                {organization.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  )
}
