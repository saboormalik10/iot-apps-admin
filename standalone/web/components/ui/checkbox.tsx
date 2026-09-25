'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A native checkbox with the design system's tokens.
 *
 * Deliberately NOT a Radix primitive: the project has no checkbox dependency and
 * `<input type="checkbox">` is already keyboard-operable, announced correctly and
 * indeterminate-capable. Adding a package to restyle that would be cost without
 * benefit.
 */
export const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> & {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }
>(({ className, checked, onCheckedChange, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    checked={checked}
    onChange={(e) => onCheckedChange?.(e.currentTarget.checked)}
    className={cn(
      'mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border text-primary',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Checkbox.displayName = 'Checkbox';
