export {
  themeSchema,
  languageCodeSchema,
  languageSchema,
  extensionScreenSchema,
  extensionModalSchema,
  screenLabelsSchema,
} from './gts';
export {
  FRONTX_POPUP_DOMAIN,
  FRONTX_SIDEBAR_DOMAIN,
  FRONTX_SCREEN_DOMAIN,
  FRONTX_OVERLAY_DOMAIN,
  FRONTX_MFE_ENTRY_MF,
  FRONTX_SCREEN_EXTENSION_TYPE,
  FRONTX_SHARED_PROPERTY_THEME,
  FRONTX_SHARED_PROPERTY_LANGUAGE,
  screenDomain,
  sidebarDomain,
  popupDomain,
  overlayDomain,
} from './gts';
export type { ScreenExtension, ExtensionPresentation } from './gts';
export { LayoutDomain } from './layout-domain';
export { RestMockPlugin, type RestMockConfig } from './api/plugins/RestMockPlugin';
export { SseMockPlugin, type SseMockConfig } from './api/plugins/SseMockPlugin';
export { MockEventSource, type SseMockEvent } from './api/mocks/MockEventSource';
