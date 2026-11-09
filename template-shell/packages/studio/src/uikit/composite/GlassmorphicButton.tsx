import React from 'react';
import { Button } from '../base/button';
import { ButtonVariant } from '../types';

interface GlassmorphicButtonProps {
  icon: React.ReactNode;
  onMouseDown?: (e: React.MouseEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  isDragging?: boolean;
  /**
   * Declared rather than picked up from a rest spread, because this component
   * takes a closed prop set on purpose: the caller supplies an icon and the
   * component owns everything about how the control looks. The test id is the
   * one attribute a caller has to be able to put on the rendered control, so
   * it is admitted by name and nothing else comes with it.
   */
  'data-testid'?: string;
}

/**
 * Glassmorphic Button
 * Circular button with glassmorphic styling (blur, transparency, saturation)
 * Renders content behind it with a frosted glass effect
 */
export const GlassmorphicButton: React.FC<GlassmorphicButtonProps> = ({
  icon,
  onMouseDown,
  onClick,
  title,
  isDragging = false,
  'data-testid': testId,
}) => {
  return (
    <Button
      variant={ButtonVariant.Ghost}
      data-testid={testId}
      onMouseDown={onMouseDown}
      onClick={onClick}
      title={title}
      className="studio-glass studio-glass-button"
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      {icon}
    </Button>
  );
};

GlassmorphicButton.displayName = 'GlassmorphicButton';
