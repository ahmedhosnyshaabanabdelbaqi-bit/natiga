import { Slot, Slottable } from "@radix-ui/react-slot"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
} from "lucide-react"
import * as React from "react"

import { buttonVariants, type Button } from "@/components/ui/button"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label={t("ui.pagination.label")}
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex flex-row items-center gap-1", className)}
      {...props}
    />
  )
}

function PaginationItem({ ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
  /** Render the single child element (e.g. an Inertia `<Link>`) instead of an anchor. */
  asChild?: boolean
} & Pick<React.ComponentProps<typeof Button>, "size"> &
  React.ComponentProps<"a">

function PaginationLink({
  className,
  isActive,
  asChild = false,
  size = "icon",
  ...props
}: PaginationLinkProps) {
  const Comp = asChild ? Slot : "a"

  return (
    <Comp
      aria-current={isActive ? "page" : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      className={cn(
        buttonVariants({
          variant: isActive ? "outline" : "ghost",
          size,
        }),
        className
      )}
      {...props}
    />
  )
}

type PaginationNavProps = React.ComponentProps<typeof PaginationLink> & {
  /** Visible text (defaults to core.actions.previous / next). */
  label?: string
}

/**
 * With `asChild`, pass the `<Link>` as the only child: the icon and label are
 * rendered inside it (Radix Slottable).
 */
function PaginationPrevious({
  className,
  children,
  label,
  asChild = false,
  ...props
}: PaginationNavProps) {
  return (
    <PaginationLink
      aria-label={t("ui.pagination.previous")}
      size="default"
      asChild={asChild}
      className={cn("gap-1 px-2.5 sm:ps-2.5", className)}
      {...props}
    >
      {asChild ? <Slottable>{children}</Slottable> : null}
      <ChevronLeftIcon className="rtl:rotate-180" />
      <span className="hidden sm:block">
        {label ?? t("core.actions.previous")}
      </span>
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  children,
  label,
  asChild = false,
  ...props
}: PaginationNavProps) {
  return (
    <PaginationLink
      aria-label={t("ui.pagination.next")}
      size="default"
      asChild={asChild}
      className={cn("gap-1 px-2.5 sm:pe-2.5", className)}
      {...props}
    >
      {asChild ? <Slottable>{children}</Slottable> : null}
      <span className="hidden sm:block">
        {label ?? t("core.actions.next")}
      </span>
      <ChevronRightIcon className="rtl:rotate-180" />
    </PaginationLink>
  )
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn("flex size-9 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontalIcon className="size-4" />
      <span className="sr-only">{t("ui.pagination.more")}</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
}
