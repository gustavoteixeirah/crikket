"use client"

import { authClient } from "@crikket/auth/client"
import { Icons } from "@crikket/ui/components/icons"
import { Button } from "@crikket/ui/components/ui/button"
import { useState } from "react"
import { toast } from "sonner"
import { getAuthErrorMessage } from "@/lib/auth"

type GoogleAuthButtonProps = {
  callbackURL: string
  disabled?: boolean
  onPendingChange?: (isPending: boolean) => void
}

export function GoogleAuthButton({
  callbackURL,
  disabled = false,
  onPendingChange,
}: GoogleAuthButtonProps) {
  const [isPending, setIsPending] = useState(false)

  const handleGoogleSignIn = async () => {
    setIsPending(true)
    onPendingChange?.(true)

    const result = await authClient.signIn
      .social({
        provider: "google",
        callbackURL,
      })
      .catch(() => null)

    if (!result) {
      toast.error("Unable to reach the auth server. Please try again.")
      setIsPending(false)
      onPendingChange?.(false)
      return
    }

    if (result.error) {
      toast.error(getAuthErrorMessage(result.error))
      setIsPending(false)
      onPendingChange?.(false)
    }
  }

  return (
    <>
      <Button
        className="h-12 w-full font-semibold text-base shadow-sm transition-all hover:bg-muted/50 hover:shadow-md active:scale-[0.98]"
        disabled={disabled || isPending}
        onClick={handleGoogleSignIn}
        type="button"
        variant="outline"
      >
        <Icons.google className="mr-3 h-5 w-5" />
        Continue with Google
      </Button>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-muted border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 font-medium text-muted-foreground">
            Or continue with email
          </span>
        </div>
      </div>
    </>
  )
}
