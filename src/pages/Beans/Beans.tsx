import { useRef, useState } from 'react';
import { Bean, Camera } from 'lucide-react';
import type { CoffeeBean } from '../../types';
import { useBeans } from '../../store/useStore';
import styles from './Beans.module.scss';

const ROAST_LEVELS: CoffeeBean['roastLevel'][] = ['light', 'medium', 'medium-dark', 'dark'];

function emptyBean(): Omit<CoffeeBean, 'id' | 'addedAt'> {
  return { name: '', origin: '', roaster: '', roastLevel: 'medium', notes: '', photoUrl: undefined };
}

export default function Beans() {
  const { beans, addBean, deleteBean } = useBeans();
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(emptyBean());
  const fileRef = useRef<HTMLInputElement>(null);

  function handlePhoto(file: File) {
    const reader = new FileReader();
    reader.onload = () => setDraft(d => ({ ...d, photoUrl: reader.result as string }));
    reader.readAsDataURL(file);
  }

  function save() {
    if (!draft.name.trim()) {
      return;
    }
    addBean({
      ...draft,
      id: crypto.randomUUID(),
      addedAt: new Date().toISOString(),
    });
    setDraft(emptyBean());
    setShowForm(false);
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1><Bean size={26} strokeWidth={2.25} /> Beans</h1>
        <button className={styles.addBtn} onClick={() => setShowForm(s => !s)}>
          {showForm ? 'Cancel' : '+ Add'}
        </button>
      </header>

      {showForm && (
        <div className={styles.form}>
          <button
            className={styles.photoUpload}
            onClick={() => fileRef.current?.click()}
            style={draft.photoUrl ? { backgroundImage: `url(${draft.photoUrl})` } : undefined}
          >
            {!draft.photoUrl && <span className={styles.photoLabel}><Camera size={18} /> Add photo</span>}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={e => e.target.files?.[0] && handlePhoto(e.target.files[0])}
          />

          <input
            className={styles.input}
            placeholder="Coffee name"
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          />
          <input
            className={styles.input}
            placeholder="Origin (e.g. Ethiopia, Yirgacheffe)"
            value={draft.origin}
            onChange={e => setDraft(d => ({ ...d, origin: e.target.value }))}
          />
          <input
            className={styles.input}
            placeholder="Roaster"
            value={draft.roaster}
            onChange={e => setDraft(d => ({ ...d, roaster: e.target.value }))}
          />
          <div className={styles.roasts}>
            {ROAST_LEVELS.map(r => (
              <button
                key={r}
                className={`${styles.roast} ${draft.roastLevel === r ? styles.roastActive : ''}`}
                onClick={() => setDraft(d => ({ ...d, roastLevel: r }))}
              >
                {r}
              </button>
            ))}
          </div>
          <textarea
            className={styles.textarea}
            placeholder="Tasting notes (fruity, chocolate, citrus...)"
            value={draft.notes}
            onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
          />
          <button className={styles.save} onClick={save}>Save bean</button>
        </div>
      )}

      {beans.length === 0 && !showForm && (
        <p className={styles.empty}>You don't have any beans yet. Add one with a photo.</p>
      )}

      <div className={styles.list}>
        {beans.map(b => (
          <div key={b.id} className={styles.card}>
            {b.photoUrl ? (
              <div className={styles.thumb} style={{ backgroundImage: `url(${b.photoUrl})` }} />
            ) : (
              <div className={`${styles.thumb} ${styles.thumbEmpty}`}><Bean size={28} /></div>
            )}
            <div className={styles.info}>
              <span className={styles.name}>{b.name}</span>
              {b.origin && <span className={styles.origin}>{b.origin}</span>}
              <div className={styles.meta}>
                {b.roaster && <span>{b.roaster}</span>}
                <span className={styles.roastTag}>{b.roastLevel}</span>
              </div>
              {b.notes && <p className={styles.notes}>{b.notes}</p>}
            </div>
            <button className={styles.del} onClick={() => deleteBean(b.id)} aria-label="Delete">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
