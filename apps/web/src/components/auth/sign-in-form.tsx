"use client"

import { authClient } from "@crikket/auth/client"
import { env } from "@crikket/env/web"
import { Loader } from "@crikket/ui/components/loader"
import { Button } from "@crikket/ui/components/ui/button"
import { Field, FieldError, FieldLabel } from "@crikket/ui/components/ui/field"
import { Input } from "@crikket/ui/components/ui/input"
import { useForm } from "@tanstack/react-form"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "nextjs-toploader/app"
import { parseAsString, useQueryState } from "nuqs"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { AuthShell } from "@/components/auth/auth-shell"
import { GoogleAuthButton } from "@/components/auth/google-auth-button"
import { getAuthErrorMessage } from "@/lib/auth"
import { loginFormSchema } from "@/lib/schema/auth"
import { orpc } from "@/utils/orpc"

export function SignInForm({
  googleAuthEnabled: googleAuthEnabledFromServer = false,
}: {
  googleAuthEnabled?: boolean
}) {
  const router = useRouter()
  const [emailQuery] = useQueryState("email", parseAsString.withDefault(""))
  const [callbackUrlQuery] = useQueryState(
    "callbackURL",
    parseAsString.withDefault(env.NEXT_PUBLIC_APP_URL)
  )
  const { data: session, isPending } = authClient.useSession()
  const [isSocialSignInPending, setIsSocialSignInPending] = useState(false)
  const publicConfigQuery = useQuery(
    orpc.auth.getPublicAuthConfig.queryOptions()
  )
  const googleAuthEnabled =
    publicConfigQuery.data?.googleAuthEnabled ?? googleAuthEnabledFromServer
  const callbackURL = useMemo(() => {
    try {
      const appUrl = new URL(env.NEXT_PUBLIC_APP_URL)
      const parsed = new URL(callbackUrlQuery, appUrl)

      if (parsed.origin !== appUrl.origin) {
        return env.NEXT_PUBLIC_APP_URL
      }

      return parsed.toString()
    } catch {
      return env.NEXT_PUBLIC_APP_URL
    }
  }, [callbackUrlQuery])

  const form = useForm({
    defaultValues: {
      email: emailQuery,
      password: "",
    },
    validators: {
      onChange: loginFormSchema,
    },
    onSubmit: async ({ value }) => {
      const result = await authClient.signIn
        .email({
          email: value.email,
          password: value.password,
          callbackURL,
        })
        .catch(() => null)

      if (!result) {
        toast.error(
          "Unable to reach the auth server. Please try again in a moment."
        )
        return
      }

      if (result.error) {
        toast.error(getAuthErrorMessage(result.error))
        return
      }

      toast.success("Signed in successfully.")
      try {
        const parsed = new URL(callbackURL)
        const nextPath = `${parsed.pathname}${parsed.search}${parsed.hash}`
        router.push((nextPath.length > 0 ? nextPath : "/") as never)
      } catch {
        router.push("/")
      }
    },
  })

  useEffect(() => {
    if (session) {
      router.replace("/")
    }
  }, [router, session])

  if (isPending) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader />
      </div>
    )
  }

  if (session) {
    return null
  }

  return (
    <AuthShell
      description="Sign in to your account to continue"
      title="Welcome back"
    >
      {googleAuthEnabled ? (
        <GoogleAuthButton
          callbackURL={callbackURL}
          disabled={form.state.isSubmitting}
          onPendingChange={setIsSocialSignInPending}
        />
      ) : null}

      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          form.handleSubmit()
        }}
      >
        <form.Field name="email">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && field.state.meta.errors.length > 0

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                <Input
                  aria-invalid={isInvalid}
                  autoComplete="email"
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={field.state.value}
                />
                {isInvalid ? (
                  <FieldError errors={field.state.meta.errors} />
                ) : null}
              </Field>
            )
          }}
        </form.Field>

        <form.Field name="password">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && field.state.meta.errors.length > 0

            return (
              <Field data-invalid={isInvalid}>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                  <Link
                    className="text-muted-foreground text-sm transition hover:text-foreground"
                    href="/forgot-password"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  aria-invalid={isInvalid}
                  autoComplete="current-password"
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="••••••••"
                  required
                  type="password"
                  value={field.state.value}
                />
                {isInvalid ? (
                  <FieldError errors={field.state.meta.errors} />
                ) : null}
              </Field>
            )
          }}
        </form.Field>

        <Button
          className="h-11 w-full font-semibold"
          disabled={form.state.isSubmitting || isSocialSignInPending}
          type="submit"
        >
          {form.state.isSubmitting ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <p className="text-center text-muted-foreground text-sm">
        Don&apos;t have an account?{" "}
        <Link
          className="font-medium text-foreground hover:underline"
          href="/register"
        >
          Sign up
        </Link>
      </p>
    </AuthShell>
  )
}
