"use client"

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
import { Checkbox } from "@crikket/ui/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@crikket/ui/components/ui/field"
import { Input } from "@crikket/ui/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@crikket/ui/components/ui/table"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Check, Copy, Webhook } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { client, orpc, queryClient } from "@/utils/orpc"

type WebhookEndpoint = {
  createdAt: string
  enabled: boolean
  id: string
  maskedSecret: string
  secret?: string
  secretLastFour: string
  updatedAt: string
  url: string
}

type WebhookDelivery = {
  attempts: number
  createdAt: string
  deliveredAt: string | null
  eventType: string
  httpStatus: number | null
  id: string
  lastError: string | null
  sourceId: string
  sourceType: string
  status: string
  updatedAt: string
}

interface WebhookSettingsProps {
  canManage: boolean
  initialDeliveries: WebhookDelivery[]
  initialEndpoint: WebhookEndpoint | null
}

const COPIED_RESET_DELAY_MS = 2000

export function WebhookSettings({
  canManage,
  initialDeliveries,
  initialEndpoint,
}: WebhookSettingsProps) {
  const [url, setUrl] = useState(initialEndpoint?.url ?? "")
  const [enabled, setEnabled] = useState(initialEndpoint?.enabled ?? true)
  const [revealedSecret, setRevealedSecret] = useState(
    initialEndpoint?.secret ?? ""
  )
  const [copied, setCopied] = useState(false)

  const settingsQuery = useQuery({
    ...orpc.webhook.get.queryOptions(),
    initialData: {
      deliveries: initialDeliveries,
      endpoint: initialEndpoint,
    },
  })

  const endpoint = settingsQuery.data?.endpoint ?? null
  const deliveries = settingsQuery.data?.deliveries ?? []

  useEffect(() => {
    if (endpoint) {
      setUrl(endpoint.url)
      setEnabled(endpoint.enabled)
    }
  }, [endpoint])

  useEffect(() => {
    if (!copied) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setCopied(false)
    }, COPIED_RESET_DELAY_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [copied])

  const saveMutation = useMutation({
    mutationFn: async () =>
      client.webhook.upsert({
        enabled,
        url,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries()
      if (result.endpoint.secret) {
        setRevealedSecret(result.endpoint.secret)
      }
      toast.success(
        result.endpoint.secret
          ? "Webhook saved. Copy the signing secret now."
          : "Webhook settings saved"
      )
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save webhook settings")
    },
  })

  const rotateMutation = useMutation({
    mutationFn: async () => client.webhook.rotateSecret(),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries()
      setRevealedSecret(result.endpoint.secret)
      toast.success("Signing secret rotated. Copy the new value now.")
    },
    onError: (error) => {
      toast.error(error.message || "Failed to rotate signing secret")
    },
  })

  const revealMutation = useMutation({
    mutationFn: async () => client.webhook.revealSecret(),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries()
      setRevealedSecret(result.endpoint.secret)
      toast.success("Signing secret revealed")
    },
    onError: (error) => {
      toast.error(error.message || "Failed to reveal signing secret")
    },
  })

  const testMutation = useMutation({
    mutationFn: async () => client.webhook.sendTestEvent(),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries()
      toast.success(
        result.delivery.status === "delivered"
          ? "Test event delivered"
          : `Test event status: ${result.delivery.status}`
      )
    },
    onError: (error) => {
      toast.error(error.message || "Failed to send test event")
    },
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="size-4" />
            Outbound webhook
          </CardTitle>
          <CardDescription>
            Crikket POSTs a signed <code>report.ready</code> event after ingest
            finishes. Retries use exponential backoff (8 attempts over several
            hours) and do not block report submission.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {revealedSecret ? (
            <Alert>
              <AlertTitle>Signing secret</AlertTitle>
              <AlertDescription>
                Store this secret in n8n or your agent. It is encrypted at rest
                and can be revealed later by an admin.
              </AlertDescription>
              <div className="mt-3 flex items-center gap-2">
                <Input readOnly value={revealedSecret} />
                <Button
                  aria-label="Copy signing secret"
                  onClick={async () => {
                    await navigator.clipboard.writeText(revealedSecret)
                    setCopied(true)
                    toast.success("Copied")
                  }}
                  type="button"
                  variant="outline"
                >
                  {copied ? <Check /> : <Copy />}
                </Button>
              </div>
            </Alert>
          ) : null}

          <Field>
            <FieldLabel htmlFor="webhook-url">Endpoint URL</FieldLabel>
            <Input
              autoComplete="off"
              disabled={!canManage || saveMutation.isPending}
              id="webhook-url"
              onChange={(event) => {
                setUrl(event.target.value)
              }}
              placeholder="https://n8n.example.com/webhook/crikket"
              value={url}
            />
            <FieldDescription>
              HTTPS is required unless the server sets
              WEBHOOK_ALLOW_PRIVATE_URLS for internal n8n.
            </FieldDescription>
          </Field>

          <Field orientation="horizontal">
            <Checkbox
              checked={enabled}
              disabled={!canManage || saveMutation.isPending}
              id="webhook-enabled"
              onCheckedChange={(checked) => {
                setEnabled(checked === true)
              }}
            />
            <FieldLabel htmlFor="webhook-enabled">Enable deliveries</FieldLabel>
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                !canManage || saveMutation.isPending || url.trim().length === 0
              }
              onClick={() => {
                saveMutation.mutate()
              }}
              type="button"
            >
              Save webhook
            </Button>
            <Button
              disabled={!(canManage && endpoint) || testMutation.isPending}
              onClick={() => {
                testMutation.mutate()
              }}
              type="button"
              variant="outline"
            >
              Send test event
            </Button>
            <Button
              disabled={!(canManage && endpoint) || revealMutation.isPending}
              onClick={() => {
                revealMutation.mutate()
              }}
              type="button"
              variant="ghost"
            >
              Reveal secret
            </Button>
            <Button
              disabled={!(canManage && endpoint) || rotateMutation.isPending}
              onClick={() => {
                rotateMutation.mutate()
              }}
              type="button"
              variant="ghost"
            >
              Rotate secret
            </Button>
          </div>

          {endpoint ? (
            <p className="text-muted-foreground text-xs">
              Secret {endpoint.maskedSecret}. Last updated{" "}
              {new Date(endpoint.updatedAt).toLocaleString()}.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Saving a URL generates a signing secret on the server.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent deliveries</CardTitle>
          <CardDescription>
            Status of the latest webhook attempts for this organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {deliveries.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>HTTP</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell>
                      {new Date(delivery.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {delivery.eventType}
                      {delivery.sourceType === "test" ? " (test)" : ""}
                    </TableCell>
                    <TableCell>
                      <DeliveryStatusBadge status={delivery.status} />
                    </TableCell>
                    <TableCell>{delivery.attempts}</TableCell>
                    <TableCell>{delivery.httpStatus ?? "—"}</TableCell>
                    <TableCell className="max-w-[240px] truncate text-muted-foreground">
                      {delivery.lastError ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">
              No deliveries yet. Save an endpoint and send a test event, or wait
              for a report to finish ingest.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function DeliveryStatusBadge({ status }: { status: string }) {
  const variant =
    status === "delivered"
      ? "default"
      : status === "failed" || status === "dead_letter"
        ? "destructive"
        : "secondary"

  return <Badge variant={variant}>{status.replace("_", " ")}</Badge>
}
