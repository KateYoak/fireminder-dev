// Landing Pages Index
// This file exports all available landing pages
// Add new landing pages by creating a new .js file and importing it here

import welcome from './welcome.js';
import productivity from './productivity.js';
import learning from './learning.js';

// Registry of all landing pages
// Key must match the URL slug: #/landing/{key}
export const LANDING_PAGES = {
  welcome,
  productivity,
  learning
};

// Get a landing page by slug
export function getLandingPage(slug) {
  return LANDING_PAGES[slug] || null;
}

// Get list of all available landing page slugs
export function getLandingPageSlugs() {
  return Object.keys(LANDING_PAGES);
}

export default LANDING_PAGES;
