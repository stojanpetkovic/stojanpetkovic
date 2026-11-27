/**
 * Brands Stojan has built sites or run marketing for, shown in the logo strip
 * on the home page.
 *
 * Every entry is a real client. `logo` points at the brand's own logo file in
 * `src/assets/clients/`; without one, the strip draws a clean wordmark of the
 * name in the site's type, so a client never shows up as an empty box.
 */
import type { ImageMetadata } from 'astro';

export interface Client {
  name: string;
  /** Short line under the wordmark (trade or place). */
  tagline?: string;
  url: string;
  /** Lucide icon drawn beside the wordmark when there is no logo file. */
  icon: string;
  /** Key under `pages.home.clients.sectors` in the locale files. */
  sector: 'tree' | 'rental' | 'dental' | 'transport' | 'care' | 'supplements';
  country: 'us' | 'rs';
  /** Key under `pages.home.clients.highlights`: a real, published result. */
  highlight?: 'treejaws' | 'mahalo';
  logo?: ImageMetadata;
}

// Real logo files, matched to clients by domain: src/assets/clients/<domain>.<ext>
const files = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/clients/*.{svg,png,webp,jpg,jpeg}',
  { eager: true }
);
const logoFor = (domain: string): ImageMetadata | undefined => {
  const hit = Object.entries(files).find(([path]) => path.split('/').pop()!.replace(/\.[a-z]+$/, '') === domain);
  return hit?.[1].default;
};

const list: Omit<Client, 'logo'>[] = [
  { name: 'Tree Jaws', tagline: 'Tree Service · Florida', url: 'https://treejaws.com', icon: 'trees', sector: 'tree', country: 'us', highlight: 'treejaws' },
  { name: 'Mahalo', tagline: 'Tree Service', url: 'https://mahalotreeservice.com', icon: 'tree-palm', sector: 'tree', country: 'us', highlight: 'mahalo' },
  { name: 'SF Tree Removal', tagline: 'Smart Tree Solutions', url: 'https://sftreeremoval.com', icon: 'axe', sector: 'tree', country: 'us' },
  { name: 'Valena', tagline: 'Apartmani · Divčibare', url: 'https://valenaapartmani.com', icon: 'mountain', sector: 'rental', country: 'rs' },
  { name: 'Erić Dental', tagline: 'Centar · Pančevo', url: 'https://zubarpancevo.com', icon: 'smile', sector: 'dental', country: 'rs' },
  { name: 'CARETRANS', tagline: 'Sanitetski prevoz', url: 'https://prevozpacijenatacaretrans.rs', icon: 'ambulance', sector: 'transport', country: 'rs' },
  { name: 'Family Garden', tagline: 'Dom za stara lica · Pančevo', url: 'https://family-garden.rs', icon: 'heart-handshake', sector: 'care', country: 'rs' },
  { name: 'Fight Hydration', tagline: 'Creatine + Electrolytes', url: 'https://fighthydration.co', icon: 'zap', sector: 'supplements', country: 'us' },
];

export const clients: Client[] = list.map((c) => ({
  ...c,
  logo: logoFor(new URL(c.url).hostname.replace(/^www\./, '')),
}));
