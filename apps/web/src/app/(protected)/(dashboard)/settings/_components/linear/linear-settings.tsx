"use client"

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@crikket/ui/components/ui/select"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Layers } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { client, orpc, queryClient } from "@/utils/orpc"

type LinearIntegration = {
  createdAt: string
  cursorApiKeyConfigured: boolean
  enabled: boolean
  githubRef: string
  githubRepoUrl: string | null
  hasLinearApiKey: boolean
  id: string
  launchCloudAgent: boolean
  linearLabelIds: string[]
  linearLabelNames: string[]
  linearProjectId: string | null
  linearProjectName: string | null
  linearTeamId: string | null
  linearTeamKey: string | null
  linearTeamName: string | null
  maskedCursorApiKey: string | null
  maskedLinearApiKey: string | null
  updatedAt: string
}

type LinearTeam = {
  id: string
  key: string
  labels: Array<{ color: string | null; id: string; name: string }>
  name: string
  projects: Array<{ id: string; name: string }>
}

interface LinearSettingsProps {
  canManage: boolean
  initialIntegration: LinearIntegration | null
}

function buildLinearUpsertInput(input: {
  cursorApiKey: string
  enabled: boolean
  githubRef: string
  githubRepoUrl: string
  integration: LinearIntegration | null
  labelIds: string[]
  launchCloudAgent: boolean
  linearApiKey: string
  projectId: string
  selectedTeam: LinearTeam | null
  teamId: string
}) {
  const project = input.selectedTeam?.projects.find(
    (item) => item.id === input.projectId
  )
  const labels = (input.selectedTeam?.labels ?? []).filter((label) =>
    input.labelIds.includes(label.id)
  )

  return {
    cursorApiKey: input.cursorApiKey.trim() || undefined,
    enabled: input.enabled,
    githubRef: input.githubRef,
    githubRepoUrl: input.githubRepoUrl,
    launchCloudAgent: input.launchCloudAgent,
    linearApiKey: input.linearApiKey.trim() || undefined,
    linearLabelIds: labels.map((label) => label.id),
    linearLabelNames: labels.map((label) => label.name),
    linearProjectId: input.projectId || null,
    linearProjectName:
      project?.name ?? input.integration?.linearProjectName ?? null,
    linearTeamId: input.teamId || null,
    linearTeamKey:
      input.selectedTeam?.key ?? input.integration?.linearTeamKey ?? null,
    linearTeamName:
      input.selectedTeam?.name ?? input.integration?.linearTeamName ?? null,
  }
}

export function LinearSettings({
  canManage,
  initialIntegration,
}: LinearSettingsProps) {
  const [linearApiKey, setLinearApiKey] = useState("")
  const [cursorApiKey, setCursorApiKey] = useState("")
  const [enabled, setEnabled] = useState(initialIntegration?.enabled ?? false)
  const [launchCloudAgent, setLaunchCloudAgent] = useState(
    initialIntegration?.launchCloudAgent ?? false
  )
  const [teamId, setTeamId] = useState(initialIntegration?.linearTeamId ?? "")
  const [projectId, setProjectId] = useState(
    initialIntegration?.linearProjectId ?? ""
  )
  const [labelIds, setLabelIds] = useState<string[]>(
    initialIntegration?.linearLabelIds ?? []
  )
  const [githubRepoUrl, setGithubRepoUrl] = useState(
    initialIntegration?.githubRepoUrl ?? ""
  )
  const [githubRef, setGithubRef] = useState(
    initialIntegration?.githubRef ?? "main"
  )

  const settingsQuery = useQuery({
    ...orpc.linear.get.queryOptions(),
    initialData: {
      integration: initialIntegration,
    },
  })

  const integration = settingsQuery.data?.integration ?? null

  const catalogQuery = useQuery({
    queryKey: ["linear-catalog", integration?.maskedLinearApiKey],
    queryFn: () => client.linear.catalog(),
    enabled: Boolean(canManage && integration?.hasLinearApiKey),
  })

  const teams = catalogQuery.data?.teams ?? []
  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === teamId) ?? null,
    [teamId, teams]
  )

  useEffect(() => {
    if (!integration) {
      return
    }

    setEnabled(integration.enabled)
    setLaunchCloudAgent(integration.launchCloudAgent)
    setTeamId(integration.linearTeamId ?? "")
    setProjectId(integration.linearProjectId ?? "")
    setLabelIds(integration.linearLabelIds ?? [])
    setGithubRepoUrl(integration.githubRepoUrl ?? "")
    setGithubRef(integration.githubRef ?? "main")
  }, [integration])

  const saveMutation = useMutation({
    mutationFn: () =>
      client.linear.upsert(
        buildLinearUpsertInput({
          cursorApiKey,
          enabled,
          githubRef,
          githubRepoUrl,
          integration,
          labelIds,
          launchCloudAgent,
          linearApiKey,
          projectId,
          selectedTeam,
          teamId,
        })
      ),
    onSuccess: async () => {
      setLinearApiKey("")
      setCursorApiKey("")
      await queryClient.invalidateQueries()
      toast.success("Linear integration saved")
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save Linear integration")
    },
  })

  const testLinearMutation = useMutation({
    mutationFn: () => client.linear.testLinearKey(),
    onSuccess: (result) => {
      toast.success(
        result.viewerName
          ? `Linear API key works (${result.viewerName})`
          : "Linear API key works"
      )
    },
    onError: (error) => {
      toast.error(error.message || "Linear API key test failed")
    },
  })

  const testCursorMutation = useMutation({
    mutationFn: () => client.linear.testCursorKey(),
    onSuccess: () => {
      toast.success("Cursor API key works")
    },
    onError: (error) => {
      toast.error(error.message || "Cursor API key test failed")
    },
  })

  const busy = saveMutation.isPending

  return (
    <div className="space-y-4">
      <LinearConnectionCard
        busy={busy}
        canManage={canManage}
        catalogError={catalogQuery.error?.message ?? null}
        catalogLoading={catalogQuery.isLoading}
        enabled={enabled}
        hasLinearApiKey={Boolean(integration?.hasLinearApiKey)}
        labelIds={labelIds}
        linearApiKey={linearApiKey}
        maskedLinearApiKey={integration?.maskedLinearApiKey ?? null}
        onEnabledChange={setEnabled}
        onLabelIdsChange={setLabelIds}
        onLinearApiKeyChange={setLinearApiKey}
        onProjectChange={setProjectId}
        onSave={() => {
          saveMutation.mutate()
        }}
        onTeamChange={(nextTeamId) => {
          setTeamId(nextTeamId)
          setProjectId("")
          setLabelIds([])
        }}
        onTestLinear={() => {
          testLinearMutation.mutate()
        }}
        projectId={projectId}
        selectedTeam={selectedTeam}
        teamId={teamId}
        teams={teams}
        testLinearPending={testLinearMutation.isPending}
      />
      <CursorAgentCard
        busy={busy}
        canManage={canManage}
        cursorApiKey={cursorApiKey}
        cursorKeyConfigured={Boolean(integration?.cursorApiKeyConfigured)}
        githubRef={githubRef}
        githubRepoUrl={githubRepoUrl}
        launchCloudAgent={launchCloudAgent}
        maskedCursorApiKey={integration?.maskedCursorApiKey ?? null}
        onCursorApiKeyChange={setCursorApiKey}
        onGithubRefChange={setGithubRef}
        onGithubRepoUrlChange={setGithubRepoUrl}
        onLaunchChange={setLaunchCloudAgent}
        onTestCursor={() => {
          testCursorMutation.mutate()
        }}
        testCursorPending={testCursorMutation.isPending}
      />
    </div>
  )
}

function LinearConnectionCard({
  busy,
  canManage,
  catalogError,
  catalogLoading,
  enabled,
  hasLinearApiKey,
  labelIds,
  linearApiKey,
  maskedLinearApiKey,
  onEnabledChange,
  onLabelIdsChange,
  onLinearApiKeyChange,
  onProjectChange,
  onSave,
  onTeamChange,
  onTestLinear,
  projectId,
  selectedTeam,
  teamId,
  teams,
  testLinearPending,
}: {
  busy: boolean
  canManage: boolean
  catalogError: string | null
  catalogLoading: boolean
  enabled: boolean
  hasLinearApiKey: boolean
  labelIds: string[]
  linearApiKey: string
  maskedLinearApiKey: string | null
  onEnabledChange: (value: boolean) => void
  onLabelIdsChange: (value: string[]) => void
  onLinearApiKeyChange: (value: string) => void
  onProjectChange: (id: string) => void
  onSave: () => void
  onTeamChange: (id: string) => void
  onTestLinear: () => void
  projectId: string
  selectedTeam: LinearTeam | null
  teamId: string
  teams: LinearTeam[]
  testLinearPending: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="size-4" />
          Linear
        </CardTitle>
        <CardDescription>
          Bring your own Linear API key. It is encrypted at rest with{" "}
          <code>ORG_SECRETS_ENCRYPTION_KEY</code> and never returned to the
          browser. Keys are shown masked after save.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field>
          <FieldLabel htmlFor="linear-api-key">Linear API key</FieldLabel>
          <Input
            autoComplete="off"
            disabled={!canManage || busy}
            id="linear-api-key"
            onChange={(event) => {
              onLinearApiKeyChange(event.target.value)
            }}
            placeholder={maskedLinearApiKey ?? "lin_api_…"}
            type="password"
            value={linearApiKey}
          />
          <FieldDescription>
            Create a personal or workspace API key in Linear. Leave blank to
            keep the stored key.
          </FieldDescription>
        </Field>

        <Field orientation="horizontal">
          <Checkbox
            checked={enabled}
            disabled={!canManage || busy}
            id="linear-enabled"
            onCheckedChange={(checked) => {
              onEnabledChange(checked === true)
            }}
          />
          <FieldLabel htmlFor="linear-enabled">
            Create a Linear issue when a report is ready
          </FieldLabel>
        </Field>

        <TeamPicker
          canManage={canManage}
          catalogError={catalogError}
          isLoading={catalogLoading}
          onProjectChange={onProjectChange}
          onTeamChange={onTeamChange}
          projectId={projectId}
          teamId={teamId}
          teams={teams}
        />

        <LabelPicker
          busy={busy}
          canManage={canManage}
          labelIds={labelIds}
          labels={selectedTeam?.labels ?? []}
          onLabelIdsChange={onLabelIdsChange}
        />

        <div className="flex flex-wrap gap-2">
          <Button disabled={!canManage || busy} onClick={onSave} type="button">
            Save Linear settings
          </Button>
          <Button
            disabled={!(canManage && hasLinearApiKey) || testLinearPending}
            onClick={onTestLinear}
            type="button"
            variant="outline"
          >
            Test Linear key
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function CursorAgentCard({
  busy,
  canManage,
  cursorApiKey,
  cursorKeyConfigured,
  githubRef,
  githubRepoUrl,
  launchCloudAgent,
  maskedCursorApiKey,
  onCursorApiKeyChange,
  onGithubRefChange,
  onGithubRepoUrlChange,
  onLaunchChange,
  onTestCursor,
  testCursorPending,
}: {
  busy: boolean
  canManage: boolean
  cursorApiKey: string
  cursorKeyConfigured: boolean
  githubRef: string
  githubRepoUrl: string
  launchCloudAgent: boolean
  maskedCursorApiKey: string | null
  onCursorApiKeyChange: (value: string) => void
  onGithubRefChange: (value: string) => void
  onGithubRepoUrlChange: (value: string) => void
  onLaunchChange: (value: boolean) => void
  onTestCursor: () => void
  testCursorPending: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cursor cloud agent</CardTitle>
        <CardDescription>
          Off by default. When off, the Linear issue still includes a ready
          handoff section (repo, suggested branch, agent prompt, MCP
          instructions) and the report UI shows a Launch agent button. Cursor
          Cloud Agents API v1 is public beta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field orientation="horizontal">
          <Checkbox
            checked={launchCloudAgent}
            disabled={!canManage || busy}
            id="launch-cloud-agent"
            onCheckedChange={(checked) => {
              onLaunchChange(checked === true)
            }}
          />
          <FieldLabel htmlFor="launch-cloud-agent">
            Launch a Cursor cloud agent automatically
          </FieldLabel>
        </Field>

        <Field>
          <FieldLabel htmlFor="cursor-api-key">Cursor API key</FieldLabel>
          <Input
            autoComplete="off"
            disabled={!canManage || busy}
            id="cursor-api-key"
            onChange={(event) => {
              onCursorApiKeyChange(event.target.value)
            }}
            placeholder={maskedCursorApiKey ?? "Cursor dashboard → API Keys"}
            type="password"
            value={cursorApiKey}
          />
          <FieldDescription>
            Bring-your-own key, encrypted at rest, never returned to the client.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="github-repo">GitHub repository</FieldLabel>
          <Input
            autoComplete="off"
            disabled={!canManage || busy}
            id="github-repo"
            onChange={(event) => {
              onGithubRepoUrlChange(event.target.value)
            }}
            placeholder="https://github.com/org/product"
            value={githubRepoUrl}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="github-ref">Base ref</FieldLabel>
          <Input
            autoComplete="off"
            disabled={!canManage || busy}
            id="github-ref"
            onChange={(event) => {
              onGithubRefChange(event.target.value)
            }}
            placeholder="main"
            value={githubRef}
          />
          <FieldDescription>
            Cursor opens a generated <code>cursor/…</code> branch from this ref
            and can open a PR when the run finishes.
          </FieldDescription>
        </Field>

        <Button
          disabled={!(canManage && cursorKeyConfigured) || testCursorPending}
          onClick={onTestCursor}
          type="button"
          variant="outline"
        >
          Test Cursor key
        </Button>
      </CardContent>
    </Card>
  )
}

function LabelPicker({
  busy,
  canManage,
  labelIds,
  labels,
  onLabelIdsChange,
}: {
  busy: boolean
  canManage: boolean
  labelIds: string[]
  labels: LinearTeam["labels"]
  onLabelIdsChange: (value: string[]) => void
}) {
  if (labels.length === 0) {
    return null
  }

  return (
    <Field>
      <FieldLabel>Optional labels</FieldLabel>
      <div className="grid gap-2 sm:grid-cols-2">
        {labels.map((label) => (
          <label className="flex items-center gap-2 text-sm" key={label.id}>
            <Checkbox
              checked={labelIds.includes(label.id)}
              disabled={!canManage || busy}
              onCheckedChange={(next) => {
                onLabelIdsChange(
                  next === true
                    ? [...labelIds, label.id]
                    : labelIds.filter((id) => id !== label.id)
                )
              }}
            />
            {label.name}
          </label>
        ))}
      </div>
    </Field>
  )
}

function TeamPicker({
  canManage,
  catalogError,
  isLoading,
  onProjectChange,
  onTeamChange,
  projectId,
  teamId,
  teams,
}: {
  canManage: boolean
  catalogError: string | null
  isLoading: boolean
  onProjectChange: (id: string) => void
  onTeamChange: (id: string) => void
  projectId: string
  teamId: string
  teams: LinearTeam[]
}) {
  const selectedTeam = teams.find((team) => team.id === teamId)

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel>Linear team</FieldLabel>
        <Select
          disabled={!canManage || isLoading || teams.length === 0}
          onValueChange={(value) => {
            if (value) {
              onTeamChange(value)
            }
          }}
          value={teamId}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {selectedTeam
                ? `${selectedTeam.name} (${selectedTeam.key})`
                : isLoading
                  ? "Loading teams…"
                  : "Select a team"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {teams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name} ({team.key})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {catalogError ? (
          <FieldDescription className="text-destructive">
            {catalogError}
          </FieldDescription>
        ) : (
          <FieldDescription>
            Save a Linear API key, then pick the team for this product.
          </FieldDescription>
        )}
      </Field>

      <Field>
        <FieldLabel>Linear project</FieldLabel>
        <Select
          disabled={!(canManage && selectedTeam)}
          onValueChange={(value) => {
            if (value) {
              onProjectChange(value)
            }
          }}
          value={projectId}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {selectedTeam?.projects.find(
                (project) => project.id === projectId
              )?.name ?? "Select a project"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {selectedTeam?.projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  )
}
