import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground',
        // Status roles — always paired with an icon/label at the call site.
        ok: 'border-transparent bg-status-ok/15 text-status-ok-strong',
        warn: 'border-transparent bg-status-warn/15 text-status-warn-strong',
        error: 'border-transparent bg-status-error/15 text-status-error-strong',
        info: 'border-transparent bg-status-info/15 text-status-info-strong',
        offline: 'border-transparent bg-status-offline/15 text-status-offline-strong',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
