import * as ProgressPrimitive from "@radix-ui/react-progress"
import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The indicator uses `width` instead of a translateX transform so it renders
 * correctly in both LTR and RTL layouts.
 */
function Progress({
  className,
  value,
  max = 100,
  indicatorClassName,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  indicatorClassName?: string
}) {
  const percent =
    value === null || value === undefined || max <= 0
      ? 0
      : Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-primary/10 relative h-2 w-full overflow-hidden rounded-full",
        className
      )}
      value={value}
      max={max}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "bg-brand h-full rounded-full transition-[width] duration-300",
          indicatorClassName
        )}
        style={{ width: `${percent}%` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
