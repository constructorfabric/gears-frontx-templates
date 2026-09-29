import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { PlusIcon, XIcon } from 'lucide-react';
import { Badge, Button, Input } from '@gears-frontx/ui-kit';
import styles from '../../styles/workspace.module.css';

export type TagEditorProps = {
  tags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  t: (key: string) => string;
};

export function TagEditor({ tags, onAddTag, onRemoveTag, t }: TagEditorProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  // Set when the input closes from the keyboard, so focus goes back to the
  // button that opened it instead of dropping to the page. A blur closes it
  // too, and there focus has already gone where the agent clicked.
  const returnFocus = useRef(false);

  useEffect(() => {
    if (draft === null && returnFocus.current) {
      returnFocus.current = false;
      addButtonRef.current?.focus();
    }
  }, [draft]);

  const commit = () => {
    const tag = draft?.trim() ?? '';
    // A duplicate is silently the same edit, not an error worth reporting: the
    // tag the agent wanted is already on the conversation either way.
    if (tag !== '' && !tags.includes(tag)) onAddTag(tag);
    setDraft(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      returnFocus.current = true;
      commit();
    }
    if (event.key === 'Escape') {
      returnFocus.current = true;
      setDraft(null);
    }
  };

  return (
    <div className={styles.chipRow}>
      {/*
        The whole chip is the remove control, through Badge's own `render`
        prop: a button nested inside a Badge would be an interactive element
        inside a label, which the kit calls out as an anti-pattern.
      */}
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          render={
            <button
              type="button"
              onClick={() => onRemoveTag(tag)}
              aria-label={t('remove_tag').replace('{tag}', tag)}
            />
          }
        >
          {tag}
          <XIcon />
        </Badge>
      ))}
      {draft === null ? (
        <Button ref={addButtonRef} variant="ghost" size="sm" icon={<PlusIcon />} onClick={() => setDraft('')}>
          {t('add_tag')}
        </Button>
      ) : (
        <Input
          autoFocus
          value={draft}
          onValueChange={setDraft}
          onKeyDown={onKeyDown}
          onBlur={commit}
          aria-label={t('add_tag')}
          placeholder={t('add_tag')}
        />
      )}
    </div>
  );
}
