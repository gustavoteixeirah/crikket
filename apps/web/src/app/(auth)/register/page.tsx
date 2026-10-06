import type { Metadata } from "next"

import { SignUpForm } from "@/components/auth/sign-up-form"
import { loadPublicAuthConfig } from "@/lib/public-auth-config"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create your Crikket account.",
}

export default async function RegisterPage() {
  const { googleAuthEnabled } = await loadPublicAuthConfig()

  return <SignUpForm googleAuthEnabled={googleAuthEnabled} />
}
