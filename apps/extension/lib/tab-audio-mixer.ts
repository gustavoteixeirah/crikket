export type CaptureMixKind =
  | "video-only"
  | "tab-audio-loopback"
  | "mic-on-video"
  | "mix-tab-and-mic"

export interface CaptureMixPlan {
  kind: CaptureMixKind
}

export interface AudioMixerSourceNode {
  connect: (destination: unknown) => void
  disconnect?: () => void
}

export interface AudioMixerDestinationNode {
  stream: MediaStream
}

export interface AudioMixerContext {
  state: string
  destination: unknown
  createMediaStreamSource: (stream: MediaStream) => AudioMixerSourceNode
  createMediaStreamDestination: () => AudioMixerDestinationNode
  resume: () => Promise<void>
  close: () => Promise<void>
}

export interface MixedCapture {
  plan: CaptureMixKind
  recordingStream: MediaStream
  hasAudio: boolean
  dispose: () => void
}

export function planCaptureMix(input: {
  tabAudioTrackCount: number
  micAudioTrackCount: number
}): CaptureMixPlan {
  const hasTabAudio = input.tabAudioTrackCount > 0
  const hasMic = input.micAudioTrackCount > 0

  if (hasTabAudio && hasMic) {
    return { kind: "mix-tab-and-mic" }
  }
  if (hasTabAudio) {
    return { kind: "tab-audio-loopback" }
  }
  if (hasMic) {
    return { kind: "mic-on-video" }
  }
  return { kind: "video-only" }
}

export function canCreateMediaStreamSource(audioTrackCount: number): boolean {
  return audioTrackCount > 0
}

export async function createMixedCapture(input: {
  tabStream: MediaStream
  micStream: MediaStream | null
  createAudioContext?: () => AudioMixerContext
  createMediaStreamFromTracks?: (tracks: MediaStreamTrack[]) => MediaStream
}): Promise<MixedCapture> {
  const plan = planCaptureMix({
    tabAudioTrackCount: input.tabStream.getAudioTracks().length,
    micAudioTrackCount: input.micStream?.getAudioTracks().length ?? 0,
  })
  const createMediaStreamFromTracks =
    input.createMediaStreamFromTracks ??
    ((tracks: MediaStreamTrack[]) => new MediaStream(tracks))

  const sourceNodes: AudioMixerSourceNode[] = []
  let audioContext: AudioMixerContext | null = null

  const ensureContext = async (): Promise<AudioMixerContext> => {
    if (audioContext) {
      return audioContext
    }

    const createContext =
      input.createAudioContext ??
      (() => new AudioContext() as AudioMixerContext)
    audioContext = createContext()
    if (audioContext.state === "suspended") {
      await audioContext.resume()
    }
    return audioContext
  }

  let recordingStream = input.tabStream

  if (plan.kind === "tab-audio-loopback") {
    const context = await ensureContext()
    const tabSource = context.createMediaStreamSource(input.tabStream)
    tabSource.connect(context.destination)
    sourceNodes.push(tabSource)
    recordingStream = input.tabStream
  } else if (plan.kind === "mic-on-video" && input.micStream) {
    recordingStream = createMediaStreamFromTracks([
      ...input.tabStream.getVideoTracks(),
      ...input.micStream.getAudioTracks(),
    ])
  } else if (plan.kind === "mix-tab-and-mic" && input.micStream) {
    const context = await ensureContext()
    const destination = context.createMediaStreamDestination()
    const tabSource = context.createMediaStreamSource(input.tabStream)
    tabSource.connect(destination)
    tabSource.connect(context.destination)
    sourceNodes.push(tabSource)

    const micSource = context.createMediaStreamSource(input.micStream)
    micSource.connect(destination)
    sourceNodes.push(micSource)

    recordingStream = createMediaStreamFromTracks([
      ...input.tabStream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ])
  }

  return {
    plan: plan.kind,
    recordingStream,
    hasAudio: recordingStream.getAudioTracks().length > 0,
    dispose: () => {
      for (const node of sourceNodes) {
        try {
          node.disconnect?.()
        } catch {
          // Nodes may already be disconnected after the context closes.
        }
      }

      if (audioContext) {
        const contextToClose = audioContext
        audioContext = null
        contextToClose.close().catch(() => {
          // Context may already be closed during restart/teardown.
        })
      }

      stopMediaStreamTracks(input.tabStream)
      if (input.micStream) {
        stopMediaStreamTracks(input.micStream)
      }
    },
  }
}

export function stopMediaStreamTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    try {
      track.stop()
    } catch {
      // Track may already be stopped.
    }
  }
}
