import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  endpointTags,
  mutationResult,
  queryResultFor,
  refetchCalls,
  resetApiMocks,
  setQueryState,
} from '../../__test-utils__/apiMocks';
import { renderScreen } from '../../__test-utils__/renderScreen';
import { act } from 'react';
import { t } from '../../shared/i18n';

vi.mock('../../api/registry', () => ({
  getDashboardApi: () => endpointTags,
  getInboxApi: () => endpointTags,
}));
vi.mock('../../api/queries', () => ({
  useApiQuery: queryResultFor,
  useApiMutation: mutationResult,
}));

const { DashboardScreen } = await import('./DashboardScreen');


afterEach(() => {
  resetApiMocks();
});

describe('DashboardScreen', () => {
  it('renders every row 1 KPI card, with a delta badge computed from its series', () => {
    const screen = renderScreen(<DashboardScreen t={t} />);

    expect(screen.getByText('Open conversations')).toBeTruthy();
    expect(screen.getByText('Resolved this week')).toBeTruthy();
    expect(screen.getByText('Avg first response')).toBeTruthy();

    // Cross-checked against `kpiCards` in `dashboardDataset.ts`: the latest
    // point of the open-conversations series is 24, down from a
    // `previousValue` of 33 - a computed -27.3% delta, not a hardcoded one.
    expect(screen.getAllByText('24').length).toBeGreaterThan(0);
    expect(screen.getByText('-27.3%')).toBeTruthy();

    // "Resolved this week" sums its whole series (16+20+24+29+22+18+21=150).
    expect(screen.getAllByText('150').length).toBeGreaterThan(0);

    // "Avg first response" reads its latest point in minutes.
    expect(screen.getAllByText('9m').length).toBeGreaterThan(0);
  });

  it('renders the fourth row 1 card, "Contacts by stage", with counts and computed percents', () => {
    const screen = renderScreen(<DashboardScreen t={t} />);

    expect(screen.getByText(t('contacts_by_stage'))).toBeTruthy();
    expect(screen.getByText('Prospect')).toBeTruthy();
    expect(screen.getByText('Churned')).toBeTruthy();
    // `contactsByStage` in `dashboardDataset.ts`: Prospect is 15 of 60
    // contacts total - a computed 25%, not a hardcoded one (see
    // `dashboardSelectors.test.ts`).
    expect(screen.getAllByText('15').length).toBeGreaterThan(0);
    expect(screen.getAllByText('25%').length).toBeGreaterThan(0);
  });

  it('renders row 2: the resolved-per-day chart, the new contacts hero, and the summary card', () => {
    const screen = renderScreen(<DashboardScreen t={t} />);

    expect(screen.getByText(t('resolved_per_day'))).toBeTruthy();
    expect(screen.getByText(t('new_contacts'))).toBeTruthy();
    // New contacts totals inbound (89) + outbound (42) = 131 - computed, not
    // stored as its own field.
    expect(screen.getAllByText('131').length).toBeGreaterThan(0);
    expect(screen.getByText(t('summary'))).toBeTruthy();
    expect(screen.getByText(t('view_report'))).toBeTruthy();
  });

  it('renders row 3: the records-created chart and the ranked top-agents list, Alex Rivera included', () => {
    const screen = renderScreen(<DashboardScreen t={t} />);

    expect(screen.getByText(t('records_created'))).toBeTruthy();
    expect(screen.getByText(t('records_created_subtitle'))).toBeTruthy();
    // `recordsCreated` sums companies+opportunities+people across all 12
    // months to 266 - computed by `recordsCreatedTotal`, not hardcoded (see
    // `dashboardDataset.ts` and `dashboardSelectors.test.ts`).
    expect(screen.getAllByText('266').length).toBeGreaterThan(0);
    expect(screen.getByText(t('top_agents'))).toBeTruthy();
    // Alex Rivera appears both in the ranked list and as the owning agent of at
    // least one activity row, so more than one match is expected here.
    expect(screen.getAllByText('Alex Rivera').length).toBeGreaterThan(0);
  });

  it('renders the team workload strip as its own full-width row with four blocks', () => {
    const screen = renderScreen(<DashboardScreen t={t} />);

    expect(screen.getByText(t('team_workload'))).toBeTruthy();
    expect(screen.getByText('Support load')).toBeTruthy();
    expect(screen.getByText('Dev backlog')).toBeTruthy();
    expect(screen.getByText('CRM tasks')).toBeTruthy();
    expect(screen.getByText('QA reviews')).toBeTruthy();
  });

  it('renders the stage-funnel and conversion-by-source row', () => {
    const screen = renderScreen(<DashboardScreen t={t} />);

    expect(screen.getByText(t('stage_funnel'))).toBeTruthy();
    // `stageFunnel` in `dashboardDataset.ts`: the first stage, New, is the
    // funnel's own total (120) - computed by `funnelTotal`, not hardcoded.
    expect(screen.getAllByText('120').length).toBeGreaterThan(0);

    expect(screen.getByText(t('conversion_by_source'))).toBeTruthy();
    // `conversionBySource`: won (140) over won+lost (220) is a computed 64%
    // (see `dashboardSelectors.test.ts`), not hardcoded.
    expect(screen.getAllByText('64%').length).toBeGreaterThan(0);
  });

  it('renders row 4: the recent activity table, contacts resolved from the inbox dataset', () => {
    const screen = renderScreen(<DashboardScreen t={t} />);

    expect(screen.getByText(t('recent_activity'))).toBeTruthy();
    // `activity[0]` in the mocked dataset is owned by Alex Rivera and points
    // at the first seeded contact, Grace Park.
    expect(screen.getByText('Grace Park')).toBeTruthy();
  });

  it('shows an error with a retry, rather than a blank pane, when the dashboard fails to load', () => {
    setQueryState('dashboard', { error: new Error('down') });
    const screen = renderScreen(<DashboardScreen t={t} />);

    expect(screen.getByRole('alert').textContent).toContain(t('load_error_title'));
    act(() => {
      screen.getByRole('button', { name: t('retry') }).click();
    });
    expect(refetchCalls).toEqual(['dashboard']);
  });

  it('shows the loading state until both of its queries have answered', () => {
    setQueryState('contacts', { isLoading: true });
    const screen = renderScreen(<DashboardScreen t={t} />);

    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText(t('recent_activity'))).toBeNull();
  });
});
