import 'server-only';
import { brandFromEnv, readableOn, type Brand } from '@zopf/shared';

/** Branding of this installation, read from the environment on every request (no rebuild for a new club). */
export function getBrand(): Brand {
  return brandFromEnv(process.env);
}

/** CSS custom properties for the root element; Tailwind's brand colours point at them (globals.css). */
export function brandStyle(brand: Brand): Record<string, string> {
  return {
    '--brand-primary': brand.primary,
    '--brand-secondary': brand.secondary,
    '--brand-on-primary': readableOn(brand.primary),
    '--brand-on-secondary': readableOn(brand.secondary),
  };
}

/** Folder with an own logo.svg / logo.png / favicon.ico (mounted volume). */
export function brandingDir(): string {
  return process.env.BRANDING_DIR?.trim() || '/branding';
}
