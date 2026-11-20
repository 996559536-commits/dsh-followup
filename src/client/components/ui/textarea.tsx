// Source: https://ui.shadcn.com/r/styles/new-york/textarea.json (MIT)
import * as React from "react"

import { cn } from "../../utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea"> & { variant?: "default" | "plain" }
>(({ className, variant = "default", ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        variant === "plain" && "rounded-none border-0 p-0 shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
