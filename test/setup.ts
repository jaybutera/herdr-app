// Component tests mount into jsdom, which has no matchMedia. Several components
// ask for prefers-reduced-motion at module or mount time; without this they
// throw before rendering anything.
import '@testing-library/svelte/vitest';

// Only the component tests run in jsdom; the rest run in node, where there is
// no window to patch.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
