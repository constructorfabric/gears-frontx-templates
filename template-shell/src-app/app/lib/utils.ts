import { clsx, type ClassValue } from "clsx"

/** Joins class names, skipping falsy entries. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}
