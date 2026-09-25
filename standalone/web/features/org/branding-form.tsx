'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/form-field';
import { LoadingState, ErrorState } from '@/components/screen-states';
import { Can } from '@/lib/rbac/guard';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import { useBranding, useUpdateBranding, useUploadLogo, useRemoveLogo } from './use-branding';
import { checkAccent } from '@/lib/branding/color';

const HEX = /^#[0-9a-fA-F]{6}$/;
const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * How this customer's copy of the panel is labelled.
 *
 * The customer edits their own; a platform administrator switched into them
 * edits theirs, because the token's `organizationId` is re-pointed — so this one
 * form serves both without a separate admin screen.
 *
 * Logo upload lands in M20 W2 and the accent contrast guard rails in W3; the
 * accent is stored and previewed here so the value exists to validate.
 */
export function BrandingForm() {
  // Full key paths: FormField calls `useTranslations()` with NO namespace and
  // passes `errorKey` straight to `t()`, so a plain-English string there would
  // be looked up as a key and render as the key itself.
  const t = useTranslations('org.branding');
  const { data: branding, isLoading, isError, refetch } = useBranding();
  const update = useUpdateBranding();
  const upload = useUploadLogo();
  const remove = useRemoveLogo();
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useApiToast();

  const [form, setForm] = useState({ displayName: '', accentColor: '', supportEmail: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!branding) return;
    setForm({
      displayName: branding.displayName ?? '',
      accentColor: branding.accentColor ?? '',
      supportEmail: branding.supportEmail ?? '',
    });
  }, [branding]);

  if (isLoading) return <LoadingState />;
  if (isError || !branding) return <ErrorState onRetry={() => refetch()} />;

  // Live, so a customer learns the colour is unusable while typing rather than
  // after a round trip. The SERVER is still the gate — this only explains.
  const accentCheck = HEX.test(form.accentColor) ? checkAccent(form.accentColor) : null;

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset immediately so picking the SAME file again still fires a change.
    e.target.value = '';
    if (!file) return;

    // Checked here as well as on the server: a 2 MB limit is worth enforcing
    // before spending the upload, and the server still re-checks the real bytes.
    if (!LOGO_TYPES.has(file.type)) return setErrors({ logo: 'org.branding.errors.logoType' });
    if (file.size > LOGO_MAX_BYTES) return setErrors({ logo: 'org.branding.errors.logoSize' });

    setErrors({});
    try {
      await upload.mutateAsync(file);
      toast.success(t('saved'));
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : t('errors.save') });
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (form.displayName.length > 60) fe.displayName = 'org.branding.errors.displayName';
    if (form.accentColor && !HEX.test(form.accentColor)) fe.accentColor = 'org.branding.errors.accent';
    else if (accentCheck && !accentCheck.passes) fe.accentColor = 'org.branding.errors.accentContrast';
    if (form.supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.supportEmail)) {
      fe.supportEmail = 'org.branding.errors.support';
    }
    setErrors(fe);
    if (Object.keys(fe).length) return;

    try {
      await update.mutateAsync(form);
      toast.success(t('saved'));
    } catch (err) {
      // Server messages are already human-readable and not translatable here, so
      // they are rendered directly rather than through `t()`.
      setErrors({ form: err instanceof Error ? err.message : t('errors.save') });
    }
  }

  return (
    <Card className="p-4 md:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-medium">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* `noValidate`: the email input would otherwise trigger the browser's own
          constraint validation, which BLOCKS submit and shows a native tooltip
          instead of the styled, translated message beside the field. */}
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField
          id="brand-name"
          label={t('displayName')}
          errorKey={errors.displayName}
          hint={t('displayNameHint')}
        >
          <Input id="brand-name" value={form.displayName} onChange={set('displayName')} maxLength={60} />
        </FormField>

        <FormField id="brand-logo" label={t('logo')} errorKey={errors.logo} hint={t('logoHint')}>
          <div className="flex items-center gap-3">
            {branding.logoUrl ? (
              // A plain <img>: the preview is a few dozen pixels and swaps the
              // moment an upload lands, so next/image's optimiser adds a round
              // trip for nothing here.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt=""
                className="h-12 w-12 rounded border object-contain"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded border bg-muted text-xs text-muted-foreground">
                —
              </div>
            )}

            <input
              id="brand-logo"
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={onPickLogo}
            />
            <Can permission="org:write">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={upload.isPending}
                  onClick={() => fileInput.current?.click()}
                >
                  {upload.isPending ? t('logoUploading') : branding.logoUrl ? t('logoReplace') : t('logoUpload')}
                </Button>
                {branding.logoUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate()}
                  >
                    {t('logoRemove')}
                  </Button>
                ) : null}
              </div>
            </Can>
          </div>
        </FormField>

        <FormField
          id="brand-accent"
          label={t('accent')}
          errorKey={errors.accentColor}
          hint={t('accentHint')}
        >
          <div className="flex items-center gap-2">
            <Input
              id="brand-accent"
              value={form.accentColor}
              onChange={set('accentColor')}
              placeholder="#1f6feb"
              maxLength={7}
              className="font-mono"
            />
            {/* A button-shaped preview rather than a bare swatch: the accent's
                real job is a filled control with text on it, so that is what has
                to look right — and it shows the derived foreground too. */}
            <span
              aria-hidden
              className="inline-flex h-9 shrink-0 items-center rounded-md border px-3 text-sm font-medium"
              style={
                accentCheck
                  ? { backgroundColor: form.accentColor, color: accentCheck.foreground, borderColor: form.accentColor }
                  : undefined
              }
            >
              {t('accentPreview')}
            </span>
          </div>
        </FormField>

        {accentCheck ? (
          <p // `ok-strong`, not `ok`: the plain step is 3.43:1 on white, which fails AA
            // at this size. The token set carries a darker one for exactly this.
            className={accentCheck.passes ? 'text-xs text-status-ok-strong' : 'text-xs text-status-error'}>
            {/* States the ratios, not just a verdict: a designer adjusting a
                brand colour needs to know how far off it is. */}
            {accentCheck.passes
              ? `${t('accentOk')} (${accentCheck.textRatio}:1 text, ${accentCheck.lightRatio}:1 light, ${accentCheck.darkRatio}:1 dark)`
              : accentCheck.reasons.join(' ')}
          </p>
        ) : null}

        <FormField
          id="brand-support"
          label={t('support')}
          errorKey={errors.supportEmail}
          hint={t('supportHint')}
        >
          <Input id="brand-support" type="email" value={form.supportEmail} onChange={set('supportEmail')} />
        </FormField>

        {errors.form ? (
          <p role="alert" className="text-sm text-status-error">
            {errors.form}
          </p>
        ) : null}

        <Can
          permission="org:write"
          fallback={<p className="text-sm text-muted-foreground">{t('readOnly')}</p>}
        >
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? t('saving') : t('save')}
          </Button>
        </Can>
      </form>
    </Card>
  );
}
