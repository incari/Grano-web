import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./PageHeader.module.scss";

export default function PageHeader({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className={styles.head}>
      <div className={styles.lead}>
        <span className={styles.badge}>
          <Icon
            size={19}
            strokeWidth={2.25}
          />
        </span>
        <div className={styles.titleGroup}>
          {subtitle && <span className={styles.eyebrow}>{subtitle}</span>}
          <h1 className={styles.title}>{title}</h1>
        </div>
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </header>
  );
}
