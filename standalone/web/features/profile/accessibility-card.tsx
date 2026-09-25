'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useA11yPrefs } from '@/lib/a11y-prefs';

/**
 * Accessibility settings (plan §Month 12). Exposes the opt-in half of the chart
 * texture channel; print and forced-colors switch it on by themselves (CSS), so
 * this control is about full-severity colour-vision deficiency on screen, where
 * nothing else can infer the need.
 */
export function AccessibilityCard() {
  const t = useTranslations('a11y');
  const { texture, setTexture } = useA11yPrefs();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <Label htmlFor="texture-toggle">{t('textureLabel')}</Label>
            <p className="text-sm text-muted-foreground">{t('textureHelp')}</p>
          </div>
          <Switch
            id="texture-toggle"
            checked={texture}
            onCheckedChange={setTexture}
            aria-describedby="texture-help"
          />
        </div>
        <p id="texture-help" className="sr-only">
          {t('textureHelp')}
        </p>
      </CardContent>
    </Card>
  );
}
