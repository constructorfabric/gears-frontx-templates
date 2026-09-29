/**
 * The app's API services, registered once at boot, and the one switch that
 * decides whether their mock plugins answer.
 *
 * `apiRegistry` rather than a bare `new InboxApiService()` because the registry
 * is where every service goes: it instantiates on registration and hands the
 * same instance to every caller, so a screen asks for a service by class and
 * never has to be told where the instance lives. A separate domain gets a
 * separate service (`MailApiService`, `DashboardApiService`) rather than a
 * field bolted onto an existing one.
 */

import {
  apiRegistry,
  isMockPlugin,
  RestProtocol,
  type RestPluginHooks,
} from '@gears-frontx/api';
import { DashboardApiService } from './DashboardApiService';
import { InboxApiService } from './InboxApiService';
import { MailApiService } from './MailApiService';
import { resetInboxMockState } from './mocks';

/**
 * A plugin a REST protocol holds that carries the `MOCK_PLUGIN` marker. The
 * registry stores plugins untyped (`getPlugins()`), and the marker is what
 * says one of them is a mock - the same test template-shell's mock effects
 * apply - so the narrowing is that test and nothing else.
 */
const isRestMockPlugin = (plugin: unknown): plugin is RestPluginHooks => isMockPlugin(plugin);

/**
 * Adds every registered service's mock plugins to their protocols, or takes
 * them off. On, the seed datasets answer every request; off, every request
 * reaches the backend at its service's base URL, with the endpoints, the
 * response types and the screens unchanged. Idempotent in both directions.
 */
export function setMockMode(enabled: boolean): void {
  for (const service of apiRegistry.getAll()) {
    for (const [protocol, plugins] of service.getPlugins()) {
      if (!(protocol instanceof RestProtocol)) continue;
      for (const plugin of plugins) {
        if (!isRestMockPlugin(plugin)) continue;
        const active = protocol.plugins.getAll().includes(plugin);
        if (enabled && !active) protocol.plugins.add(plugin);
        if (!enabled && active) protocol.plugins.remove(plugin);
      }
    }
  }
}

export function registerApiServices(): void {
  if (apiRegistry.has(InboxApiService)) return;
  apiRegistry.register(InboxApiService);
  apiRegistry.register(MailApiService);
  apiRegistry.register(DashboardApiService);
  apiRegistry.initialize();

  // The one place this app decides that the seed datasets answer rather than a
  // server. Pass `false`, or drop the call, the day there is a server.
  setMockMode(true);
}

/** Puts every mock store back to its seed. For tests, between cases. */
export function resetMockState(): void {
  resetInboxMockState();
}

export const getInboxApi = (): InboxApiService => apiRegistry.getService(InboxApiService);

export const getMailApi = (): MailApiService => apiRegistry.getService(MailApiService);

export const getDashboardApi = (): DashboardApiService =>
  apiRegistry.getService(DashboardApiService);
