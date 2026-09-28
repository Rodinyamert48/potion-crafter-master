// Installs the procedurally painted UI art as CSS custom properties.

import { cursorCSS, frameURL, iconURL } from './pixelArt';

export function installTheme(): void {
  const root = document.documentElement.style;
  for (const f of ['wood', 'parchment', 'dark', 'note', 'gold'] as const) root.setProperty(`--frame-${f}`, `url(${frameURL(f)})`);
  for (const i of ['coin', 'star', 'starEmpty', 'sun', 'moon', 'book', 'bag', 'scroll', 'gear', 'flask', 'heart', 'hourglass', 'bell'])
    root.setProperty(`--icon-${i}`, `url(${iconURL(i, 2)})`);
  root.setProperty('--cursor-default', cursorCSS('default'));
  root.setProperty('--cursor-point', cursorCSS('point'));
}
