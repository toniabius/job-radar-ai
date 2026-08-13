/**
 * Utility functions for local date formatting and comparison without UTC skew.
 */

/**
 * Converts a date input (ISO string, Date object, or timestamp) to local YYYY-MM-DD string.
 */
export function getLocalDateString(dateInput?: string | Date | number): string {
  if (!dateInput) return '';

  // If already a YYYY-MM-DD string without time part
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return dateInput;
  }

  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput)) {
      return dateInput.substring(0, 10);
    }
    return '';
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Gets the effective local application date for a job in YYYY-MM-DD format.
 */
export function getJobAppliedLocalDate(job: { applied?: boolean; applied_date?: string; first_seen?: string }): string {
  if (!job.applied) return '';

  if (job.applied_date) {
    const local = getLocalDateString(job.applied_date);
    if (local) return local;
  }

  if (job.first_seen) {
    const local = getLocalDateString(job.first_seen);
    if (local) return local;
  }

  return getLocalDateString(new Date());
}

/**
 * Formats a date for display (e.g., "Aug 12, 2026") in local time.
 */
export function formatDisplayDate(dateInput?: string | Date): string {
  if (!dateInput) return '';

  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const parts = dateInput.split('-').map(Number);
    const localD = new Date(parts[0], parts[1] - 1, parts[2]);
    return localD.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
