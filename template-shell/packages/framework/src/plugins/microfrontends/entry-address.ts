import { validateName, type DomainKey, type EntryAddress, type ExtensionToken } from '@gears-frontx/routing';
import { getExtensionRouteToken, type ChildMfeBridge, type ExtensionDomain, type MfeRegistry } from '@gears-frontx/mfes';
import { FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES } from '../../mfe/constants';

type AddressMap = Record<string, { domainKey: string; extension: string }>;

/**
 * The `domain-key` production (odd `.`-separated segment count, every
 * segment a valid `name`) — mirrors `@gears-frontx/routing`'s own internal
 * `isValidDomainKey`, which the package does not re-export; `validateName`
 * alone would reject a nested domain's own composed key (e.g.
 * `screen.widgets-host.widgets`).
 */
function isValidDomainKeyString(candidate: string): candidate is DomainKey {
  const segments = candidate.split('.');
  return segments.length % 2 === 1 && segments.every((segment) => validateName(segment));
}

/** `validateName` returns a plain `boolean` — this predicate is what lets TypeScript narrow `extension` to `ExtensionToken` without a cast. */
function isValidExtensionToken(candidate: string): candidate is ExtensionToken {
  return validateName(candidate);
}

/**
 * This occupant's own entry address, read from the entry-addresses shared
 * property its host broadcast before mounting it — or `undefined` when the
 * host broadcast none (a host without routing, or a standalone mount), or
 * when the property carries something that is not, in fact, a valid address
 * (a stale or hand-edited value should never be trusted as one). The
 * action-chain payload never reaches the mounted occupant (checked against
 * `mfes`'s `mount_ext` handling), so this shared property is the only
 * channel carrying the address.
 */
export function readEntryAddress(bridge: ChildMfeBridge | undefined): EntryAddress | undefined {
  const map = bridge?.getProperty(FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES)?.value as Record<string, unknown> | undefined;
  if (typeof map !== 'object' || map === null) return undefined;
  const address = map[bridge!.extensionId] as { domainKey?: unknown; extension?: unknown } | undefined;
  if (typeof address !== 'object' || address === null) return undefined;
  const { domainKey, extension } = address;
  if (typeof domainKey !== 'string' || typeof extension !== 'string') return undefined;
  if (!isValidDomainKeyString(domainKey) || !isValidExtensionToken(extension)) return undefined;
  return { domainKey, extension };
}

/** The value a host broadcasts: every routable extension of every domain it projects. */
export function buildEntryAddresses(
  registry: MfeRegistry,
  domains: ReadonlyArray<{ readonly domainId: string; readonly domainKey: DomainKey }>,
): AddressMap {
  const map: AddressMap = {};
  for (const { domainId, domainKey } of domains) {
    for (const extension of registry.getExtensionsForDomain(domainId)) {
      const token = getExtensionRouteToken(extension);
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
