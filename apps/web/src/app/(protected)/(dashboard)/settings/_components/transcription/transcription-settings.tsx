"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@crikket/ui/components/ui/alert"
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
import { AudioLines } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { client, orpc, queryClient } from "@/utils/orpc"

type TranscriptionSettingsView = {
  apiKeyLastFour: string | null
  enabled: boolean
  hasApiKey: boolean
  language: string | null
  maskedApiKey: string | null
  model: string
  updatedAt: string | null
}

type TranscriptionSettingsState = {
  configurable: boolean
  configurationError: string | null
  settings: TranscriptionSettingsView | null
}

interface TranscriptionSettingsProps {
  canManage: boolean
  initialState: TranscriptionSettingsState
}

export function TranscriptionSettings({
  canManage,
  initialState,
}: TranscriptionSettingsProps) {
  const settingsQuery = useQuery({
    ...orpc.transcription.get.queryOptions(),
    initialData: initialState,
  })

  const state = settingsQuery.data ?? initialState
  const settings = state.settings
  const [enabled, setEnabled] = useState(settings?.enabled ?? false)
  const [model, setModel] = useState(
    settings?.model ?? "gpt-4o-mini-transcribe"
  )
  const [language, setLanguage] = useState(settings?.language ?? "")
  const [apiKey, setApiKey] = useState("")

  useEffect(() => {
    if (!settings) {
      return
    }

    setEnabled(settings.enabled)
    setModel(settings.model)
    setLanguage(settings.language ?? "")
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: async () =>
      client.transcription.upsert({
        apiKey: apiKey.trim().length > 0 ? apiKey.trim() : undefined,
        enabled,
        language: language.trim().length > 0 ? language.trim() : null,
        model: model as "gpt-4o-mini-transcribe" | "whisper-1",
      }),
    onSuccess: async () => {
      setApiKey("")
      await queryClient.invalidateQueries()
      toast.success("Transcription settings saved")
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save transcription settings")
    },
  })

  const removeMutation = useMutation({
    mutationFn: async () => client.transcription.removeApiKey(),
    onSuccess: async () => {
      setApiKey("")
      setEnabled(false)
      await queryClient.invalidateQueries()
      toast.success("OpenAI API key removed")
    },
    onError: (error) => {
      toast.error(error.message || "Failed to remove the API key")
    },
  })

  const testMutation = useMutation({
    mutationFn: async () =>
      client.transcription.testKey({
        apiKey: apiKey.trim().length > 0 ? apiKey.trim() : undefined,
        model: model as "gpt-4o-mini-transcribe" | "whisper-1",
      }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message)
        return
      }

      toast.error(result.message)
    },
    onError: (error) => {
      toast.error(error.message || "Failed to test the OpenAI API key")
    },
  })

  if (!state.configurable) {
    return (
      <Alert>
        <AlertTitle>Transcription cannot be configured</AlertTitle>
        <AlertDescription>
          {state.configurationError ||
            "The server is missing ORG_SECRETS_ENCRYPTION_KEY. Generate a 32-byte key with openssl rand -base64 32 and set that environment variable name on the server."}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AudioLines className="size-4" />
          OpenAI speech-to-text
        </CardTitle>
        <CardDescription>
          When enabled, Crikket transcribes the report video after ingest using
          your organization&apos;s OpenAI key. The key is encrypted at rest and
          never returned after save.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field>
          <FieldLabel htmlFor="transcription-api-key">
            OpenAI API key
          </FieldLabel>
          <Input
            autoComplete="off"
            disabled={!canManage || saveMutation.isPending}
            id="transcription-api-key"
            onChange={(event) => {
              setApiKey(event.target.value)
            }}
            placeholder={
              settings?.hasApiKey
                ? `Saved key ${settings.maskedApiKey}`
                : "sk-..."
            }
            type="password"
            value={apiKey}
          />
          <FieldDescription>
            {settings?.hasApiKey
              ? `Current key ${settings.maskedApiKey}. Enter a new value to replace it.`
              : "Paste the key after deploy. It is never stored in git or Coolify env."}
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="transcription-model">Model</FieldLabel>
          <Select
            disabled={!canManage || saveMutation.isPending}
            onValueChange={(value) => {
              if (value) {
                setModel(value)
              }
            }}
            value={model}
          >
            <SelectTrigger id="transcription-model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gpt-4o-mini-transcribe">
                gpt-4o-mini-transcribe
              </SelectItem>
              <SelectItem value="whisper-1">whisper-1</SelectItem>
            </SelectContent>
          </Select>
          <FieldDescription>
            Default is gpt-4o-mini-transcribe. whisper-1 returns segment
            timestamps.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="transcription-language">
            Language hint (optional)
          </FieldLabel>
          <Input
            autoComplete="off"
            disabled={!canManage || saveMutation.isPending}
            id="transcription-language"
            onChange={(event) => {
              setLanguage(event.target.value)
            }}
            placeholder="en or pt-BR"
            value={language}
          />
        </Field>

        <Field orientation="horizontal">
          <Checkbox
            checked={enabled}
            disabled={!canManage || saveMutation.isPending}
            id="transcription-enabled"
            onCheckedChange={(checked) => {
              setEnabled(checked === true)
            }}
          />
          <FieldLabel htmlFor="transcription-enabled">
            Enable transcription after ingest
          </FieldLabel>
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!canManage || saveMutation.isPending}
            onClick={() => {
              saveMutation.mutate()
            }}
            type="button"
          >
            Save
          </Button>
          <Button
            disabled={
              !canManage ||
              testMutation.isPending ||
              (apiKey.trim().length === 0 && !settings?.hasApiKey)
            }
            onClick={() => {
              testMutation.mutate()
            }}
            type="button"
            variant="outline"
          >
            Test key
          </Button>
          <Button
            disabled={
              !(canManage && settings?.hasApiKey) || removeMutation.isPending
            }
            onClick={() => {
              removeMutation.mutate()
            }}
            type="button"
            variant="ghost"
          >
            Remove key
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
