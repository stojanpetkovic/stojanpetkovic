import { getFooterNavItems, footerLinkGroups, resolveNavItem } from '@/config/nav.config';
import { defaultLocale, t } from '@/i18n';
import type { FooterLinkGroup } from '@/components/layout/Footer.astro';

/**
 * The columns footer's default link groups, derived from what a site has.
 *
 * The alternative was a list someone types into config, which is how the
 * columns layout ended up rendering a logo and empty space: `linkGroups`
 * defaulted to `[]`, so anyone who found the layout and switched to it saw a
 * footer that looked broken. A default nobody configures has to fill itself.
 *
 * Each group is dropped when it has nothing in it, so the footer reports what
 * exists rather than what someone remembered to add. A new site with no posts
 * and no projects gets the site column alone, which renders as a simple
 * footer without anyone choosing a layout — and it fills out as the site
 * grows.
 *
 * Set `footerLinkGroups` in `nav.config.ts` to replace all of this.
 */

export async function getDerivedFooterGroups(
  locale: string = defaultLocale
): Promise<FooterLinkGroup[]> {
  const groups: FooterLinkGroup[] = [];

  // The site's own pages, from the footer nav a site already configures.
  const navLinks = getFooterNavItems(locale).map((item) => ({
    label: item.label,
    href: item.href,
    external: item.external,
  }));
  if (navLinks.length) {
    groups.push({ title: t('footer.groups.site', locale), links: navLinks });
  }

  // Blog topics live on the blog and projects on their own page; the footer
  // keeps to the site's pages, the services and how to get in touch.

  // Columns declared in config are appended to the derived ones, and go
  // through the same resolver as the nav so their labels translate and their
  // internal hrefs get the locale prefix.
  for (const group of footerLinkGroups) {
    const links = group.links.map((item) => {
      const resolved = resolveNavItem(item, locale);
      return { label: resolved.label, href: resolved.href, external: resolved.external };
    });
    if (!links.length) continue;
    groups.push({
      title: group.titleKey ? t(group.titleKey, locale) : group.title,
      links,
    });
  }

  return groups;
}
