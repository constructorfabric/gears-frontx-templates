/**
 * Skeleton Component - the kit's Skeleton with an option to paint in the
 * surrounding text colour instead of the muted fill
 */

import { Skeleton as KitSkeleton } from "@gears-frontx/ui-kit"

import { cn } from "@/app/lib/utils"
import styles from "./skeleton.module.css"

function Skeleton({
  className,
  inheritColor = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { inheritColor?: boolean }) {
  return (
    <KitSkeleton
      className={cn(inheritColor && styles.inheritColor, className)}
      {...props}
    />
  )
}

export { Skeleton }
