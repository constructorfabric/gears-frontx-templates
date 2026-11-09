// @cpt-dod:cpt-frontx-dod-studio-devtools-control-panel:p1
import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';

import { cn } from '../lib/utils';

type TextDirection = 'ltr' | 'rtl';

const DropdownMenu = ({
  dir,
  ...props
}: Omit<React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Root>, 'dir'> & {
  dir?: TextDirection;
}) => (
  <DropdownMenuPrimitive.Root
    {...props}
    dir={dir as 'ltr' | 'rtl' | undefined}
  />
);
DropdownMenu.displayName = 'DropdownMenu';

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

const DropdownMenuContent = ({
  ref,
  className,
  sideOffset = 4,
  container,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> & {
  container?: HTMLElement | null;
  ref?: React.Ref<React.ComponentRef<typeof DropdownMenuPrimitive.Content>>;
}) => (
  <DropdownMenuPrimitive.Portal container={container ?? undefined}>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn('studio-menu', className)}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
);
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = ({
  ref,
  className,
  inset,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean;
  ref?: React.Ref<React.ComponentRef<typeof DropdownMenuPrimitive.Item>>;
}) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      'studio-menu__item',
      inset && 'studio-menu__item--inset',
      className
    )}
    {...props}
  />
);
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
};
