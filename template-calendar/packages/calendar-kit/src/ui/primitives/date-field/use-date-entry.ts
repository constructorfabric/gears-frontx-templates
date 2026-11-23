"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type {
  ChangeEvent,
  ClipboardEvent,
  KeyboardEvent,
  MouseEvent,
  RefObject,
} from "react";

import type { SegmentEntry } from "../../../core/date-input";
import {
  clearSegment,
  dateMask,
  fillDigits,
  isEmptyText,
  maskedText,
  parseMaskedText,
  segmentIndexAt,
  stepSegment,
  typeDigit,
} from "../../../core/date-input";
import { DATE_INPUT, parseDateInput } from "../../../core/date-text";
import { toAsciiDigits } from "../../../core/digits";
import type { CalendarDate } from "../../../core/model";

const DIGIT_PATTERN = /^\d$/u;
const DIGIT_RUN_PATTERN = /^\d+$/u;

/** Tab walks the mask's segments; past the first or last one it belongs to the form. */
const tabStep = (
  event: KeyboardEvent<HTMLInputElement>,
  index: number,
  count: number
): number | null => {
  if (event.key !== "Tab") {
    return null;
  }

  const step = event.shiftKey ? -1 : 1;
  return index + step < 0 || index + step >= count ? null : step;
};

interface DateEntryOptions {
  readonly value: CalendarDate | "";
  readonly onValueChange: (value: CalendarDate | "") => void;
  readonly locale: string;
  readonly clearable: boolean;
  /** An empty field stays blank, for its native placeholder, until focus shows the mask. */
  readonly blankWhenEmpty: boolean;
  /** Fills the parts pasted text leaves out, e.g. the year in `30 Sep`. */
  readonly reference: CalendarDate;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly onOpenCalendar: () => void;
}

interface DateEntry {
  /** The masked value, e.g. `09/23/2026`, or the locale's placeholder. */
  readonly text: string;
  readonly filled: boolean;
  readonly focused: boolean;
  /** Drops any half-typed segment, e.g. once the calendar sets the date. */
  readonly reset: () => void;
  readonly handleFocus: () => void;
  readonly handleBlur: () => void;
  readonly handleClick: (event: MouseEvent<HTMLInputElement>) => void;
  readonly handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly handlePaste: (event: ClipboardEvent<HTMLInputElement>) => void;
  readonly handleChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

/** Segmented date entry: digits shift into the segment under the caret and move it on,
 * arrows step it, and a date commits as soon as the mask parses. */
export const useDateEntry = ({
  value,
  onValueChange,
  locale,
  clearable,
  blankWhenEmpty,
  reference,
  inputRef,
  onOpenCalendar,
}: DateEntryOptions): DateEntry => {
  const mask = useMemo(() => dateMask(locale), [locale]);

  const [draft, setDraft] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [focused, setFocused] = useState(false);

  const entryRef = useRef<SegmentEntry | null>(null);

  const text =
    draft ??
    (blankWhenEmpty && value === "" && !focused ? "" : maskedText(value, mask));

  const selectSegment = useCallback(
    (target: number): void => {
      const input = inputRef.current;
      const segment = mask.segments[target];
      if (input === null || segment === undefined) {
        return;
      }

      input.setSelectionRange(segment.start, segment.start + segment.length);
    },
    [inputRef, mask]
  );

  useLayoutEffect(() => {
    if (!focused || text.length !== mask.empty.length) {
      return;
    }

    selectSegment(index);
  }, [focused, index, mask, selectSegment, text]);

  const commit = useCallback(
    (next: string): void => {
      const parsed = parseMaskedText(next, mask);
      const cleared = clearable && isEmptyText(next, mask);

      /* The typed text stands until focus leaves: a half-typed year such as 0002
       * parses, and snapping the mask back to it would eat the next keystroke. */
      setDraft(next);

      if (parsed !== value && (parsed !== "" || cleared)) {
        onValueChange(parsed);
      }
    },
    [clearable, mask, onValueChange, value]
  );

  const reset = useCallback((): void => {
    entryRef.current = null;
    setDraft(null);
  }, []);

  const moveBy = useCallback(
    (step: number): void => {
      entryRef.current = null;

      const next = Math.min(
        Math.max(index + step, 0),
        mask.segments.length - 1
      );

      setIndex(next);
      selectSegment(next);
    },
    [index, mask, selectSegment]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>): void => {
      const segment = mask.segments[index];
      if (segment === undefined || event.metaKey || event.ctrlKey) {
        return;
      }

      if (event.altKey) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          onOpenCalendar();
        }

        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        moveBy(event.key === "ArrowLeft" ? -1 : 1);
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        entryRef.current = null;
        commit(stepSegment(text, segment, event.key === "ArrowUp" ? 1 : -1));
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        entryRef.current = null;
        commit(clearSegment(text, mask, segment));
        return;
      }

      const tab = tabStep(event, index, mask.segments.length);
      if (tab !== null) {
        event.preventDefault();
        moveBy(tab);
        return;
      }

      if (DIGIT_PATTERN.test(event.key)) {
        event.preventDefault();

        const typed = typeDigit(text, segment, entryRef.current, event.key);
        entryRef.current = typed.entry;

        if (typed.complete) {
          // Writing the new text moves the caret to its end, so it must land before the next segment is selected.
          flushSync(() => {
            commit(typed.text);
          });
          moveBy(1);
        } else {
          commit(typed.text);
        }

        return;
      }

      /* Nothing but digits can reach the mask; Enter still belongs to the form. */
      if (event.key.length === 1) {
        event.preventDefault();
      }
    },
    [commit, index, mask, moveBy, onOpenCalendar, text]
  );

  /* Only a bare digit run (`09232026`) fills the mask digit by digit. Other pasted text goes through the
   * text reader; anything it rejects is ignored rather than spread across the segments. */
  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLInputElement>): void => {
      event.preventDefault();
      entryRef.current = null;

      const pasted = event.clipboardData.getData("text");
      const parsed = parseDateInput(pasted, { locale, reference });

      if (parsed.kind === DATE_INPUT.value) {
        commit(maskedText(parsed.value, mask));
      } else if (DIGIT_RUN_PATTERN.test(toAsciiDigits(pasted).trim())) {
        commit(fillDigits(mask, pasted));
      }
    },
    [commit, locale, mask, reference]
  );

  const handleClick = useCallback(
    (event: MouseEvent<HTMLInputElement>): void => {
      // An empty field's caret sits at its end, the last segment; a new entry starts at the first.
      const caret = event.currentTarget.selectionStart ?? 0;
      const target = text === mask.empty ? 0 : segmentIndexAt(mask, caret);

      entryRef.current = null;
      setIndex(target);
      selectSegment(target);
    },
    [mask, selectSegment, text]
  );

  /* Keyboards that never raise keydown, such as Android's, land here instead:
   * whatever digits they left in the field refill the mask. */
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      commit(fillDigits(mask, event.target.value));
    },
    [commit, mask]
  );

  const handleFocus = useCallback((): void => {
    setFocused(true);
  }, []);

  const handleBlur = useCallback((): void => {
    setFocused(false);
    reset();
  }, [reset]);

  return {
    filled: value !== "",
    focused,
    handleBlur,
    handleChange,
    handleClick,
    handleFocus,
    handleKeyDown,
    handlePaste,
    reset,
    text,
  };
};
