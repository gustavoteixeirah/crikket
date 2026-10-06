"use client"

import { ConfirmationDialog } from "@crikket/ui/components/dialogs/confirmation-dialog"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@crikket/ui/components/ui/alert"
import { Badge } from "@crikket/ui/components/ui/badge"
import { Button } from "@crikket/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@crikket/ui/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@crikket/ui/components/ui/dialog"
import { Field, FieldLabel } from "@crikket/ui/components/ui/field"
import { Input } from "@crikket/ui/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@crikket/ui/components/ui/table"
import { useMutation } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { client, queryClient } from "@/utils/orpc"

import { CopyValueButton } from "../public-keys/components/copy-value-button"
import type {
  OrganizationApiKeyItem,
  OrganizationApiKeysSnapshot,
} from "./types"

interface ApiKeysManagementProps {
  canManage: boolean
  initialKeys: OrganizationApiKeysSnapshot
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Never"
  }

  return new Date(value).toLocaleString()
}

export function ApiKeysManagement({
  canManage,
  initialKeys,
}: ApiKeysManagementProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false)
  const [label, setLabel] = React.useState("")
  const [createdKey, setCreatedKey] = React.useState<string | null>(null)
  const [keys, setKeys] = React.useState(initialKeys)
  const [keyToRevoke, setKeyToRevoke] =
    React.useState<OrganizationApiKeyItem | null>(null)

  const createMutation = useMutation({
    mutationFn: async (input: { label: string }) =>
      client.organizationApiKey.create(input),
    onSuccess: async (result) => {
      setCreatedKey(result.key)
      setLabel("")
      setIsCreateDialogOpen(false)
      await queryClient.invalidateQueries()
      const nextKeys = await client.organizationApiKey.list()
      setKeys(nextKeys)
      toast.success("API key created")
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create API key")
    },
  })

  const revokeMutation = useMutation({
    mutationFn: async (input: { keyId: string }) =>
      client.organizationApiKey.revoke(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      const nextKeys = await client.organizationApiKey.list()
      setKeys(nextKeys)
      toast.success("API key revoked")
    },
    onError: (error) => {
      toast.error(error.message || "Failed to revoke API key")
    },
  })

  return (
    <div className="space-y-4">
      {createdKey ? (
        <Alert>
          <AlertTitle>Copy this key now</AlertTitle>
          <AlertDescription>
            This secret is shown once. Store it in your agent config; we only
            keep a hash.
            <div className="mt-3 flex items-center gap-2">
              <code className="max-w-full truncate rounded-md bg-muted px-2 py-1 font-mono text-xs">
                {createdKey}
              </code>
              <CopyValueButton
                ariaLabel="Copy organization API key"
                value={createdKey}
                variant="outline"
              />
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Organization API keys</CardTitle>
            <CardDescription>
              Read-only keys for MCP and future REST access. A key only sees
              reports in this organization.
            </CardDescription>
          </div>
          <Button
            disabled={!canManage}
            onClick={() => setIsCreateDialogOpen(true)}
            type="button"
          >
            <Plus />
            Create key
          </Button>
        </CardHeader>
        <CardContent>
          {keys.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((item) => {
                  const isRevoked = item.revokedAt !== null

                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{item.label}</p>
                        <p className="text-muted-foreground text-xs">
                          Created {formatTimestamp(item.createdAt)}
                        </p>
                      </TableCell>
                      <TableCell>
                        <code className="font-mono text-xs">
                          {item.keyPrefix}…
                        </code>
                      </TableCell>
                      <TableCell>{item.scope}</TableCell>
                      <TableCell>{formatTimestamp(item.lastUsedAt)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={isRevoked ? "destructive" : "secondary"}
                        >
                          {isRevoked ? "Revoked" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          disabled={
                            !canManage || isRevoked || revokeMutation.isPending
                          }
                          onClick={() => setKeyToRevoke(item)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-muted-foreground text-sm">
              No API keys yet. Create one to connect Cursor or another coding
              agent over MCP.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open)
          if (!open) {
            setLabel("")
          }
        }}
        open={isCreateDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>
              The secret is shown once after creation. Scope is read-only.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              createMutation.mutate({ label })
            }}
          >
            <Field>
              <FieldLabel htmlFor="api-key-label">Label</FieldLabel>
              <Input
                id="api-key-label"
                maxLength={80}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Cursor cloud agent"
                required
                value={label}
              />
            </Field>
            <DialogFooter>
              <Button
                disabled={
                  !canManage ||
                  createMutation.isPending ||
                  label.trim().length === 0
                }
                type="submit"
              >
                {createMutation.isPending ? "Creating..." : "Create key"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        confirmText="Revoke key"
        description="Agents using this key will lose access immediately. You cannot view the secret again."
        isLoading={revokeMutation.isPending}
        onConfirm={async () => {
          if (!keyToRevoke) {
            return
          }

          await revokeMutation.mutateAsync({ keyId: keyToRevoke.id })
          setKeyToRevoke(null)
        }}
        onOpenChange={(open) => {
          if (!open) {
            setKeyToRevoke(null)
          }
        }}
        open={keyToRevoke !== null}
        title={`Revoke ${keyToRevoke?.label ?? "API key"}?`}
        variant="destructive"
      />
    </div>
  )
}
