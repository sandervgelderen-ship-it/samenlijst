/** Small shared pieces: logo, avatars, doodles and names. */
import type { ReactNode } from 'react';
import { useStore } from '../store/useStore';
import type { Household } from '../types';

export function Logo({ className = 'logo' }: { className?: string }) {
  return (
    <span className={className} aria-hidden="true">
      <svg viewBox="0 0 40 40">
        <rect x="4" y="7" width="24" height="24" rx="8" transform="rotate(-8 16 19)" style={{ fill: 'var(--c-zon-fg)' }} />
        <rect x="12" y="10" width="24" height="24" rx="8" transform="rotate(6 24 22)" style={{ fill: 'var(--accent)' }} />
        <path d="M18 22.5l4 4 8-9" style={{ fill: 'none', stroke: 'var(--surface)', strokeWidth: 3.4, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
      </svg>
    </span>
  );
}

const Spark = ({ x, y, c, s = 1 }: { x: number; y: number; c: string; s?: number }) => (
  <path transform={`translate(${x} ${y}) scale(${s})`} d="M0 -9 L2.4 -2.4 9 0 2.4 2.4 0 9 -2.4 2.4 -9 0 -2.4 -2.4z" style={{ fill: `var(--c-${c}-fg)` }} />
);
const Face = ({ y }: { y: number }) => (
  <>
    <circle cx="50" cy={y} r="3.6" style={{ fill: 'var(--ink)' }} />
    <circle cx="70" cy={y} r="3.6" style={{ fill: 'var(--ink)' }} />
    <path d={`M52 ${y + 10} q8 7 16 0`} style={{ fill: 'none', stroke: 'var(--ink)', strokeWidth: 3.5, strokeLinecap: 'round' }} />
  </>
);
const line = { stroke: 'var(--lc-fg)', strokeWidth: 4.5 };

export function Doodle({ kind }: { kind: 'bag' | 'done' | 'note' }) {
  let body: ReactNode;
  if (kind === 'bag') body = (
    <>
      <path d="M45 34 q0-18 15-18 q15 0 15 18" style={{ ...line, fill: 'none', strokeLinecap: 'round' }} />
      <rect x="28" y="30" width="64" height="58" rx="16" style={{ ...line, fill: 'var(--lc-bg)' }} />
      <Face y={54} /><Spark x={100} y={22} c="zon" /><Spark x={18} y={40} c="roze" s={0.7} />
    </>
  );
  else if (kind === 'done') body = (
    <>
      <circle cx="60" cy="50" r="34" style={{ ...line, fill: 'var(--lc-bg)' }} />
      <path d="M44 51 l11 11 22-24" style={{ fill: 'none', stroke: 'var(--lc-fg)', strokeWidth: 7, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
      <Spark x={102} y={20} c="zon" /><Spark x={16} y={26} c="roze" s={0.8} /><Spark x={104} y={70} c="lucht" s={0.6} />
    </>
  );
  else body = (
    <>
      <rect x="32" y="14" width="56" height="74" rx="14" transform="rotate(-5 60 51)" style={{ ...line, fill: 'var(--surface)' }} />
      <path d="M44 36 h30 M44 48 h22" transform="rotate(-5 60 51)" style={{ stroke: 'var(--line)', strokeWidth: 4, strokeLinecap: 'round' }} />
      <Face y={60} /><Spark x={100} y={24} c="zon" />
    </>
  );
  return (
    <svg className="doodle" viewBox="0 0 120 100" aria-hidden="true">
      <ellipse cx="60" cy="93" rx="34" ry="5" style={{ fill: 'var(--line)' }} />
      {body}
    </svg>
  );
}

const AV_COLORS = ['tomaat', 'munt', 'lucht', 'zon', 'druif', 'roze'];
function colorFor(uid: string) {
  let h = 0; for (let n = 0; n < uid.length; n++) h = (h * 31 + uid.charCodeAt(n)) >>> 0;
  return `var(--c-${AV_COLORS[h % AV_COLORS.length]}-fg)`;
}

export function useHousehold(): Household | undefined {
  return useStore(s => s.households.find(h => h.id === s.hid));
}

/** "Jij", or the first name someone has in this household. */
export function useNames() {
  const h = useHousehold();
  const me = useStore(s => s.user?.uid);
  const full = (uid: string | null | undefined) => (!uid ? 'Iemand' : h?.memberInfo?.[uid]?.name || 'Iemand');
  const first = (uid: string | null | undefined) => (uid && uid === me ? 'Jij' : full(uid).split(' ')[0]);
  return { full, first, me };
}

export function Avatar({ uid, size = 26, className = '' }: { uid: string; size?: number; className?: string }) {
  const h = useHousehold();
  const info = h?.memberInfo?.[uid];
  const name = info?.name || '?';
  if (info?.photo) return <img className={className} src={info.photo} alt={name} title={name} width={size} height={size} style={{ width: size, height: size, borderRadius: '50%' }} referrerPolicy="no-referrer" />;
  return (
    <span className={`av ${className}`} title={name} style={{ width: size, height: size, background: colorFor(uid), fontSize: size * 0.45 }}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
