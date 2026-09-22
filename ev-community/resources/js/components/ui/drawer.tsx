import * as React from "react"

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

/**
 * Bottom sheet for mobile (filters, quick actions). Built on the Sheet
 * primitive with rounded top corners, a drag handle and safe-area padding.
 */
function Drawer({ ...props }: React.ComponentProps<typeof Sheet>) {
  return <Sheet data-slot="drawer" {...props} />
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof SheetTrigger>) {
  return <SheetTrigger data-slot="drawer-trigger" {...props} />
}

function DrawerClose({ ...props }: React.ComponentProps<typeof SheetClose>) {
  return <SheetClose data-slot="drawer-close" {...props} />
}

function DrawerContent({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof SheetContent>, "side">) {
  return (
    <SheetContent
      side="bottom"
      data-slot="drawer-content"
      className={cn(
        "max-h-[85svh] gap-0 overflow-y-auto rounded-t-2xl border-t safe-bottom",
        className
      )}
      {...props}
    >
      <div
        aria-hidden="true"
        className="bg-muted-foreground/40 mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full"
      />
      {children}
    </SheetContent>
  )
}

function DrawerHeader({
  className,
  ...props
}: React.ComponentProps<typeof SheetHeader>) {
  return (
    <SheetHeader
      data-slot="drawer-header"
      className={cn("text-start", className)}
      {...props}
    />
  )
}

function DrawerFooter({
  className,
  ...props
}: React.ComponentProps<typeof SheetFooter>) {
  return (
    <SheetFooter
      data-slot="drawer-footer"
      className={cn("flex-row justify-end", className)}
      {...props}
    />
  )
}

function DrawerTitle({ ...props }: React.ComponentProps<typeof SheetTitle>) {
  return <SheetTitle data-slot="drawer-title" {...props} />
}

function DrawerDescription({
  ...props
}: React.ComponentProps<typeof SheetDescription>) {
  return <SheetDescription data-slot="drawer-description" {...props} />
}

export {
  Drawer,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
