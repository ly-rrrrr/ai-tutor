import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MapViewProps {
  className?: string;
  placeholder?: ReactNode;
}

export function MapView({ className, placeholder }: MapViewProps) {
  return (
    <div
      className={cn(
        "flex h-[500px] w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground",
        className
      )}
    >
      {placeholder || "Map support is not enabled in this build."}
    </div>
  );
}
