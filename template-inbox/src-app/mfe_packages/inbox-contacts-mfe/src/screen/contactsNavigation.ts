import { useMemo } from 'react';
import { useNavigate } from '@gears-frontx/routing-tanstack';

export type ContactsNavigation = {
  /** Opens a person's page, `/<contactId>` inside this screen. */
  openContact: (contactId: string) => void;
  /** Opens the directory, `/` inside this screen. */
  openDirectory: () => void;
};

/**
 * Where the contacts screen goes, through the screen's own router. Inside the
 * shell each call writes this screen's entry in the page address
 * (`?screen=contacts;route=r-42`), so a person's page is a link a thread can
 * point at, a visitor can reload, and Back and Forward walk through.
 */
export function useContactsNavigation(): ContactsNavigation {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      openContact: (contactId: string) => void navigate({ to: '/$contactId', params: { contactId } }),
      openDirectory: () => void navigate({ to: '/' }),
    }),
    [navigate]
  );
}
