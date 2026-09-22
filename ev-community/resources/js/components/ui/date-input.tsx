import { CalendarIcon, ClockIcon } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"

type DateInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  /** `date` (default), `datetime` (native datetime-local) or `time`. */
  mode?: "date" | "datetime" | "time"
}

const typeForMode: Record<NonNullable<DateInputProps["mode"]>, string> = {
  date: "date",
  datetime: "datetime-local",
  time: "time",
}

/**
 * Styled native date/time input. Values are ISO strings as the browser emits
 * them (`YYYY-MM-DD`, `YYYY-MM-DDTHH:mm`, `HH:mm`). The field itself stays LTR
 * so the native picker renders consistently in RTL layouts.
 */
function DateInput({ className, mode = "date", ...props }: DateInputProps) {
  const Icon = mode === "time" ? ClockIcon : CalendarIcon

  return (
    <div
      data-slot="date-input"
      className={cn("relative flex w-full items-center", className)}
    >
      <input
        type={typeForMode[mode]}
        dir="ltr"
        data-slot="date-input-field"
        className={cn(
          "border-input placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 pe-9 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
          "[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
        )}
        {...props}
      />
      <Icon
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute end-3 size-4"
      />
    </div>
  )
}

export { DateInput }
export type { DateInputProps }
