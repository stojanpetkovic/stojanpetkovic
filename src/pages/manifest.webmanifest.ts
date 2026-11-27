import type { APIRoute } from 'astro';
import siteConfig from '@/config/site.config';

/**
 * The web app manifest: what a phone needs to install the site as an app.
 *
 * `id` and `scope` keep the installed app tied to the whole site, `start_url`
 * carries a tag so a visit from the home-screen icon can be told apart, the
 * maskable icon fills Android's round and squircle masks without a white rim,
 * and the screenshots let Chrome show its richer install dialog. Shortcuts
 * appear on a long press of the app icon.
 */
export const GET: APIRoute = () => {
  const { name, description, branding } = siteConfig;

  const manifest = {
    id: '/',
    name,
    short_name: 'Stojan',
    description,
    lang: 'en',
    dir: 'ltr',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait',
    background_color: branding.colors.backgroundColor,
    theme_color: branding.colors.themeColor,
    categories: ['business', 'productivity'],
    icons: [
      { src: branding.favicon.svg, sizes: 'any', type: 'image/svg+xml' },
      { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Free website audit', short_name: 'Free audit', url: '/contact?source=pwa-shortcut', icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }] },
      { name: 'Projects', url: '/projects?source=pwa-shortcut', icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }] },
      { name: 'Services', url: '/services?source=pwa-shortcut', icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }] },
    ],
    screenshots: [
      { src: '/pwa/screen-home.png', sizes: '824x1784', type: 'image/png', form_factor: 'narrow', label: 'Home' },
      { src: '/pwa/screen-projects.png', sizes: '824x1784', type: 'image/png', form_factor: 'narrow', label: 'Projects' },
      { src: '/pwa/screen-wide.png', sizes: '1440x900', type: 'image/png', form_factor: 'wide', label: 'Home on desktop' },
    ],
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'Content-Type': 'application/manifest+json',
    },
  });
};
