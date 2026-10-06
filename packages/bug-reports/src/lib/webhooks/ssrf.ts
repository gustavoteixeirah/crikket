import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google",
  "kubernetes",
  "kubernetes.default",
  "kubernetes.default.svc",
])

const BLOCKED_HOSTNAME_SUFFIXES = [".localhost", ".local", ".internal", ".lan"]
const IPV4_MAPPED_V6 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/
const IPV6_MAPPED_PREFIX = /^::ffff:([0-9a-f:]+)$/

export class WebhookUrlBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WebhookUrlBlockedError"
  }
}

export function isPrivateOrLoopbackIp(address: string): boolean {
  const version = isIP(address)
  if (version === 4) {
    return isPrivateIpv4(address)
  }

  if (version === 6) {
    return isPrivateIpv6(address)
  }

  return true
}

export function parseWebhookDestinationUrl(rawUrl: string): URL {
  const trimmed = rawUrl.trim()
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new WebhookUrlBlockedError("Webhook URL is not a valid absolute URL.")
  }

  if (parsed.username || parsed.password) {
    throw new WebhookUrlBlockedError(
      "Webhook URL must not include credentials."
    )
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new WebhookUrlBlockedError("Webhook URL must use http or https.")
  }

  if (!parsed.hostname) {
    throw new WebhookUrlBlockedError("Webhook URL is missing a hostname.")
  }

  return parsed
}

export async function assertWebhookDestinationAllowed(
  rawUrl: string,
  options?: {
    allowPrivate?: boolean
    lookupFn?: (hostname: string) => Promise<Array<{ address: string }>>
  }
): Promise<URL> {
  const parsed = parseWebhookDestinationUrl(rawUrl)
  const allowPrivate = options?.allowPrivate === true

  if (parsed.protocol === "http:" && !allowPrivate) {
    throw new WebhookUrlBlockedError(
      "Webhook URL must use https unless WEBHOOK_ALLOW_PRIVATE_URLS is enabled."
    )
  }

  if (allowPrivate) {
    return parsed
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (isBlockedHostname(hostname)) {
    throw new WebhookUrlBlockedError(
      "Webhook URL hostname is not allowed (private, loopback, or link-local)."
    )
  }

  if (isIP(hostname) && isPrivateOrLoopbackIp(hostname)) {
    throw new WebhookUrlBlockedError(
      "Webhook URL must not target a private or loopback IP address."
    )
  }

  const lookupFn =
    options?.lookupFn ??
    (async (hostname: string) => {
      const records = await lookup(hostname, { all: true, verbatim: true })
      return records
    })
  const records = await lookupFn(hostname)
  if (records.length === 0) {
    throw new WebhookUrlBlockedError(
      "Webhook URL hostname could not be resolved."
    )
  }

  for (const record of records) {
    if (isPrivateOrLoopbackIp(record.address)) {
      throw new WebhookUrlBlockedError(
        "Webhook URL resolved to a private or loopback IP address."
      )
    }
  }

  return parsed
}

function isBlockedHostname(hostname: string): boolean {
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return true
  }

  return BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
}

function isPrivateIpv4(address: string): boolean {
  const octets = address.split(".").map((part) => Number(part))
  const first = octets[0]
  const second = octets[1]
  if (
    octets.length !== 4 ||
    octets.some(
      (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255
    ) ||
    first === undefined ||
    second === undefined
  ) {
    return true
  }

  if (first === 0 || first === 10 || first === 127) {
    return true
  }

  if (first === 169 && second === 254) {
    return true
  }

  if (first === 172 && second >= 16 && second <= 31) {
    return true
  }

  if (first === 192 && second === 168) {
    return true
  }

  return first >= 224
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase()
  if (normalized === "::" || normalized === "::1") {
    return true
  }

  if (normalized.startsWith("fe80:") || normalized.startsWith("fe80::")) {
    return true
  }

  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true
  }

  if (normalized.startsWith("ff")) {
    return true
  }

  const mapped = normalized.match(IPV4_MAPPED_V6)
  if (mapped?.[1]) {
    return isPrivateIpv4(mapped[1])
  }

  const mappedHex = normalized.match(IPV6_MAPPED_PREFIX)
  if (mappedHex?.[1]?.includes(".")) {
    return true
  }

  return false
}
