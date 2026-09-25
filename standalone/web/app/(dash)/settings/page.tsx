import { getTranslations } from 'next-intl/server';
import { ProfileForm } from '@/features/profile/profile-form';
import { AccessibilityCard } from '@/features/profile/accessibility-card';
import { BrandingForm } from '@/features/org/branding-form';
import { DisplayUnitsForm } from '@/features/org/display-units-form';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Can } from '@/lib/rbac/guard';

export default async function SettingsPage() {
  const t = await getTranslations('profile');
  const to = await getTranslations('org');
  const tn = await getTranslations('nav');
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{tn('settings')}</h1>
        <p className="mt-1 text-muted-foreground">{t('subtitle')}</p>
      </div>
      <ProfileForm />
      {/* The organisation page was reachable only by typing /org — the one place
          to change the site's time zone, with no way to find it. */}
      <Can capability="manageOrg">
        <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{to('siteLinkTitle')}</h2>
            <p className="text-sm text-muted-foreground">{to('siteLinkBody')}</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/org">{to('siteLinkAction')}</Link>
          </Button>
        </Card>
      </Can>
      <BrandingForm />
      <DisplayUnitsForm />
      <AccessibilityCard />
    </div>
  );
}
