/**
 * Navigation Configuration
 *
 * Defines navigation menus for the site. Astro handles routing via the
 * filesystem — this only controls which links appear in nav menus.
 *
 * - `navItems`       → main (header) navigation
 * - `footerNavItems` → footer navigation, configured independently from
 *                      the header so you can show different links in the
 *                      footer (e.g. add a Privacy link, drop About, etc.)
 * - `legalLinks`     → small legal-style links (Privacy, Terms, Imprint…)
 *                      shown in the footer's bottom row when supported
 *                      by the active footer layout.
 *
 * ## i18n
 *
 * You write each link once. When i18n is enabled, the Header and Footer
 * localize it automatically for the active locale:
 *
 * - **href** is locale-prefixed via `localizedPath` — `/blog` stays `/blog`
 *   on the default locale and becomes `/<locale>/blog` elsewhere — so nav
 *   keeps the visitor inside their locale. External, `mailto:`/`tel:`, and
 *   `#anchor` hrefs are left untouched.
 * - **label** is translated when you give the item a `labelKey` pointing at
 *   a string in `src/i18n/<locale>.json` (resolved with `t()`); without one,
 *   the literal `label` is used as-is.
 *
 * For the rare case where a locale needs a structurally different label or
 * path (e.g. a localized slug like `/over-ons`), add a `locales` override —
 * see `NavItemOverride`. With i18n off, none of this runs and the output is
 * identical to a single-locale site.
 */
import { localizedPath, t, defaultLocale, type Locale } from '@/i18n';

/** Per-locale override for a nav item or legal link's label and/or path. */
export interface NavItemOverride {
  /** Replaces the resolved label for this locale. */
  label?: string;
  /** Replaces the canonical path for this locale (still locale-prefixed). */
  href?: string;
}

/**
 * A link inside a mega menu: label and optional one-line description from the
 * locale files, and an icon.
 */
export interface MegaLinkConfig {
  label: string;
  labelKey: string;
  href: string;
  icon: string;
  descriptionKey?: string;
}

/** A column of a mega menu. */
export interface MegaGroupConfig {
  title: string;
  titleKey: string;
  links: MegaLinkConfig[];
}

/**
 * The panel a nav item opens. `activePrefixes` are the sections the panel
 * covers, so the item shows as current on any page inside them.
 */
export interface MegaMenuConfig {
  groups: MegaGroupConfig[];
  /** Link at the foot of the panel, to the item's own page. */
  overview: MegaLinkConfig;
  activePrefixes: string[];
}

export interface NavItem {
  label: string;
  href: string;
  order: number;
  /** Opens a mega menu instead of being a plain link; `href` is the overview page. */
  mega?: MegaMenuConfig;
  external?: boolean;
  /** i18n dictionary key for the label (e.g. `'nav.items.blog'`). Falls back to `label`. */
  labelKey?: string;
  /** Per-locale label/path overrides, keyed by locale code. */
  locales?: Record<string, NavItemOverride>;
}

/**
 * A footer column declared in config. `titleKey` is looked up in the locale
 * files when present, so a translated site gets a translated heading;
 * `title` is the fallback for a column that has no key.
 */
export interface FooterLinkGroupConfig {
  titleKey?: string;
  title: string;
  /**
   * `LegalLink` rather than `NavItem`: the two carry the same fields except
   * `order`, which a group has no use for — the array is the order.
   */
  links: LegalLink[];
}

export interface LegalLink {
  label: string;
  href: string;
  external?: boolean;
  /** i18n dictionary key for the label. Falls back to `label`. */
  labelKey?: string;
  /** Per-locale label/path overrides, keyed by locale code. */
  locales?: Record<string, NavItemOverride>;
}

export interface ResolvedMegaLink {
  label: string;
  href: string;
  icon: string;
  description?: string;
}

export interface ResolvedMegaMenu {
  groups: { title: string; links: ResolvedMegaLink[] }[];
  overview: ResolvedMegaLink;
  /** Locale-prefixed sections the menu covers. */
  activePrefixes: string[];
}

/** A nav item resolved for one locale: label translated, href locale-prefixed. */
export interface ResolvedNavItem {
  label: string;
  href: string;
  external?: boolean;
  mega?: ResolvedMegaMenu;
}

/**
 * The Services mega menu. The site offers three kinds of work and each has its
 * own pages; grouping them here keeps the top bar short and shows a visitor
 * everything under Services without opening each page.
 */
const servicesMega: MegaMenuConfig = {
  activePrefixes: ['/services', '/tools', '/web', '/courses'],
  overview: { label: 'All services', labelKey: 'nav.mega.overview', href: '/services', icon: 'arrow-right' },
  groups: [
    {
      title: 'Engineering',
      titleKey: 'nav.mega.groups.engineering',
      links: [
        { label: 'Consulting & projects', labelKey: 'nav.mega.links.consulting', descriptionKey: 'nav.mega.descriptions.consulting', href: '/services#consulting', icon: 'award' },
        { label: 'Courses', labelKey: 'nav.items.courses', descriptionKey: 'nav.mega.descriptions.courses', href: '/courses', icon: 'book-open' },
        { label: 'Projects', labelKey: 'nav.items.projects', descriptionKey: 'nav.mega.descriptions.projects', href: '/projects', icon: 'layers' },
      ],
    },
    {
      title: 'Engineering tools',
      titleKey: 'nav.mega.groups.tools',
      links: [
        { label: 'CT Simulator', labelKey: 'pages.ctSimulator.hero.title', href: '/tools/ct-simulator', icon: 'layout-dashboard' },
        { label: 'CT Pressure Loss', labelKey: 'pages.ctPressureLoss.hero.title', href: '/tools/ct-pressure-loss', icon: 'activity' },
        { label: 'CT Strength Limits', labelKey: 'pages.ctStrength.hero.title', href: '/tools/ct-strength-limits', icon: 'shield-check' },
        { label: 'Nitrogen Displacement', labelKey: 'pages.nitrogenDisplacement.hero.title', href: '/tools/nitrogen-displacement', icon: 'wind' },
        { label: 'Well Kill', labelKey: 'pages.wellKill.hero.title', href: '/tools/well-kill', icon: 'shield-check' },
        { label: 'BHA Builder', labelKey: 'pages.bhaBuilder.hero.title', href: '/tools/bha-builder', icon: 'wrench' },
        { label: 'All tools', labelKey: 'nav.mega.links.allTools', href: '/tools', icon: 'arrow-right' },
      ],
    },
    {
      title: 'Software & web',
      titleKey: 'nav.mega.groups.web',
      links: [
        { label: 'Engineering software', labelKey: 'nav.mega.links.software', descriptionKey: 'nav.mega.descriptions.software', href: '/services#software', icon: 'code' },
        { label: 'Web development', labelKey: 'nav.mega.links.web', descriptionKey: 'nav.mega.descriptions.web', href: '/web', icon: 'layout' },
      ],
    },
  ],
};

export const navItems: NavItem[] = [
  { label: 'Home', href: '/', order: 0, labelKey: 'nav.items.home' },
  { label: 'Services', href: '/services', order: 1, labelKey: 'nav.items.services', mega: servicesMega },
  { label: 'Projects', href: '/projects', order: 2, labelKey: 'nav.items.projects' },
  { label: 'Blog', href: '/blog', order: 3, labelKey: 'nav.items.blog' },
  { label: 'About', href: '/about', order: 4, labelKey: 'nav.items.about' },
  { label: 'Contact', href: '/contact', order: 5, labelKey: 'nav.items.contact' },
];

export const footerNavItems: NavItem[] = [
  { label: 'Home', href: '/', order: 0, labelKey: 'nav.items.home' },
  { label: 'Services', href: '/services', order: 1, labelKey: 'nav.items.services' },
  { label: 'Courses', href: '/courses', order: 2, labelKey: 'nav.items.courses' },
  { label: 'Tools', href: '/tools', order: 3, labelKey: 'nav.items.tools' },
  { label: 'Web', href: '/web', order: 4, labelKey: 'nav.items.web' },
  { label: 'Projects', href: '/projects', order: 5, labelKey: 'nav.items.projects' },
  { label: 'Blog', href: '/blog', order: 6, labelKey: 'nav.items.blog' },
  { label: 'About', href: '/about', order: 7, labelKey: 'nav.items.about' },
  { label: 'Contact', href: '/contact', order: 8, labelKey: 'nav.items.contact' },
];

export const legalLinks: LegalLink[] = [
  { label: 'Terms of use', href: '/terms', labelKey: 'nav.items.terms' },
];

/**
 * Extra columns for the footer's `columns` layout.
 *
 * Leave this empty and the footer builds its own from the site: a Site column
 * from `footerNavItems`, a Topics column from the most-used blog tags, and a
 * Projects column from the visible projects. Each is dropped when it has
 * nothing in it, so a new site shows one column and fills out as it grows.
 *
 * Anything here is *added* to those, which is what this is for: a column the
 * site has that cannot be derived — a support column, an offices column, a
 * second product. To replace the derived set entirely rather than add to it,
 * pass `linkGroups` to `<Footer>` directly.
 *
 * Every link is real on the demo. A footer that pads itself out with links to
 * somewhere else is worse than a short one, and worse still on a theme people
 * fork: they inherit whatever is here.
 */
export const footerLinkGroups: FooterLinkGroupConfig[] = [
  {
    titleKey: 'footer.groups.engineering',
    title: 'Engineering',
    links: [
      { label: 'Projects, courses and software', href: '/#focus', labelKey: 'footer.links.focus' },
      { label: 'Courses', href: '/courses', labelKey: 'nav.items.courses' },
      { label: 'About', href: '/about', labelKey: 'nav.items.about' },
      { label: 'Contact', href: '/contact', labelKey: 'nav.items.contact' },
    ],
  },
  {
    titleKey: 'footer.groups.questions',
    title: 'Got questions?',
    links: [
      { label: 'FAQ', href: '/about#faq' },
      { label: 'Email', href: 'mailto:petkovicstojan@gmail.com' },
    ],
  },
];

/**
 * Hrefs that must never be locale-prefixed: absolute/protocol-relative URLs,
 * `mailto:`/`tel:` links, and in-page `#anchor`s.
 */
function isExternalOrAnchorHref(href: string): boolean {
  return (
    /^(https?:)?\/\//.test(href) ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:') ||
    href.startsWith('#')
  );
}

/**
 * Resolve a single item for a locale: apply any per-locale override, translate
 * the label (when a `labelKey` is set), and locale-prefix the path (unless it's
 * external or an anchor). On the default locale with i18n off, this returns the
 * item's literal label and unmodified href. Exported for reuse in custom nav
 * components (and unit tests).
 */
export function resolveNavItem(item: NavItem | LegalLink, locale: Locale): ResolvedNavItem {
  const override = item.locales?.[locale];
  const label = override?.label ?? (item.labelKey ? t(item.labelKey, locale) : item.label);
  const rawHref = override?.href ?? item.href;
  const href =
    item.external || isExternalOrAnchorHref(rawHref) ? rawHref : localizedPath(rawHref, locale);
  const resolved: ResolvedNavItem = { label, href, external: item.external };
  if ('mega' in item && item.mega) resolved.mega = resolveMega(item.mega, locale);
  return resolved;
}

function resolveMegaLink(link: MegaLinkConfig, locale: Locale): ResolvedMegaLink {
  return {
    label: t(link.labelKey, locale),
    href: localizedPath(link.href, locale),
    icon: link.icon,
    description: link.descriptionKey ? t(link.descriptionKey, locale) : undefined,
  };
}

/** A mega menu resolved for one locale. */
function resolveMega(menu: MegaMenuConfig, locale: Locale): ResolvedMegaMenu {
  return {
    groups: menu.groups.map((group) => ({
      title: t(group.titleKey, locale),
      links: group.links.map((link) => resolveMegaLink(link, locale)),
    })),
    overview: resolveMegaLink(menu.overview, locale),
    activePrefixes: menu.activePrefixes.map((prefix) => localizedPath(prefix, locale)),
  };
}

/**
 * Get header navigation items sorted by order, localized for `locale`.
 */
export function getNavItems(locale: Locale = defaultLocale): ResolvedNavItem[] {
  return [...navItems]
    .sort((a, b) => a.order - b.order)
    .map((item) => resolveNavItem(item, locale));
}

/**
 * Get footer navigation items sorted by order, localized for `locale`.
 * Configured independently from the header — edit `footerNavItems`
 * above to add/remove links in the footer only.
 */
export function getFooterNavItems(locale: Locale = defaultLocale): ResolvedNavItem[] {
  return [...footerNavItems]
    .sort((a, b) => a.order - b.order)
    .map((item) => resolveNavItem(item, locale));
}

/**
 * Get configured legal links (Privacy, Terms, etc.), localized for `locale`.
 * Returned in declaration order.
 */
export function getLegalLinks(locale: Locale = defaultLocale): ResolvedNavItem[] {
  return legalLinks.map((item) => resolveNavItem(item, locale));
}

/**
 * The site logo's link target for `locale` — the locale's home page
 * (`/` on the default locale, `/<locale>` elsewhere).
 */
export function getLogoHref(locale: Locale = defaultLocale): string {
  return localizedPath('/', locale);
}
