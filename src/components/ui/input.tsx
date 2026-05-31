import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-full w-full bg-transparent text-foreground placeholder:text-muted-2",
        "outline-none border-none text-[15px]",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
