// @cpt-dod:cpt-frontx-dod-studio-devtools-panel-overlay:p1
import * as React from 'react';

import { cn } from '../lib/utils';

const Card = ({
  ref,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  ref?: React.Ref<HTMLDivElement>;
}) => (
  <div
    ref={ref}
    className={cn('studio-card', className)}
    {...props}
  />
);
Card.displayName = 'Card';

export { Card };
