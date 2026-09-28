// Entry point: loads fonts & styles, boots the engines, shows the title.

import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import '@fontsource/pixelify-sans/700.css';
import './ui/styles.css';
import { Game } from './core/Game';
import { App } from './App';
import { installTheme } from './ui/theme';
import { t, getLang } from './core/i18n';

async function boot(): Promise<void> {
  document.documentElement.lang = getLang();
  installTheme();
  const status = document.getElementById('boot-status');
  const setStatus = (key: string) => {
    if (status) status.textContent = t(key);
  };
  setStatus('boot.loading');
  const viewport = document.getElementById('viewport')!;
  const uiRoot = document.getElementById('ui-root')!;
  const game = await Game.create(viewport, uiRoot, setStatus);
  const app = new App(game);
  game.start();
  (window as unknown as { __wb: { game: Game; app: App } }).__wb = { game, app };
  const bootEl = document.getElementById('boot-screen');
  bootEl?.classList.add('hidden');
  setTimeout(() => bootEl?.remove(), 800);
}

boot().catch((err) => {
  console.error(err);
  const status = document.getElementById('boot-status');
  if (status) status.textContent = `${t('boot.error')} (${(err as Error)?.message ?? err})`;
});
