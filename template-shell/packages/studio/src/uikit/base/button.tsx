// @cpt-dod:cpt-frontx-dod-studio-devtools-control-panel:p1
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '../lib/utils';
import { ButtonVariant, ButtonSize } from '../types';

/**
 * Class names for a button of the given variant and size; the rules live in
 * studioStyles.ts under `studio-button`.
 */
const buttonVariants = ({
  variant = ButtonVariant.Default,
  size = ButtonSize.Default,
  className,
}: {
  variant?: ButtonVariant | null;
  size?: ButtonSize | null;
  className?: string;
} = {}) =>
  cn(
    'studio-button',
    `studio-button--${variant ?? ButtonVariant.Default}`,
    `studio-button--size-${size ?? ButtonSize.Default}`,
    className
  );

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | null;
  size?: ButtonSize | null;
  asChild?: boolean;
}

const Button = ({
  ref,
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps & {
  ref?: React.Ref<HTMLButtonElement>;
}) => {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={buttonVariants({ variant, size, className })}
      ref={ref}
      {...props}
    />
  );
};
Button.displayName = 'Button';

export { Button, buttonVariants };
