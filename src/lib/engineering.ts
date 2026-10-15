/**
 * Blog tags that mark a post as engineering content.
 *
 * The home page shows only these posts, and the footer's Topics column lists
 * only these tags, so the engineering side of the site stays separate from the
 * web and marketing posts. Compared lower-cased.
 */
export const ENGINEERING_TAGS = ['engineering', 'coiled-tubing', 'nitrogen', 'oil-and-gas', 'drilling'];

export const isEngineeringTag = (tag: string): boolean => ENGINEERING_TAGS.includes(tag.toLowerCase());
