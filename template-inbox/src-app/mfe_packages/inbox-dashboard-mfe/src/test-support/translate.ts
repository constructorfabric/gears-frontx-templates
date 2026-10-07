import { createTranslate, locale } from '@inbox-shared/i18n/translate';
import { catalogueFor } from '@inbox-shared/i18n/useInboxTranslate';
import { dashboardCatalogues } from '../i18n/catalogues';

/** The translator the frame builds for `en`: the shared catalogue with this screen's merged over it. */
export const t = createTranslate(catalogueFor('en', dashboardCatalogues), locale);
