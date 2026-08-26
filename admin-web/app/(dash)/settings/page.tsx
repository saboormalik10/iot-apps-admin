import { getTranslations } from 'next-intl/server';
import { ProfileForm } from '@/features/profile/profile-form';
import { AccessibilityCard } from '@/features/profile/accessibility-card';
import { BrandingForm } from '@/features/org/branding-form';

export default async function SettingsPage() {
  const t = await getTranslations('profile');
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('subtitle')}</p>
      </div>
      <ProfileForm />
      <BrandingForm />
      <AccessibilityCard />
    </div>
  );
}
