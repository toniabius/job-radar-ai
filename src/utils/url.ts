export function ensureAbsoluteUrl(rawUrl?: string, company?: string, title?: string): string {
  if (rawUrl && rawUrl.trim()) {
    let trimmed = rawUrl.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = `https://${trimmed}`;
    }
    // If it's already a direct LinkedIn view posting URL, return it directly
    if (trimmed.includes('linkedin.com/jobs/view/')) {
      return trimmed;
    }
    return trimmed;
  }

  if (company && title) {
    const keywords = encodeURIComponent(`${company} ${title}`);
    return `https://www.linkedin.com/jobs/search/?keywords=${keywords}&f_TPR=r86400`;
  }

  return 'https://www.linkedin.com/jobs/';
}

