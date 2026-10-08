// Where users write for more interviews, support and ideas
export const SUPPORT_EMAIL = 'hailhelixnewsform@gmail.com';

export function supportMailto(subject: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
