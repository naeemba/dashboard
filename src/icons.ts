// The handful of line icons the manager's cards draw, inline so nothing is fetched and every one takes
// the colour of the text around it. Paths from Lucide (ISC licence), 24×24, stroked in currentColor.

const CLOUD_BASE = '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>';

const PATHS = {
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41'
    + 'M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  cloudSun: '<path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41"/>'
    + '<path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  fog: `${CLOUD_BASE}<path d="M16 17H7M17 21H9"/>`,
  drizzle: `${CLOUD_BASE}<path d="M8 19v1M8 14v1M16 19v1M16 14v1M12 21v1M12 16v1"/>`,
  rain: `${CLOUD_BASE}<path d="M16 14v6M8 14v6M12 16v6"/>`,
  snow: `${CLOUD_BASE}<path d="M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01"/>`,
  storm: '<path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973"/><path d="m13 12-3 5h4l-3 5"/>',
  droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15'
    + 'a7 7 0 0 0 7 7z"/>',
  bitcoin: '<path d="M11.767 19.089c4.924.868 6.14-6.025 1.216-6.894m-1.216 6.894L5.86 18.047m5.908 1.042-.347 1.97'
    + 'm1.563-8.864c4.924.869 6.14-6.025 1.215-6.893m-1.215 6.893-3.94-.694m5.155-6.2L8.29 4.26m5.908 1.042.348-1.97'
    + 'M7.48 20.364l3.126-17.727"/>',
  dollar: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/>'
    + '<path d="m16.71 13.88.7.71-2.82 2.82"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName): HTMLElement {
  const element = document.createElement('span');
  element.className = 'icon';
  // Fixed strings from the table above, never anything read from outside.
  element.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
  return element;
}
