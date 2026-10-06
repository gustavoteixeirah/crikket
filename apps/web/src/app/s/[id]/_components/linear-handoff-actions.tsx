"use client"

import { Button } from "@crikket/ui/components/ui/button"
import { useMutation } from "@tanstack/react-query"
import { Bot, ExternalLink, Layers } from "lucide-react"
import { toast } from "sonner"

import { client, queryClient } from "@/utils/orpc"

import type { SharedBugReport } from "./types"

interface LinearHandoffActionsProps {
  data: SharedBugReport
}

export function LinearHandoffActions({ data }: LinearHandoffActionsProps) {
  const createIssueMutation = useMutation({
    mutationFn: async () => client.linear.createIssue({ reportId: data.id }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries()
      toast.success(
        result.skipped ? "Linear issue already exists" : "Linear issue created"
      )
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create Linear issue")
    },
  })

  const launchAgentMutation = useMutation({
    mutationFn: async () => client.linear.launchAgent({ reportId: data.id }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries()
      toast.success(
        result.skipped
          ? "Cursor agent already launched"
          : "Cursor cloud agent launched"
      )
    },
    onError: (error) => {
      toast.error(error.message || "Failed to launch Cursor agent")
    },
  })

  const linearUrl = data.linearIssueUrl
  const linearLabel = data.linearIssueIdentifier || "Linear issue"
  const agentUrl = data.cursorAgentUrl

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
        Linear handoff
      </h3>
      <div className="grid gap-3 text-sm">
        {linearUrl ? (
          <a
            className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
            href={linearUrl}
            rel="noreferrer"
            target="_blank"
          >
            <Layers className="size-3.5" />
            {linearLabel}
            <ExternalLink className="size-3" />
          </a>
        ) : (
          <p className="text-muted-foreground">No Linear issue yet.</p>
        )}
        {agentUrl ? (
          <a
            className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
            href={agentUrl}
            rel="noreferrer"
            target="_blank"
          >
            <Bot className="size-3.5" />
            Cursor cloud agent
            <ExternalLink className="size-3" />
          </a>
        ) : null}
        {data.canEdit ? (
          <div className="flex flex-wrap gap-2">
            {linearUrl ? null : (
              <Button
                disabled={createIssueMutation.isPending}
                onClick={() => {
                  createIssueMutation.mutate()
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Create Linear issue
              </Button>
            )}
            {agentUrl ? null : (
              <Button
                disabled={launchAgentMutation.isPending}
                onClick={() => {
                  launchAgentMutation.mutate()
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Launch agent
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
