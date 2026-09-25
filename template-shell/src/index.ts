export {
  themeSchema,
  languageSchema,
  extensionScreenSchema,
  entryAddressesSchema,
  FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES,
} from './gts';
export { LayoutDomain } from './layout-domain';
export * from './routing';
export { RestMockPlugin, type RestMockConfig } from './api/plugins/RestMockPlugin';
export { SseMockPlugin, type SseMockConfig } from './api/plugins/SseMockPlugin';
export { MockEventSource, type SseMockEvent } from './api/mocks/MockEventSource';
