import * as React from "react"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/**
 * Low-level form field composition (label / control / description / error).
 * For the batteries-included version with automatic id wiring use
 * `FormField` from `@/components/shared`.
 */
function Field({
  className,
  invalid,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & {
  invalid?: boolean
  orientation?: "vertical" | "horizontal"
}) {
  return (
    <div
      role="group"
      data-slot="field"
      data-invalid={invalid ? "true" : undefined}
      data-orientation={orientation}
      className={cn(
        "group/field flex w-full gap-2 data-[invalid=true]:text-destructive",
        orientation === "vertical" && "flex-col",
        orientation === "horizontal" && "flex-row items-center [&>[data-slot=label]]:flex-auto",
        className
      )}
      {...props}
    />
  )
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn("flex w-full flex-col gap-6", className)}
      {...props}
    />
  )
}

function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        "group-data-[invalid=true]/field:text-destructive flex w-fit items-center gap-1 leading-snug",
        className
      )}
      {...props}
    />
  )
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        "text-muted-foreground text-sm leading-normal font-normal [&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4",
        className
      )}
      {...props}
    />
  )
}

function FieldError({
  className,
  children,
  ...props
}: React.ComponentProps<"p">) {
  if (!children) {
    return null
  }

  return (
    <p
      role="alert"
      data-slot="field-error"
      className={cn("text-destructive text-sm font-normal", className)}
      {...props}
    >
      {children}
    </p>
  )
}

export { Field, FieldGroup, FieldLabel, FieldDescription, FieldError }
