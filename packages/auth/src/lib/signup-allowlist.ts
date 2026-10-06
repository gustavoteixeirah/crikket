export type SignupAllowlistConfig = {
  allowedDomains: readonly string[]
  allowedEmails: readonly string[]
}

export type SignupAccessMode = "create-account" | "sign-in"

export type EvaluateSignupAccessInput = {
  config: SignupAllowlistConfig
  email: string
  hasPendingOrganizationInvitation?: boolean
  mode: SignupAccessMode
}

export type EvaluateSignupAccessResult =
  | { allowed: true }
  | { allowed: false; message: string }

const SIGNUP_RESTRICTED_MESSAGE =
  "Sign up is restricted. This email address is not allowed to create an account."

export function normalizeSignupEmail(email: string): string {
  return email.trim().toLowerCase()
}

function normalizeAllowlistEntries(values: readonly string[]): string[] {
  return values
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0)
}

export function isSignupAllowlistUnrestricted(
  config: SignupAllowlistConfig
): boolean {
  const allowedDomains = normalizeAllowlistEntries(config.allowedDomains)
  const allowedEmails = normalizeAllowlistEntries(config.allowedEmails)

  return (
    (allowedDomains.length === 0 && allowedEmails.length === 0) ||
    allowedDomains.includes("*")
  )
}

export function isSignupEmailOnAllowlist(
  email: string,
  config: SignupAllowlistConfig
): boolean {
  if (isSignupAllowlistUnrestricted(config)) {
    return true
  }

  const normalizedEmail = normalizeSignupEmail(email)
  if (!normalizedEmail.includes("@")) {
    return false
  }

  const allowedEmails = normalizeAllowlistEntries(config.allowedEmails)
  if (allowedEmails.includes(normalizedEmail)) {
    return true
  }

  const domain = normalizedEmail.split("@")[1] ?? ""
  const allowedDomains = normalizeAllowlistEntries(config.allowedDomains)

  return domain.length > 0 && allowedDomains.includes(domain)
}

export function getSignupRestrictedMessage(
  config: SignupAllowlistConfig
): string {
  const allowedEmails = normalizeAllowlistEntries(config.allowedEmails)
  const allowedDomains = normalizeAllowlistEntries(
    config.allowedDomains
  ).filter((domain) => domain !== "*")

  if (allowedEmails.length === 0 && allowedDomains.length > 0) {
    return `Sign up is only available for ${allowedDomains.join(", ")} domains.`
  }

  return SIGNUP_RESTRICTED_MESSAGE
}

export function evaluateSignupAccess(
  input: EvaluateSignupAccessInput
): EvaluateSignupAccessResult {
  // Existing accounts can always sign in. The allowlist only gates account creation.
  if (input.mode === "sign-in") {
    return { allowed: true }
  }

  if (isSignupEmailOnAllowlist(input.email, input.config)) {
    return { allowed: true }
  }

  if (input.hasPendingOrganizationInvitation) {
    return { allowed: true }
  }

  return {
    allowed: false,
    message: getSignupRestrictedMessage(input.config),
  }
}
