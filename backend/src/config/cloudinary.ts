/**
 * cloudinary.ts
 *
 * Centralised Cloudinary SDK configuration. Imported once at bootstrap
 * (see main.ts). Media uploads (NEP session files, MET record pictures) are
 * stored on Cloudinary instead of local disk so they survive Render restarts.
 *
 * Configure with EITHER:
 *   - CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>   (the SDK auto-parses this)
 *   - or the three split vars: CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
 */
import { v2 as cloudinary } from 'cloudinary';

let configured = false;

export function configureCloudinary(): void {
  if (configured) return;

  // If CLOUDINARY_URL is set, the SDK reads it automatically; otherwise wire the split vars.
  if (!process.env.CLOUDINARY_URL) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  } else {
    cloudinary.config({ secure: true });
  }
  configured = true;
}

export function isCloudinaryConfigured(): boolean {
  const cfg = cloudinary.config();
  return Boolean(process.env.CLOUDINARY_URL || (cfg.cloud_name && cfg.api_key && cfg.api_secret));
}

export { cloudinary };
