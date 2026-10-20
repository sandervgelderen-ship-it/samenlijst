import { S, setS } from '../store/useStore';

let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;

/** Show a short message; with an action (like "Ongedaan maken") it stays a little longer. */
export function toast(msg: string, actionLabel?: string, action?: () => void, ms?: number) {
  clearTimeout(timer);
  const id = ++seq;
  setS({ toast: { id, msg, actionLabel, action } });
  timer = setTimeout(() => { if (S().toast?.id === id) setS({ toast: null }); }, ms ?? (actionLabel ? 7000 : 3200));
}
export function closeToast() { clearTimeout(timer); setS({ toast: null }); }
