export function parseLocationGroup(locationStr?: string): { groupName: string; type: 'state' | 'remote' | 'country' | 'other' } {
  if (!locationStr || !locationStr.trim()) {
    return { groupName: 'Other', type: 'other' };
  }

  const trimmed = locationStr.trim();
  const lower = trimmed.toLowerCase();

  // List of standard 2-letter US state codes
  const usStates = new Set([
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
    'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
    'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
    'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
  ]);

  // Match state code like "San Francisco, CA", "Los Gatos, CA / Remote", "CA"
  const stateMatch = trimmed.match(/(?:,\s*|\b)([A-Z]{2})(?:\s*\/|\s*,|\b)/);
  if (stateMatch && usStates.has(stateMatch[1])) {
    return { groupName: stateMatch[1], type: 'state' };
  }

  // Pure Remote check if no US state code detected
  if (lower.includes('remote')) {
    return { groupName: 'Remote', type: 'remote' };
  }

  // Check if City, Country format (e.g. "Shanghai, China", "London, UK", "Tokyo, Japan")
  const parts = trimmed.split(',').map((p) => p.trim());
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1];
    if (!usStates.has(lastPart.toUpperCase())) {
      return { groupName: lastPart, type: 'country' };
    }
  }

  return { groupName: trimmed, type: 'other' };
}

export function parseMinSalary(salaryStr?: string): number | null {
  if (!salaryStr) return null;
  const numbers = salaryStr.match(/(\d[\d,]*)/g);
  if (!numbers || numbers.length === 0) return null;
  const parsed = numbers
    .map((n) => parseInt(n.replace(/,/g, ''), 10))
    .filter((n) => !isNaN(n) && n >= 10000);
  if (parsed.length === 0) return null;
  return Math.min(...parsed);
}
