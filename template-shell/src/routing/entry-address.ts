import { validateName, type DomainKey, type EntryAddress } from '@gears-frontx/routing';
import type { ChildMfeBridge, ExtensionDomain, MfeRegistry } from '@gears-frontx/mfes';
import { FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES } from '../gts';
import { extensionTokenOf } from './domain-routing';

type AddressMap = Record<string, { domainKey: string; extension: string }>;

/**
 * This occupant's own entry address, read from the entry-addresses shared
 * property its host broadcast before mounting it — or `undefined` when the
 * host broadcast none (a host without routing, or a standalone mount). The
 * action-chain payload never reaches the mounted occupant (checked against
 * `mfes`'s `mount_ext` handling), so this shared property is the only
 * channel carrying the address.
 */
export function readEntryAddress(bridge: ChildMfeBridge | undefined): EntryAddress | undefined {
  const map = bridge?.getProperty(FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES)?.value as Record<string, unknown> | undefined;
  if (typeof map !== 'object' || map === null) return undefined;
  const address = map[bridge!.extensionId] as { domainKey?: unknown; extension?: unknown } | undefined;
  if (typeof address !== 'object' || address === null) return undefined;
  if (typeof address.domainKey !== 'string' || typeof address.extension !== 'string') return undefined;
  return address as EntryAddress;
}

/** The value a host broadcasts: every routable extension of every domain it projects. */
export function buildEntryAddresses(
  registry: MfeRegistry,
  domains: ReadonlyArray<{ readonly domainId: string; readonly domainKey: DomainKey }>,
): AddressMap {
  const map: AddressMap = {};
  for (const { domainId, domainKey } of domains) {
    for (const extension of registry.getExtensionsForDomain(domainId)) {
      const token = extensionTokenOf(extension);
      if (token !== undefined) map[extension.id] = { domainKey, extension: token };
    }
  }
  return map;
}

/**
 * A root domain key from a domain's declared route: the routing package's own
 * `validateName`, then the brand — `mfes` has already refused an invalid
 * declared route at `registerDomain`, so this only re-states that check.
 */
export function rootDomainKeyOf(domain: ExtensionDomain): DomainKey | undefined {
  return typeof domain.route === 'string' && validateName(domain.route) ? (domain.route as DomainKey) : undefined;
}
