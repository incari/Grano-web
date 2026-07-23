import { ClipboardList, Bean, Star } from 'lucide-react';
import { useBrewLogs } from '../../store/useStore';
import { formatTime } from '../../utils/recipe';
import styles from './Log.module.scss';

export default function Log() {
  const { logs, deleteLog } = useBrewLogs();

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1><ClipboardList size={26} strokeWidth={2.25} /> History</h1>
      </header>

      {logs.length === 0 && (
        <p className={styles.empty}>You haven't logged any brews yet.</p>
      )}

      <div className={styles.list}>
        {logs.map(log => (
          <div key={log.id} className={styles.card}>
            <div className={styles.top}>
              <span className={styles.method}>{log.method}</span>
              <span className={styles.date}>
                {new Date(log.brewedAt).toLocaleDateString('es-ES', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
            {log.beanName && <div className={styles.bean}><Bean size={15} /> {log.beanName}</div>}
            <div className={styles.stats}>
              <div><span>{log.dose} g</span><small>coffee</small></div>
              <div><span>{log.waterWeight} g</span><small>water</small></div>
              <div><span>1:{log.ratio}</span><small>ratio</small></div>
              <div><span>{formatTime(log.brewTimeSeconds)}</span><small>time</small></div>
            </div>
            <div className={styles.rating}>
              {Array.from({ length: 5 }, (_, i) => (
                <Star
                  key={i}
                  size={16}
                  fill={i < log.rating ? 'currentColor' : 'none'}
                />
              ))}
            </div>
            {log.notes && <p className={styles.notes}>{log.notes}</p>}
            <button className={styles.del} onClick={() => deleteLog(log.id)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
