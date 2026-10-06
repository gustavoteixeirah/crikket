import type { Metadata } from "next"
import { Suspense } from "react"
import { SignInForm } from "@/components/auth/sign-in-form"
import { loadPublicAuthConfig } from "@/lib/public-auth-config"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your Crikket account.",
}

export default async function LoginPage() {
  const { googleAuthEnabled } = await loadPublicAuthConfig()

  return (
    <Suspense fallback={null}>
      <SignInForm googleAuthEnabled={googleAuthEnabled} />
    </Suspense>
  )
}
