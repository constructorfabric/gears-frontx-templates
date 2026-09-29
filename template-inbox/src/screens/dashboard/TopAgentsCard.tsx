import { Badge, Card, CardContent, CardHeader, CardTitle } from '@gears-frontx/ui-kit';
import type { TopAgent } from '../../api/dashboardTypes';
import type { Translate } from '../../shared/i18n';
import { IdentityAvatar } from '../../shared/IdentityAvatar';
import { formatCount } from './dashboardSelectors';
import styles from './dashboard.module.css';

export type TopAgentsCardProps = {
  agents: TopAgent[];
  t: Translate;
};

/**
 * Row 3's ranked list card: an Avatar plus a resolved-count Badge per agent,
 * ranked by that same count.
 */
export function TopAgentsCard({ agents, t }: TopAgentsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('top_agents')}</CardTitle>
      </CardHeader>
      <CardContent className={styles.topAgentsList}>
        {agents.map((agent, index) => (
          <div className={styles.topAgentRow} key={agent.id}>
            <span className={styles.topAgentRank}>{index + 1}</span>
            <IdentityAvatar name={agent.name} size="sm" />
            <span className={styles.topAgentName}>{agent.name}</span>
            <Badge variant="secondary" className={styles.topAgentBadge}>
              {formatCount(agent.resolvedCount)}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
