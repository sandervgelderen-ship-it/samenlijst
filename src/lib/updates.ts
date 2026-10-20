/**
 * New versions while the app is open. Every deploy gives the built files new names; an app that stayed open
 * still points to the old ones, and loading a piece of it later then fails ("Failed to fetch dynamically
 * imported module"). So: when the app comes back to the foreground, check whether a newer version is online
 * and offer to refresh, and offer the same when loading a piece fails anyway. Never refresh by itself: that
 * could throw away what someone is typing.
 */
import { toast } from '../data/toast';

const current = () => document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src') || '';
let offered = false;

function offer() {
  if (offered) return;
  offered = true;
  toast('Er is een nieuwe versie van Samenlijst', 'Vernieuwen', () => location.reload(), 600_000);
}

export async function checkForUpdate() {
  const mine = current();
  if (!mine || offered || !navigator.onLine) return;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}index.html?check=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const online = (await res.text()).match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
    if (online && online !== mine) offer();
  } catch { /* offline or blocked: try again later */ }
}

export function watchForUpdates() {
  if (!import.meta.env.PROD) return;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void checkForUpdate(); });
  setInterval(() => void checkForUpdate(), 30 * 60_000);
  // A piece of the app could not be loaded: it was replaced by a newer version.
  addEventListener('vite:preloadError', () => offer());
}
