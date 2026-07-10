import { applyBrowserLocaleOnFirstVisit } from '$lib/i18n';

export const ssr = false;
export const prerender = true;

// Runs once, at module load, before any component renders — so the very
// first paint already reflects the detected locale instead of flashing
// English then switching.
applyBrowserLocaleOnFirstVisit();
