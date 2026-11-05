import { Modal } from '../components/Modal';
import type { DecisionRecord } from '../../coach/pokerCoach';
import { fmtPct } from '../../coach/format';

const ICON = { acierto: '✓', imprecision: '≈', error: '✗' } as const;
const NAME = { acierto: 'Acierto', imprecision: 'Imprecisión', error: 'Error' } as const;

export function ReviewModal({ open, records, onClose }: { open: boolean; records: DecisionRecord[]; onClose: () => void }) {
  const good = records.filter((r) => r.grade === 'acierto').length;
  const bad = records.filter((r) => r.grade === 'error').length;
  return (
    <Modal open={open} title="Revisión de la mano" onClose={onClose} footer={<button className="btn btn-gold" onClick={onClose}>Entendido</button>}>
      <p className="review-summary">
        {records.length} {records.length === 1 ? 'decisión' : 'decisiones'} · {good} {good === 1 ? 'acierto' : 'aciertos'}
        {bad ? ` · ${bad} ${bad === 1 ? 'error' : 'errores'}` : ''}
      </p>
      <ol className="review-list">
        {records.map((r, i) => (
          <li key={i} className={`review-item grade-${r.grade}`}>
            <span className="review-icon" aria-hidden="true">{ICON[r.grade]}</span>
            <div>
              <b>{NAME[r.grade]}</b>
              <p>{r.comment}</p>
              <small className="muted">Equity {fmtPct(r.equity)}{r.potOdds > 0 ? ` · necesitabas ${fmtPct(r.potOdds)}` : ''}</small>
            </div>
          </li>
        ))}
      </ol>
      <p className="muted small">Una buena decisión puede perder y una mala puede ganar: el coach evalúa la calidad de la jugada, no el resultado.</p>
    </Modal>
  );
}
