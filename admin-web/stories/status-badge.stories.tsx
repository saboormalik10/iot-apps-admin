import type { Meta, StoryObj } from '@storybook/react';
import { CheckCircle2, AlertTriangle, XCircle, Info, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/**
 * Status tokens always ship with an icon + label — never colour alone (plan §4
 * a11y rule). These compose the validated status roles from the design system.
 */
const meta: Meta<typeof Badge> = {
  title: 'Design System/Status Badges',
  component: Badge,
};
export default meta;

type Story = StoryObj<typeof Badge>;

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="ok">
        <CheckCircle2 className="h-3 w-3" /> Online
      </Badge>
      <Badge variant="warn">
        <AlertTriangle className="h-3 w-3" /> Warning
      </Badge>
      <Badge variant="error">
        <XCircle className="h-3 w-3" /> Critical
      </Badge>
      <Badge variant="info">
        <Info className="h-3 w-3" /> Info
      </Badge>
      <Badge variant="offline">
        <WifiOff className="h-3 w-3" /> Offline
      </Badge>
    </div>
  ),
};
