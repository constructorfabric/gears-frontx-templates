// @cpt-dod:cpt-frontx-dod-studio-devtools-control-panel:p1
import { clsx, type ClassValue } from 'clsx';

/** Joins class names, skipping falsy values. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
