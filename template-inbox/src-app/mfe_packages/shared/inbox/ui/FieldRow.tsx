import { orDash } from './format';
import styles from './shared.module.css';

export type FieldRowProps = { label: string; value: string };

/** A label and its value on one line; an empty value reads as the missing-value dash. */
export function FieldRow({ label, value }: FieldRowProps) {
  return (
    <div className={styles.fieldRow}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{orDash(value)}</span>
    </div>
  );
}
