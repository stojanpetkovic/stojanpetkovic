import type {
  WebPage,
  Service,
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

/** Stable `@id`s so every page's JSON-LD points at the same entities. */
const ID = {
  website: () => `${siteConfig.url}/#website`,
  person: () => `${siteConfig.url}/#person`,
  business: () => `${siteConfig.url}/#business`,
};

/** BCP 47 content language for schema.org `inLanguage`. */
const LANG: Record<string, string> = { sr: 'sr-Latn-RS', en: 'en', de: 'de' };
const inLanguage = (locale: Locale) => LANG[locale] ?? locale;

/** Where the work is offered: Serbia, the German-speaking countries and the US. */
const AREA_SERVED = ['Serbia', 'Germany', 'Austria', 'Switzerland', 'United States'].map((name) => ({
  '@type': 'Country' as const,
  name,
}));

const SERVICES: Record<string, string[]> = {
  en: ['Google Ads management', 'Facebook and Instagram advertising', 'Local SEO', 'AI search visibility (GEO)', 'Website design and development', 'Call and lead tracking'],
  sr: ['Vođenje Google oglasa', 'Oglasi na Facebook-u i Instagramu', 'Lokalni SEO', 'Vidljivost u AI pretrazi (GEO)', 'Izrada sajtova', 'Praćenje poziva i upita'],
  de: ['Google-Ads-Betreuung', 'Facebook- und Instagram-Werbung', 'Lokales SEO', 'Sichtbarkeit in der KI-Suche (GEO)', 'Webdesign und Website-Erstellung', 'Anruf- und Anfragen-Tracking'],
};

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
    '@id': ID.website(),
    ...brandName(locale),
    url: siteConfig.url,
    description: siteConfig.description,
    inLanguage: ['en', 'sr-Latn-RS', 'de'],
    publisher: { '@id': ID.business() },
  };
}

/**
 * Create Person schema for the site owner
 */
export function createPersonSchema(locale: Locale = defaultLocale): WithContext<Person> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': ID.person(),
    ...brandName(locale),
    givenName: 'Stojan',
    familyName: 'Petković',
    jobTitle: 'Digital marketing and web developer',
    worksFor: { '@id': ID.business() },
    knowsLanguage: ['sr', 'en', 'de'],
    ...(siteConfig.phone ? { telephone: siteConfig.phone } : {}),
    description: siteConfig.description,
    alumniOf: { '@type': 'CollegeOrUniversity', name: 'University of Belgrade' },
    hasCredential: [
      {
        '@type': 'EducationalOccupationalCredential',
        name: 'Ingenieur',
        credentialCategory: 'Professional title',
        recognizedBy: { '@type': 'Organization', name: 'Bayerische Ingenieurekammer-Bau' },
      },
    ],
    knowsAbout: [
      'Google Ads',
      'Meta advertising',
      'Local SEO',
      'Generative engine optimization',
      'Web development',
      'Conversion tracking',
    ],
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
    '@id': ID.business(),
    ...brandName(locale),
    url: siteConfig.url,
    founder: { '@id': ID.person() },
    ...(siteConfig.branding.logo.imageUrl ? { logo: `${siteConfig.url}${siteConfig.branding.logo.imageUrl}` } : {}),
    priceRange: '€€',
    knowsLanguage: ['sr', 'en', 'de'],
    geo: { '@type': 'GeoCoordinates', latitude: 45.3816, longitude: 20.3686 },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      email: siteConfig.email,
      ...(siteConfig.phone ? { telephone: siteConfig.phone } : {}),
      availableLanguage: ['Serbian', 'English', 'German'],
      areaServed: ['RS', 'DE', 'AT', 'CH', 'US'],
    },
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
    description: siteConfig.description,
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: locale === 'sr' ? 'Usluge' : locale === 'de' ? 'Leistungen' : 'Services',
      itemListElement: (SERVICES[locale] ?? SERVICES.en).map((name) => ({
        '@type': 'Offer' as const,
        itemOffered: { '@type': 'Service' as const, name },
      })),
    },
    areaServed: AREA_SERVED,
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
    '@id': ID.business(),
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

/**
 * The page itself: its type (AboutPage, ContactPage, CollectionPage…), its
 * language, the site it belongs to and, for pages one level deep, the
 * breadcrumb back to the home page.
 */
export function createWebPageSchema(page: {
  type?: 'WebPage' | 'AboutPage' | 'ContactPage' | 'CollectionPage' | 'ProfilePage' | 'FAQPage';
  name: string;
  description?: string;
  url: string;
  locale: Locale;
  image?: string;
  breadcrumb?: Array<{ name: string; url: string }>;
}): WithContext<WebPage> {
  return {
    '@context': 'https://schema.org',
    '@type': (page.type ?? 'WebPage') as 'WebPage',
    '@id': `${page.url}#webpage`,
    url: page.url,
    name: page.name,
    ...(page.description ? { description: page.description } : {}),
    inLanguage: inLanguage(page.locale),
    isPartOf: { '@id': ID.website() },
    about: { '@id': ID.business() },
    ...(page.type === 'AboutPage' || page.type === 'ProfilePage' ? { mainEntity: { '@id': ID.person() } } : {}),
    ...(page.image ? { primaryImageOfPage: { '@type': 'ImageObject', url: page.image } } : {}),
    ...(page.breadcrumb && page.breadcrumb.length > 1
      ? {
          breadcrumb: {
            '@type': 'BreadcrumbList',
            itemListElement: page.breadcrumb.map((item, index) => ({
              '@type': 'ListItem' as const,
              position: index + 1,
              name: item.name,
              item: item.url,
            })),
          },
        }
      : {}),
  } as WithContext<WebPage>;
}

/** One service the business offers, linked to it as provider. */
export function createServiceSchema(service: {
  name: string;
  description: string;
  url: string;
  locale: Locale;
  serviceType?: string;
}): WithContext<Service> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.description,
    url: service.url,
    ...(service.serviceType ? { serviceType: service.serviceType } : {}),
    inLanguage: inLanguage(service.locale),
    provider: { '@id': ID.business() },
    areaServed: AREA_SERVED,
  } as WithContext<Service>;
}
