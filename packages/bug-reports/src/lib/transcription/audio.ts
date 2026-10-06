import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { OPENAI_TRANSCRIPTION_MAX_BYTES } from "./constants"

export type PreparedAudio = {
  bytes: Buffer
  contentType: string
  filename: string
}

export type PrepareAudioResult =
  | { audio: PreparedAudio; status: "ready" }
  | { error: string; status: "skipped" }

export type FfmpegRunner = (input: {
  inputPath: string
  outputPath: string
}) => Promise<{ ok: boolean; stderr: string }>

let ffmpegAvailableCache: boolean | null = null

export function resetFfmpegAvailabilityCache(): void {
  ffmpegAvailableCache = null
}

export async function isFfmpegAvailable(
  lookUp: () => Promise<boolean> = detectFfmpeg
): Promise<boolean> {
  if (ffmpegAvailableCache !== null) {
    return ffmpegAvailableCache
  }

  ffmpegAvailableCache = await lookUp()
  return ffmpegAvailableCache
}

function detectFfmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", ["-version"], { stdio: "ignore" })
    child.on("error", () => {
      resolve(false)
    })
    child.on("exit", (code) => {
      resolve(code === 0)
    })
  })
}

export function inferAudioFilename(contentType: string | null): string {
  const normalized = contentType?.toLowerCase() ?? ""
  if (normalized.includes("wav")) {
    return "audio.wav"
  }
  if (normalized.includes("mpeg") || normalized.includes("mp3")) {
    return "audio.mp3"
  }
  if (normalized.includes("mp4") || normalized.includes("m4a")) {
    return "audio.m4a"
  }
  if (normalized.includes("ogg")) {
    return "audio.ogg"
  }
  return "audio.webm"
}

export function inferAudioContentType(filename: string): string {
  if (filename.endsWith(".mp3")) {
    return "audio/mpeg"
  }
  if (filename.endsWith(".wav")) {
    return "audio/wav"
  }
  if (filename.endsWith(".m4a")) {
    return "audio/mp4"
  }
  if (filename.endsWith(".ogg")) {
    return "audio/ogg"
  }
  return "audio/webm"
}

export async function prepareAudioForOpenAi(input: {
  bytes: Buffer
  contentType: string | null
  ffmpegAvailable?: () => Promise<boolean>
  runFfmpeg?: FfmpegRunner
}): Promise<PrepareAudioResult> {
  const originalFilename = inferAudioFilename(input.contentType)
  if (input.bytes.byteLength <= OPENAI_TRANSCRIPTION_MAX_BYTES) {
    return {
      audio: {
        bytes: input.bytes,
        contentType:
          input.contentType || inferAudioContentType(originalFilename),
        filename: originalFilename,
      },
      status: "ready",
    }
  }

  const ffmpegReady = await (input.ffmpegAvailable ?? isFfmpegAvailable)()
  if (!ffmpegReady) {
    return {
      error:
        "Audio exceeds OpenAI's 25MB limit and ffmpeg is not available to extract or compress it.",
      status: "skipped",
    }
  }

  const compressed = await compressAudioWithFfmpeg({
    bytes: input.bytes,
    runFfmpeg: input.runFfmpeg,
  })

  if (!compressed) {
    return {
      error:
        "ffmpeg could not extract a compressed audio track under OpenAI's 25MB limit.",
      status: "skipped",
    }
  }

  if (compressed.byteLength > OPENAI_TRANSCRIPTION_MAX_BYTES) {
    return {
      error:
        "Compressed audio still exceeds OpenAI's 25MB transcription limit.",
      status: "skipped",
    }
  }

  return {
    audio: {
      bytes: compressed,
      contentType: "audio/mpeg",
      filename: "audio.mp3",
    },
    status: "ready",
  }
}

async function compressAudioWithFfmpeg(input: {
  bytes: Buffer
  runFfmpeg?: FfmpegRunner
}): Promise<Buffer | null> {
  const directory = await mkdtemp(join(tmpdir(), "crikket-stt-"))
  const inputPath = join(directory, "input.bin")
  const outputPath = join(directory, "audio.mp3")

  try {
    await writeFile(inputPath, input.bytes)
    const runner = input.runFfmpeg ?? runSystemFfmpeg
    const result = await runner({ inputPath, outputPath })
    if (!result.ok) {
      return null
    }

    return await readFile(outputPath)
  } catch {
    return null
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

function runSystemFfmpeg(input: {
  inputPath: string
  outputPath: string
}): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      "ffmpeg",
      [
        "-y",
        "-i",
        input.inputPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "32k",
        "-f",
        "mp3",
        input.outputPath,
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    )

    let stderr = ""
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8")
    })
    child.on("error", () => {
      resolve({ ok: false, stderr })
    })
    child.on("exit", (code) => {
      resolve({ ok: code === 0, stderr })
    })
  })
}
