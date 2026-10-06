import type {
  WebSite,
  Organization,
  Person,
  LocalBusiness,
  BlogPosting,
  BreadcrumbList,
  FAQPage,
  WithContext,
} from 'schema-dts';
import siteConfig from '@/config/site.config';
import { defaultLocale, type Locale } from '@/i18n';
import { getSiteName, getSiteNameAlternates } from '@/lib/site-name';

/**
 * The brand as `name`, in the page's language, with the other locales'
 * spellings as `alternateName` so the spellings resolve to one entity.
 */
function brandName(locale: Locale): { name: string; alternateName?: string[] } {
  const alternates = getSiteNameAlternates(locale);
  return {
    name: getSiteName(locale),
    ...(alternates.length ? { alternateName: alternates } : {}),
  };
}

/**
 * Create WebSite schema for homepage
 */
export function createWebsiteSchema(locale: Locale = defaultLocale): WithContext<WebSite> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    ...brandName(locale),
    url: siteConfig.url,
    description: siteConfig.description,
  };
}

/**
 * Create Person schema for the site owner
 */
export function createPersonSchema(locale: Locale = defaultLocale): WithContext<Person> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    ...brandName(locale),
    jobTitle: 'Web Designer & Developer',
    url: siteConfig.url,
    email: siteConfig.email,
    ...(siteConfig.authorImage ? { image: `${siteConfig.url}${siteConfig.authorImage}` } : {}),
    ...(siteConfig.address?.city
      ? {
          address: {
            '@type': 'PostalAddress',
            addressLocality: siteConfig.address.city,
            ...(siteConfig.address.state ? { addressRegion: siteConfig.address.state } : {}),
            ...(siteConfig.address.country ? { addressCountry: siteConfig.address.country } : {}),
          },
        }
      : {}),
    sameAs: siteConfig.socialLinks,
  };
}

/**
 * Create ProfessionalService schema for local SEO
 */
export function createProfessionalServiceSchema(locale: Locale = defaultLocale): WithContext<LocalBusiness> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService' as 'LocalBusiness',
    ...brandName(locale),
    url: siteConfig.url,
    email: siteConfig.email,
    ...(siteConfig.phone ? { telephone: siteConfig.phone } : {}),
    ...(siteConfig.authorImage ? { image: `${siteConfig.url}${siteConfig.authorImage}` } : {}),
    ...(siteConfig.address?.city
      ? {
          address: {
            '@type': 'PostalAddress',
            addressLocality: siteConfig.address.city,
            ...(siteConfig.address.state ? { addressRegion: siteConfig.address.state } : {}),
            ...(siteConfig.address.country ? { addressCountry: siteConfig.address.country } : {}),
          },
        }
      : {}),
    areaServed: [{ '@type': 'Country', name: 'Worldwide' }],
    sameAs: siteConfig.socialLinks,
  };
}

/**
 * Create Organization schema
 */
export function createOrganizationSchema(locale: Locale = defaultLocale): WithContext<Organization> {
  const logoUrl = siteConfig.branding.logo.imageUrl
    ? `${siteConfig.url}${siteConfig.branding.logo.imageUrl}`
    : undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    ...brandName(locale),
    url: siteConfig.url,
    ...(logoUrl ? { logo: logoUrl } : {}),
    sameAs: siteConfig.socialLinks,
    contactPoint: siteConfig.phone
      ? {
          '@type': 'ContactPoint',
          telephone: siteConfig.phone,
          contactType: 'customer service',
        }
      : undefined,
  };
}

/**
 * Create BlogPosting schema for blog posts
 */
export function createBlogPostSchema(post: {
  title: string;
  description: string;
  url: string;
  image: string;
  datePublished: Date;
  dateModified?: Date;
  author: { name: string; url?: string };
  /** The post's locale, for the publisher's name. */
  locale?: Locale;
}): WithContext<BlogPosting> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    url: post.url,
    image: post.image,
    datePublished: post.datePublished.toISOString(),
    dateModified: post.dateModified?.toISOString() || post.datePublished.toISOString(),
    author: {
      '@type': 'Person',
      name: post.author.name,
      url: post.author.url,
    },
    publisher: {
      '@type': 'Organization',
      name: getSiteName(post.locale ?? defaultLocale),
      ...(siteConfig.branding.logo.imageUrl
        ? {
            logo: {
              '@type': 'ImageObject',
              url: `${siteConfig.url}${siteConfig.branding.logo.imageUrl}`,
            },
          }
        : {}),
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': post.url,
    },
  };
}

/**
 * Create BreadcrumbList schema
 */
export function createBreadcrumbSchema(
  items: Array<{ name: string; url: string }>
): WithContext<BreadcrumbList> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Create FAQPage schema
 */
export function createFAQSchema(
  faqs: Array<{ question: string; answer: string }>
): WithContext<FAQPage> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}
