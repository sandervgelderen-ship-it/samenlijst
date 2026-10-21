import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

/** The browser's install event; not in the standard DOM types yet. */
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()); });
}

const KEY = 'samenlijst.installHidden';
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);

/** Install state for the whole app: can we show the browser's install dialog, or the iPhone steps? */
export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  const native = Capacitor.isNativePlatform();
  return {
    installed: native || isStandalone(),
    canPrompt: !!deferred,
    ios: isIos() && !native,
    async install() {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null; listeners.forEach((f) => f());
      return outcome === 'accepted';
    },
  };
}

/** A friendly card on the home screen until IsErNog is installed or the card is closed. */
export default function InstallPrompt() {
  const { installed, canPrompt, ios, install } = useInstall();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  const [steps, setSteps] = useState(false);
  if (installed || hidden || (!canPrompt && !ios)) return null;
  const close = () => { setHidden(true); try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ } };
  return (
    <div className="install">
      <button className="install-x" onClick={close} aria-label="Niet nu"><X size={18} /></button>
      <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" width={48} height={48} />
      <div className="install-txt">
        <strong>Zet IsErNog op je beginscherm</strong>
        {ios && steps
          ? <span>Tik onderin Safari op <Share size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> <b>Deel</b> en kies <b>Zet op beginscherm</b>.</span>
          : <span>Dan opent hij als een app, zonder adresbalk, en werkt hij ook zonder netwerk.</span>}
      </div>
      {canPrompt
        ? <button className="btn" onClick={() => install()}><Download size={16} style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />Installeren</button>
        : ios && !steps && <button className="btn" onClick={() => setSteps(true)}>Hoe?</button>}
    </div>
  );
}
