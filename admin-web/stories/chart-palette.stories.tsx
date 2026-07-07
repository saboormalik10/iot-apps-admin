import type { Meta, StoryObj } from '@storybook/react';

/**
 * The categorical chart palette (plan §4), referenced BY ROLE. Validated by
 * scripts/validate_palette.js (contrast + CVD) in CI.
 */
const meta: Meta = { title: 'Design System/Chart Palette' };
export default meta;

type Story = StoryObj;

export const Categorical: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
        <div key={n} className="flex flex-col items-center gap-1">
          <div
            className="h-16 w-16 rounded-md border"
            style={{ backgroundColor: `hsl(var(--chart-${n}))` }}
          />
          <span className="text-xs text-muted-foreground">chart-{n}</span>
        </div>
      ))}
    </div>
  ),
};
