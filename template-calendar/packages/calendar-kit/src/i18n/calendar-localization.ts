"use client";

import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";

import type {
  CalendarDirection,
  CalendarLocale,
  CalendarTranslate,
} from "../core/model";
import type { CalendarViewerProps } from "./calendar-context";
import { englishTranslate } from "./english";
import type {
  CalendarMessages,
  CalendarMissingTranslation,
  CalendarTranslations,
} from "./translations";

/** Everything a calendar needs to speak: locale, direction, translator and the text behind it. */
export interface CalendarLocalizationProps {
  /** BCP 47 locale for dates, numbers and plural rules. Default `en-US`. */
  readonly locale?: CalendarLocale;
  /** Text direction. Defaults to the direction of the resolved locale. */
  readonly direction?: CalendarDirection;
  /** Host translator, consulted after a component's own `translations`. */
  readonly t?: CalendarTranslate;
  /** Catalogues by locale. `pt-BR` reads `pt-BR`, then `pt`, then the bundled English. */
  readonly messages?: CalendarMessages;
}

export interface CalendarLocalizationValue {
  /** Resolved locale. */
  readonly locale: CalendarLocale;
  /** Resolved direction. */
  readonly direction: CalendarDirection;
  /** Translator that walks every layer. */
  readonly t: CalendarTranslate;
}

export interface CalendarLocalizationProviderProps extends CalendarLocalizationProps {
  /** Reports ids nothing could resolve, once each per provider. */
  readonly onMissingTranslation?: CalendarMissingTranslation;
  /** The calendar UI. */
  readonly children?: ReactNode;
}

/** Props a component hands to the scopes it opens. */
export interface CalendarContextProps
  extends CalendarLocalizationProps, CalendarViewerProps {
  /**
   * Text for the active locale, used in place of the provider's. A component renders in exactly
   * one locale, so this stays flat; a whole calendar takes `messages` instead.
   */
  readonly translations?: CalendarTranslations;
}

export const omitCalendarContextProps = <Props extends CalendarContextProps>(
  props: Props
): Omit<Props, keyof CalendarContextProps> => {
  const {
    direction: _direction,
    locale: _locale,
    messages: _messages,
    t: _t,
    timeZone: _timeZone,
    translations: _translations,
    ...contentProps
  } = props;

  return contentProps;
};

interface CalendarLocalizationState extends CalendarLocalizationValue {
  readonly explicitDirection?: CalendarDirection;
  readonly hostT?: CalendarTranslate;
  readonly messages: CalendarMessages;
  readonly onMissingTranslation?: CalendarMissingTranslation;
  readonly missingIds: Set<string>;
}

export const CalendarLocalizationContext =
  createContext<CalendarLocalizationState>({
    direction: "ltr",
    locale: "en-US",
    messages: {},
    missingIds: new Set<string>(),
    t: englishTranslate,
  });

export const useCalendarLocalization = (): CalendarLocalizationValue => {
  const { direction, locale, t } = useContext(CalendarLocalizationContext);

  return useMemo(() => ({ direction, locale, t }), [direction, locale, t]);
};

export type { CalendarTranslate } from "../core/model";
