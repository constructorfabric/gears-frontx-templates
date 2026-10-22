import {
  Tooltip as UiTooltip,
  TooltipContent as UiTooltipContent,
  TooltipTrigger as UiTooltipTrigger,
} from "@gears-frontx/ui-kit";
import { useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { resolvePortalContainer } from "../portal-layer";

interface TooltipProps {
  /** The control the tooltip names; it must accept a ref and pointer/focus handlers. */
  readonly children: ReactElement;
  readonly label: ReactNode;
}

/**
 * ui-kit's tooltip as a chip below its control. It portals into the control's own layer, so it
 * stays above an open popover or dialog and inside a shadow root; fixed positioning keeps a
 * clipping panel from cutting it off.
 */
export const Tooltip = ({ children, label }: TooltipProps) => {
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);

  return (
    <UiTooltip>
      <UiTooltipTrigger ref={setTrigger} render={children} />
      {trigger === null ? null : (
        <UiTooltipContent
          container={resolvePortalContainer(trigger)}
          positionMethod="fixed"
          side="bottom"
        >
          {label}
        </UiTooltipContent>
      )}
    </UiTooltip>
  );
};
