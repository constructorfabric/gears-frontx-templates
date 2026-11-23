import { useState } from "react";

import { useCalendarLocalization } from "../../i18n/calendar-localization";
import { Button } from "../primitives/button/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../primitives/dialog/dialog";
import { Radio, RadioGroup } from "../primitives/radio/radio";

import styles from "./recurrence-scope-dialog.module.css";

export type RecurrenceScopeAction = "edit" | "move" | "delete";
export type RecurrenceScope = "occurrence" | "following" | "series";

export interface RecurrenceScopeDialogProps {
  readonly open: boolean;
  readonly action: RecurrenceScopeAction;
  readonly onConfirm: (scope: RecurrenceScope) => void;
  readonly onCancel: () => void;
}

const SCOPES: readonly RecurrenceScope[] = ["occurrence", "following", "series"];

const scopeLabelIds = {
  occurrence: "calendar.recurrenceScope.occurrence",
  following: "calendar.recurrenceScope.following",
  series: "calendar.recurrenceScope.series",
} as const satisfies Record<RecurrenceScope, string>;

const titleIds = {
  edit: "calendar.recurrenceScope.title.edit",
  move: "calendar.recurrenceScope.title.move",
  delete: "calendar.recurrenceScope.title.delete",
} as const satisfies Record<RecurrenceScopeAction, string>;

const confirmIds = {
  edit: "calendar.recurrenceScope.confirm.edit",
  move: "calendar.recurrenceScope.confirm.move",
  delete: "calendar.recurrenceScope.confirm.delete",
} as const satisfies Record<RecurrenceScopeAction, string>;

const isRecurrenceScope = (value: string): value is RecurrenceScope =>
  (SCOPES as readonly string[]).includes(value);

const RecurrenceScopeForm = ({
  action,
  onConfirm,
  onCancel,
}: Omit<RecurrenceScopeDialogProps, "open">) => {
  const { t } = useCalendarLocalization();
  const [scope, setScope] = useState<RecurrenceScope>("occurrence");

  return (
    <DialogContent className={styles.dialog}>
      <DialogHeader>
        <DialogTitle>{t(titleIds[action])}</DialogTitle>
      </DialogHeader>
      <div className={styles.body}>
        <RadioGroup
          name="recurrence-scope"
          aria-label={t("calendar.recurrenceScope.label")}
          value={scope}
          onValueChange={(value) => {
            if (isRecurrenceScope(value)) setScope(value);
          }}
        >
          {SCOPES.map((option) => (
            <Radio
              key={option}
              value={option}
              label={t(scopeLabelIds[option])}
            />
          ))}
        </RadioGroup>
      </div>
      <DialogFooter className={styles.footer}>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("calendar.recurrenceScope.cancel")}
        </Button>
        <Button
          type="button"
          variant={action === "delete" ? "danger" : "primary"}
          onClick={() => {
            onConfirm(scope);
          }}
        >
          {t(confirmIds[action])}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

export const RecurrenceScopeDialog = ({
  open,
  action,
  onConfirm,
  onCancel,
}: RecurrenceScopeDialogProps) => (
  <Dialog
    open={open}
    onOpenChange={(nextOpen) => {
      if (!nextOpen) onCancel();
    }}
  >
    {open ? (
      <RecurrenceScopeForm
        action={action}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    ) : null}
  </Dialog>
);
