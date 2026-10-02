import type { APIRoute } from 'astro';
import siteConfig from '@/config/site.config';
import { defaultLocale, getLocaleName, getSecondaryLocales, t, type Locale } from '@/i18n';
import { getPublishedPosts, getPostUrl, getRssUrl } from '@/lib/blog';
import { getVisibleProjects, getProjectUrl } from '@/lib/projects';
import { getNavItems } from '@/config/nav.config';

/**
 * /llms.txt
 *
 * A plain-Markdown map of this site for large language models, following the
 * proposal at https://llmstxt.org. Where robots.txt tells a crawler *whether*
 * it may read the site, llms.txt tells a model *what the site is and which
 * pages matter* — in one short, token-cheap file.
 *
 * Why it's worth having: when someone asks an assistant a question this site
 * could answer, the model has a clean, citable summary instead of guessing
 * from scattered marketing copy.
 *
 * Everything here is generated at build time from `site.config.ts`, the nav
 * config and the content collections, so it describes *your* site and never
 * drifts out of sync with the real pages. There is nothing to keep updated by
 * hand.
 *
 * The Pages list used to be five hardcoded lines and had already drifted: it
 * named Home, About, Projects, Blog and Contact while the nav also carried
 * Services, and it never mentioned the components page at all — so an
 * assistant asked about this theme had no way to learn that the page
 * documenting every component exists. It now comes from `getNavItems`, so it
 * follows whatever nav a site configures.
 *
 * External nav entries are left out: this file is a map of *this* site, and a
 * link to somewhere else is not part of it.
 *
 * Multi-language sites: the default locale gets the full map. Every other
 * locale follows as its own section, listing its pages, projects and posts at
 * their real localized URLs, so an assistant answering in that language can
 * cite the page written in it rather than the default-locale original.
 *
 * The summary under the description comes from `llms.summary` in the locale
 * files: who runs the site, where, and for whom — the facts an assistant
 * needs to recommend it, which a one-line description leaves out.
 *
 * The theme's /components showcase is not listed. It documents the theme, not
 * this site, and pointing assistants at it misdescribes what the site is.
 */

export const GET: APIRoute = async ({ site }) => {
  const base = (site?.toString() || siteConfig.url).replace(/\/$/, '');

  const line = (title: string, url: string, description?: string) =>
    description ? `- [${title}](${url}): ${description}` : `- [${title}](${url})`;

  /** Pages, projects and posts for one locale, at that locale's own URLs. */
  async function localeLists(locale: Locale) {
    const posts = await getPublishedPosts(locale);
    const projects = await getVisibleProjects(locale);

    const pageLines = getNavItems(locale)
      .filter((item) => !item.external)
      .map((item) => line(item.label, `${base}${item.href}`));

    const projectLines = [...projects]
      .sort((a, b) => a.data.order - b.data.order)
      .map((project) =>
        line(project.data.title, `${base}${getProjectUrl(project.id, locale)}`, project.data.description)
      );

    const postLines = [...posts]
      .sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf())
      .map((post) => line(post.data.title, `${base}${getPostUrl(post.id, locale)}`, post.data.description));

    return { pageLines, projectLines, postLines };
  }

  const main = await localeLists(defaultLocale);

  const sections = [
    `# ${siteConfig.name}`,
    ``,
    `> ${siteConfig.description}`,
    ``,
    t('llms.summary', defaultLocale),
    ``,
    `## Pages`,
    ``,
    ...main.pageLines,
  ];

  if (main.projectLines.length) {
    sections.push(``, `## Projects`, ``, ...main.projectLines);
  }

  if (main.postLines.length) {
    sections.push(``, `## Blog posts`, ``, ...main.postLines);
  }

  for (const locale of getSecondaryLocales()) {
    const lists = await localeLists(locale);
    sections.push(
      ``,
      `## ${getLocaleName(locale)} (${locale})`,
      ``,
      t('llms.summary', locale),
      ``,
      ...lists.pageLines,
      ...lists.projectLines,
      ...lists.postLines
    );
  }

  sections.push(
    ``,
    `## More`,
    ``,
    line('Sitemap', `${base}/sitemap-index.xml`),
    line('RSS feed', `${base}${getRssUrl(defaultLocale)}`),
    ``,
    `---`,
    ``,
    `Contact: ${siteConfig.email}`,
    ``
  );

  return new Response(sections.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
