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
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { AuthShell } from "@/components/auth/auth-shell"
import { GoogleAuthButton } from "@/components/auth/google-auth-button"
import { AUTH_MIN_PASSWORD_LENGTH, getAuthErrorMessage } from "@/lib/auth"
import { registerFormSchema } from "@/lib/schema/auth"
import { orpc } from "@/utils/orpc"

interface SignUpFormProps {
  callbackURL?: string
  description?: string
  googleAuthEnabled?: boolean
  lockedEmail?: string
  onAccountCreated?: () => Promise<void>
  redirectWhenAuthenticated?: boolean
  signInHref?: string
  submitLabel?: string
  title?: string
}

export function SignUpForm({
  callbackURL = env.NEXT_PUBLIC_APP_URL,
  description = "Create your account to get started",
  googleAuthEnabled: googleAuthEnabledFromServer = false,
  lockedEmail,
  onAccountCreated,
  redirectWhenAuthenticated = true,
  signInHref = "/login",
  submitLabel = "Sign up",
  title = "Create account",
}: SignUpFormProps) {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()
  const [isSocialSignInPending, setIsSocialSignInPending] = useState(false)
  const publicConfigQuery = useQuery(
    orpc.auth.getPublicAuthConfig.queryOptions()
  )
  const googleAuthEnabled =
    publicConfigQuery.data?.googleAuthEnabled ?? googleAuthEnabledFromServer

  const form = useForm({
    defaultValues: {
      name: "",
      email: lockedEmail ?? "",
      password: "",
      confirmPassword: "",
    },
    validators: {
      onChange: registerFormSchema,
    },
    onSubmit: async ({ value }) => {
      const email = lockedEmail ?? value.email
      const result = await authClient.signUp
        .email({
          name: value.name,
          email,
          password: value.password,
          callbackURL,
        })
        .catch(() => null)

      if (!result) {
        toast.error("Unable to reach the auth server. Please try again.")
        return
      }

      if (result.error) {
        toast.error(getAuthErrorMessage(result.error))
        return
      }

      if (result.data?.token) {
        toast.success("Account created successfully.")
        if (onAccountCreated) {
          await onAccountCreated()
          return
        }
        router.push("/")
        return
      }

      toast.success("Account created. Sign in to continue.")
      router.push(`/login?email=${encodeURIComponent(email)}`)
    },
  })

  useEffect(() => {
    if (session && redirectWhenAuthenticated) {
      router.replace("/")
    }
  }, [redirectWhenAuthenticated, router, session])

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
    <AuthShell description={description} title={title}>
      {googleAuthEnabled && !lockedEmail ? (
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
        <form.Field name="name">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && field.state.meta.errors.length > 0

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                <Input
                  aria-invalid={isInvalid}
                  autoComplete="name"
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="Your name"
                  required
                  value={field.state.value}
                />
                {isInvalid ? (
                  <FieldError errors={field.state.meta.errors} />
                ) : null}
              </Field>
            )
          }}
        </form.Field>

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
                  onChange={(event) => {
                    if (lockedEmail) {
                      return
                    }
                    field.handleChange(event.target.value)
                  }}
                  placeholder="you@example.com"
                  readOnly={Boolean(lockedEmail)}
                  required
                  type="email"
                  value={lockedEmail ?? field.state.value}
                />
                {lockedEmail ? (
                  <p className="text-muted-foreground text-xs">
                    This invitation is locked to {lockedEmail}.
                  </p>
                ) : null}
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
                <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                <Input
                  aria-invalid={isInvalid}
                  autoComplete="new-password"
                  id={field.name}
                  minLength={AUTH_MIN_PASSWORD_LENGTH}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="••••••••"
                  required
                  type="password"
                  value={field.state.value}
                />
                <p className="text-muted-foreground text-xs">
                  Use at least {AUTH_MIN_PASSWORD_LENGTH} characters.
                </p>
                {isInvalid ? (
                  <FieldError errors={field.state.meta.errors} />
                ) : null}
              </Field>
            )
          }}
        </form.Field>

        <form.Field name="confirmPassword">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && field.state.meta.errors.length > 0

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Confirm password</FieldLabel>
                <Input
                  aria-invalid={isInvalid}
                  autoComplete="new-password"
                  id={field.name}
                  minLength={AUTH_MIN_PASSWORD_LENGTH}
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
          {form.state.isSubmitting ? "Creating account..." : submitLabel}
        </Button>
      </form>

      <p className="text-center text-muted-foreground text-sm">
        Already have an account?{" "}
        <Link
          className="font-medium text-foreground hover:underline"
          href={signInHref as never}
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  )
}
