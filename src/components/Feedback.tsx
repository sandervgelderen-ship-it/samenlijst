/**
 * "Iets melden", like Moestuin and the Pokémon scanner: a tab on the right edge of every screen. Tapping it
 * first takes a screenshot of what you see, then asks in a few words what went wrong or could be better.
 * Device, version, screen and recent errors go along automatically.
 */
import { useEffect, useState } from 'react';
import { MessageSquareWarning } from 'lucide-react';
import { captureContext, captureScreen, FEEDBACK_TEXT_MAX, NO_CAPTURE, sendFeedback, type FeedbackContext } from '../data/feedback';
import { useStore } from '../store/useStore';

const noCapture = { [NO_CAPTURE]: '' };

export function FeedbackTab() {
  const [capturing, setCapturing] = useState(false);
  const [sheet, setSheet] = useState<{ screenshot: string | null; context: FeedbackContext } | null>(null);
  const user = useStore(s => s.user);
  if (!user) return null;
  const start = async () => {
    if (capturing) return;
    setCapturing(true);
    const context = captureContext();
    const screenshot = await captureScreen();
    setCapturing(false);
    setSheet({ screenshot, context });
  };
  return (
    <>
      <button type="button" className="fbtab" {...noCapture} onClick={() => void start()} disabled={capturing}
        aria-label="Iets melden" title="Iets melden">
        {capturing ? <span className="dots" aria-hidden="true" /> : <MessageSquareWarning size={18} />}
      </button>
      {sheet && <FeedbackSheet {...sheet} onClose={() => setSheet(null)} />}
    </>
  );
}

function FeedbackSheet({ screenshot, context, onClose }: { screenshot: string | null; context: FeedbackContext; onClose: () => void }) {
  const [text, setText] = useState('');
  const [withShot, setWithShot] = useState(screenshot !== null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<'verstuurd' | 'wachtrij' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = async () => {
    setBusy(true); setProblem(null);
    try { setResult(await sendFeedback(text, withShot ? screenshot : null, context)); }
    catch (e) {
      console.warn('Melding versturen', e);
      const code = (e as { code?: string }).code;
      setProblem(code === 'permission-denied'
        ? 'Firebase weigert de melding. De Samenlijst-regels in Firestore missen nog het deel voor meldingen.'
        : (e as Error).message?.startsWith('De app') ? (e as Error).message : 'Versturen lukte niet. Probeer het opnieuw.');
    } finally { setBusy(false); }
  };

  return (
    <div className="backdrop fbwrap" {...noCapture} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Iets melden">
        <div className="grab" />
        {result ? (
          <>
            <h3><span className="spk"><MessageSquareWarning /></span>Bedankt!</h3>
            <p className="note" style={{ fontSize: '.98rem' }}>
              {result === 'verstuurd'
                ? 'Je melding is binnen. Hij wordt bekeken en gebruikt om Samenlijst beter te maken.'
                : 'Er is nu geen verbinding. Je melding gaat vanzelf mee zodra je weer online bent; laat de app daarvoor even open.'}
            </p>
            <div className="actions"><span /><button type="button" className="btn" onClick={onClose}>Klaar</button></div>
          </>
        ) : (
          <>
            <h3><span className="spk"><MessageSquareWarning /></span>Iets melden</h3>
            <label>Wat ging er mis, of wat zou je anders willen?
              <textarea className="field" rows={4} autoFocus value={text} maxLength={FEEDBACK_TEXT_MAX}
                onChange={e => setText(e.target.value)} placeholder="Bijvoorbeeld: ik vinkte iets af en het sprong terug." style={{ resize: 'vertical' }} />
            </label>
            {screenshot ? (
              <div className="fbshot">
                <img src={screenshot} alt="Schermafbeelding van wat je zag" style={{ opacity: withShot ? 1 : 0.3 }} />
                <label className="fbcheck">
                  <input type="checkbox" checked={withShot} onChange={e => setWithShot(e.target.checked)} />
                  <span>Schermafbeelding meesturen
                    <span className="note">Zo is te zien wat jij zag. Haal het vinkje weg als er iets op staat dat je niet wilt delen.</span>
                  </span>
                </label>
              </div>
            ) : <p className="note">Een schermafbeelding maken lukte niet; je melding gaat zonder.</p>}
            <p className="note">Er gaat ook mee: je soort toestel, de versie van de app, het scherm waar je was en recente foutmeldingen. Van je lijsten alleen de aantallen, niet wat erop staat.</p>
            {problem && <p className="fberr">{problem}</p>}
            <div className="actions">
              <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Annuleren</button>
              <button type="button" className="btn" onClick={() => void send()} disabled={busy || (!text.trim() && !withShot)}>{busy ? 'Versturen…' : 'Versturen'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
