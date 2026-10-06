import { Badge } from "@crikket/ui/components/ui/badge"
import { Button } from "@crikket/ui/components/ui/button"
import { Separator } from "@crikket/ui/components/ui/separator"
import { cn } from "@crikket/ui/lib/utils"
import { useMutation } from "@tanstack/react-query"
import { Globe, Info, MousePointerClick, Terminal } from "lucide-react"
import type { ReactNode } from "react"
import { toast } from "sonner"

import { client, queryClient } from "@/utils/orpc"

import { NetworkRequestsPanel } from "./network-requests-panel"
import { ReproductionStepsList } from "./reproduction-steps-list"
import { TimelineList } from "./timeline-list"
import type {
  DebuggerAction,
  DebuggerNetworkRequest,
  DebuggerTimelineEntry,
  DeviceInfo,
  SharedBugReport,
} from "./types"

export type SidebarTab = "details" | "console" | "network" | "actions"

interface TimelineSidebarState {
  entries: DebuggerTimelineEntry[]
  selectedEntryId: string | null
  highlightedEntryIds: string[]
}

interface ActionsSidebarState extends TimelineSidebarState {
  actions: DebuggerAction[]
}

interface NetworkSidebarState extends TimelineSidebarState {
  requests: DebuggerNetworkRequest[]
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  onLoadMore: () => void
}

interface BugReportSidebarProps {
  bugReportId: string
  data: SharedBugReport
  activeTab: SidebarTab
  tabAction?: ReactNode
  onTabChange: (tab: SidebarTab) => void
  timeline: {
    actions: ActionsSidebarState
    console: TimelineSidebarState
  }
  network: NetworkSidebarState
  onEntrySelect: (entry: DebuggerTimelineEntry) => void
}

export function BugReportSidebar({
  bugReportId,
  data,
  activeTab,
  tabAction,
  onTabChange,
  timeline,
  network,
  onEntrySelect,
}: BugReportSidebarProps) {
  const deviceInfo = data.deviceInfo as DeviceInfo | null
  const reporterName = data.reporter?.name?.trim()

  return (
    <div className="z-20 flex h-full w-full flex-col bg-background shadow-xl md:relative md:top-0 md:border-l md:shadow-none">
      {/* Tabs Navigation */}
      <div className="flex items-center gap-1 border-b px-1 py-1">
        <TabButton
          active={activeTab === "details"}
          icon={<Info className="h-3.5 w-3.5" />}
          label="Details"
          onClick={() => onTabChange("details")}
        />
        <TabButton
          active={activeTab === "actions"}
          icon={<MousePointerClick className="h-3.5 w-3.5" />}
          label="Steps"
          onClick={() => onTabChange("actions")}
        />
        <TabButton
          active={activeTab === "console"}
          icon={<Terminal className="h-3.5 w-3.5" />}
          label="Console"
          onClick={() => onTabChange("console")}
        />
        <TabButton
          active={activeTab === "network"}
          icon={<Globe className="h-3.5 w-3.5" />}
          label="Network"
          onClick={() => onTabChange("network")}
        />
        {tabAction ? <div className="shrink-0">{tabAction}</div> : null}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "details" && (
          <div className="space-y-6 p-4">
            <div className="space-y-4">
              <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Isolate Context
              </h3>
              <div className="grid gap-3 text-sm">
                <DetailRow className="break-all" label="URL" value={data.url} />
                <DetailRow label="Browser" value={deviceInfo?.browser} />
                <DetailRow label="OS" value={deviceInfo?.os} />
                <DetailRow label="Viewport" value={deviceInfo?.viewport} />
              </div>
            </div>
            <Separator />
            <div className="space-y-4">
              <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Ticket Info
              </h3>
              <div className="grid gap-3 text-sm">
                <DetailRow
                  className="capitalize"
                  label="Priority"
                  value={data.priority}
                />
                <DetailRow label="Reporter" value={reporterName} />
                <DetailRow label="Org" value={data.organization.name} />
                <div className="pt-2">
                  <span className="mb-1 block font-medium text-muted-foreground text-xs">
                    Description
                  </span>
                  <p className="min-h-[60px] whitespace-pre-wrap rounded-md border bg-muted/30 p-2 text-foreground text-sm leading-relaxed">
                    {data.description || "No description provided."}
                  </p>
                </div>
              </div>
            </div>
            <Separator />
            <TranscriptSection data={data} />
          </div>
        )}

        {activeTab === "actions" && (
          <ReproductionStepsList
            actions={timeline.actions.actions}
            entries={timeline.actions.entries}
            highlightedIds={timeline.actions.highlightedEntryIds}
            onSelect={onEntrySelect}
            selectedId={timeline.actions.selectedEntryId}
          />
        )}

        {activeTab === "console" && (
          <TimelineList
            emptyMessage="No console logs captured."
            entries={timeline.console.entries}
            highlightedIds={timeline.console.highlightedEntryIds}
            icon={<Terminal className="h-3 w-3" />}
            onSelect={onEntrySelect}
            selectedId={timeline.console.selectedEntryId}
          />
        )}

        {activeTab === "network" && (
          <NetworkRequestsPanel
            bugReportId={bugReportId}
            entries={network.entries}
            hasNextPage={network.hasNextPage}
            highlightedEntryIds={network.highlightedEntryIds}
            isFetchingNextPage={network.isFetchingNextPage}
            isLoading={network.isLoading}
            onEntrySelect={onEntrySelect}
            onLoadMore={network.onLoadMore}
            requests={network.requests}
            selectedEntryId={network.selectedEntryId}
          />
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
}) {
  return (
    <button
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-[4px] py-1.5 font-medium text-xs transition-all",
        active
          ? "bg-muted text-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  )
}

function TranscriptSection({ data }: { data: SharedBugReport }) {
  const transcript = data.transcript
  const retryMutation = useMutation({
    mutationFn: async () =>
      client.bugReport.retryTranscription({ id: data.id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.success("Transcription queued")
    },
    onError: (error) => {
      toast.error(error.message || "Failed to retry transcription")
    },
  })

  const showRetry =
    data.canEdit &&
    data.attachmentType === "video" &&
    (!transcript ||
      transcript.status === "failed" ||
      transcript.status === "skipped")

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
          Transcript
        </h3>
        {transcript ? (
          <Badge
            variant={
              transcript.status === "completed"
                ? "default"
                : transcript.status === "failed" ||
                    transcript.status === "skipped"
                  ? "destructive"
                  : "secondary"
            }
          >
            {transcript.status}
          </Badge>
        ) : (
          <Badge variant="secondary">none</Badge>
        )}
      </div>
      {transcript?.error ? (
        <p className="text-destructive text-xs">{transcript.error}</p>
      ) : null}
      <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-2 text-foreground text-sm leading-relaxed">
        {transcript?.text || "No transcript is available yet."}
      </p>
      {transcript && transcript.segments.length > 0 ? (
        <ol className="space-y-1 text-xs">
          {transcript.segments.map((segment) => (
            <li key={`${segment.start}-${segment.end}-${segment.text}`}>
              <span className="font-mono text-muted-foreground">
                {segment.start.toFixed(1)}–{segment.end.toFixed(1)}
              </span>{" "}
              {segment.text}
            </li>
          ))}
        </ol>
      ) : null}
      {showRetry ? (
        <Button
          disabled={retryMutation.isPending}
          onClick={() => {
            retryMutation.mutate()
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          Retry transcription
        </Button>
      ) : null}
    </div>
  )
}

function DetailRow({
  label,
  value,
  truncate,
  className,
}: {
  label: string
  value?: string | null
  truncate?: boolean
  className?: string
}) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-muted-foreground text-xs">{label}</span>
      <span
        className={cn(
          "wrap-break-word text-foreground text-sm",
          truncate && "truncate",
          className
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  )
}
