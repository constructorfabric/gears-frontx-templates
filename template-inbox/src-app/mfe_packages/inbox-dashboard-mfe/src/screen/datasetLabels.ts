/**
 * The names of the dataset's rows. The dataset carries ids only, like the
 * stages and series of the charts, and the screen names each row from this
 * package's catalogue, so a KPI card, a workload metric and a lead source
 * read in the screen's language. An id the catalogue does not know shows as
 * itself rather than as an empty label.
 */
import type { Translate } from '@inbox-shared/i18n/translate';

export const KPI_LABEL_KEYS: Readonly<Record<string, string>> = {
  'open-conversations': 'kpi_open_conversations',
  'resolved-this-week': 'kpi_resolved_this_week',
  'avg-first-response': 'kpi_avg_first_response',
};

export const KPI_FOOTER_LABEL_KEYS: Readonly<Record<string, string>> = {
  'open-conversations': 'kpi_footer_unassigned',
  'resolved-this-week': 'kpi_footer_reopened',
  'avg-first-response': 'kpi_footer_fastest_reply',
};

export const WORKLOAD_LABEL_KEYS: Readonly<Record<string, string>> = {
  'support-load': 'workload_support_load',
  'dev-backlog': 'workload_dev_backlog',
  'crm-tasks': 'workload_crm_tasks',
  'qa-reviews': 'workload_qa_reviews',
};

export const LEAD_SOURCE_LABEL_KEYS: Readonly<Record<string, string>> = {
  inbound: 'lead_source_inbound',
  outbound: 'lead_source_outbound',
  referral: 'lead_source_referral',
  event: 'lead_source_event',
  partner: 'lead_source_partner',
};

const labelFrom =
  (keys: Readonly<Record<string, string>>) =>
  (id: string, t: Translate): string => {
    const key = keys[id];
    return key === undefined ? id : t(key);
  };

export const kpiLabel = labelFrom(KPI_LABEL_KEYS);
export const kpiFooterLabel = labelFrom(KPI_FOOTER_LABEL_KEYS);
export const workloadLabel = labelFrom(WORKLOAD_LABEL_KEYS);
export const leadSourceLabel = labelFrom(LEAD_SOURCE_LABEL_KEYS);
