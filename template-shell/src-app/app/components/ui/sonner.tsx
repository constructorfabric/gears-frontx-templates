/**
 * Toaster Component - Based on shadcn/ui sonner wrapper
 */

import {
  CheckCircle2,
  Info,
  Loader2,
  XOctagon,
  AlertTriangle,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

import styles from "./sonner.module.css"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      icons={{
        success: <CheckCircle2 className={styles.icon} />,
        info: <Info className={styles.icon} />,
        warning: <AlertTriangle className={styles.icon} />,
        error: <XOctagon className={styles.icon} />,
        loading: <Loader2 className={styles.spinning} />,
      }}
      {...props}
    />
  )
}

export { Toaster }
