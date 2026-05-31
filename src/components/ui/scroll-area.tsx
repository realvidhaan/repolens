import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight scroll container with themed thin scrollbars.
 * Forwards a ref so callers can drive auto-scroll (e.g. chat to bottom).
 */
const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("scroll-thin overflow-y-auto", className)}
      {...props}
    >
      {children}
    </div>
  );
});
ScrollArea.displayName = "ScrollArea";

export { ScrollArea };
