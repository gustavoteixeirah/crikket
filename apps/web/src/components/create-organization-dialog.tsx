"use client"

import { authClient } from "@crikket/auth/client"
import { Button } from "@crikket/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@crikket/ui/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@crikket/ui/components/ui/field"
import { Input } from "@crikket/ui/components/ui/input"
import { useForm } from "@tanstack/react-form"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "nextjs-toploader/app"
import { toast } from "sonner"
import {
  shouldAutoSyncOrganizationSlug,
  slugifyOrganizationName,
} from "@/lib/organization"
import { organizationFormSchema } from "@/lib/schema/organization"
import { queryClient } from "@/utils/orpc"

interface CreateOrganizationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateOrganizationDialog({
  open,
  onOpenChange,
}: CreateOrganizationDialogProps) {
  const router = useRouter()
  const { mutateAsync: createOrg, isPending } = useMutation({
    mutationFn: async (values: { name: string; slug: string }) => {
      const { data, error } = await authClient.organization.create(values)
      if (error) throw error
      return data
    },
    onError: (error) => {
      toast.error(error.message ?? "Failed to create organization")
    },
  })

  const form = useForm({
    defaultValues: {
      name: "",
      slug: "",
    },
    validators: {
      onChange: organizationFormSchema,
    },
    onSubmit: async ({ value }) => {
      const organization = await createOrg({
        name: value.name,
        slug: value.slug,
      })
      const newOrganizationId = organization?.id

      if (newOrganizationId) {
        const { error: setActiveError } =
          await authClient.organization.setActive({
            organizationId: newOrganizationId,
          })

        if (setActiveError) {
          toast.error(
            setActiveError.message ?? "Failed to activate organization"
          )
        }
      }

      await queryClient.invalidateQueries()
      toast.success("Organization created successfully")
      onOpenChange(false)
      router.refresh()
      form.reset()
    },
  })

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Organization</DialogTitle>
          <DialogDescription>
            Create a new organization to manage your team and projects.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
        >
          <div className="grid gap-4 py-4">
            <form.Field name="name">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched &&
                  field.state.meta.errors.length > 0
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      Organization Name
                    </FieldLabel>
                    <Input
                      aria-invalid={isInvalid}
                      autoComplete="off"
                      id={field.name}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => {
                        const newName = e.target.value
                        const oldName = field.state.value
                        field.handleChange(newName)

                        const currentSlug = form.getFieldValue("slug")
                        if (
                          shouldAutoSyncOrganizationSlug(currentSlug, oldName)
                        ) {
                          form.setFieldValue(
                            "slug",
                            slugifyOrganizationName(newName)
                          )
                        }
                      }}
                      placeholder="Acme Corp"
                      value={field.state.value}
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            </form.Field>

            <form.Field name="slug">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched &&
                  field.state.meta.errors.length > 0
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Slug</FieldLabel>
                    <Input
                      aria-invalid={isInvalid}
                      id={field.name}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="acme-corp"
                      value={field.state.value}
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            </form.Field>
          </div>
          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={isPending || form.state.isSubmitting}
              type="submit"
            >
              {isPending || form.state.isSubmitting
                ? "Creating..."
                : "Create Organization"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
