import { useState, type ReactNode } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@gears-frontx/ui-kit';
import sharedStyles from '../../shared/shared.module.css';
import styles from './inbox.module.css';

export type DetailsSectionProps = {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

/**
 * One collapsible block of the customer details panel. The open state lives
 * here rather than in the panel because nothing outside the section reads it,
 * and every section except Links starts open.
 */
export function DetailsSection({ title, defaultOpen = true, children }: DetailsSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={styles.section}>
      <CollapsibleTrigger className={styles.sectionTrigger}>
        <span>{title}</span>
        {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={sharedStyles.stack}>{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
