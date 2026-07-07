'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';

/**
 * Lightweight popover built on the Radix Dialog primitive (already a dependency)
 * so we don't add @radix-ui/react-popover. Used for the notification-bell panel.
 */
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverClose = PopoverPrimitive.Close;

const PopoverContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, children, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Overlay className="fixed inset-0 z-40" />
    <PopoverPrimitive.Content
      className={cn(
        'fixed right-4 top-16 z-50 w-80 rounded-md border bg-popover p-2 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className,
      )}
    >
      <div ref={ref} {...props}>
        {children}
      </div>
    </PopoverPrimitive.Content>
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = 'PopoverContent';

export { Popover, PopoverTrigger, PopoverContent, PopoverClose };
