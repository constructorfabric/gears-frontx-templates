import { clsx } from "clsx";
import type { HTMLAttributes, Ref } from "react";

import styles from "./scroll-region.module.css";

interface ScrollRegionProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "ref"
> {
  readonly ref?: Ref<HTMLDivElement>;
}

export const ScrollRegion = ({
  className,
  onScroll,
  ref,
  ...props
}: ScrollRegionProps) => (
  <div
    ref={ref}
    className={clsx(styles.scrollRegion, className)}
    onScroll={(event) => {
      event.currentTarget.toggleAttribute(
        "data-scrolled",
        event.currentTarget.scrollTop > 0
      );
      onScroll?.(event);
    }}
    {...props}
  />
);

ScrollRegion.displayName = "ScrollRegion";
