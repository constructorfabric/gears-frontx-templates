// Named exports, not `export *`: `declaredRouteOf`/`extensionTokenOf`
// (`./domain-routing`) and the `DomainRoutingOptions`/`DomainRouteStatus`/
// `DispatchResult` types stay module-internal — T6c and T7 (per the plan's
// own sketches) consume only what is re-exported below. A caller that later
// needs one of those types can add it here explicitly; nothing stops that,
// but nothing hands it out unasked either.
export { DomainRouting, dispatchChain } from './domain-routing';
export { buildEntryAddresses, readEntryAddress, rootDomainKeyOf } from './entry-address';
