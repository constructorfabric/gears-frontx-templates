/*
 * One loading frame per screen, one assertion over all of them: every screen's
 * skeleton branch renders the screen root itself, and that root is what the
 * screen's CSS Module holds at the host's height. A rule lost on any one
 * screen would let that screen's cold frame collapse to the skeleton and grow
 * once the dictionary lands, which is exactly the regression the min-height
 * declaration exists to prevent.
 *
 * The suite ships the modules' real CSS (`css: true`), so the computed style
 * pins the declaration through the same cascade a browser runs. The screens
 * render with the hook mocked to its loading state, which is the only branch
 * this assertion reads; the screens' own suites cover the loaded branch.
 */
import React from 'react';
import { render } from '@testing-library/react';
import type { ChildMfeBridge } from '@gears-frontx/react/mfe';
import { createMfeBridgeFixture } from '@frontx-test-utils/createMfeBridgeFixture';
import { mockShadowHost } from '@frontx-test-utils/mockShadowHost';
import { describe, expect, it, vi } from 'vitest';

const { useScreenTranslationsMock } = vi.hoisted(() => ({
  useScreenTranslationsMock: vi.fn(),
}));

vi.mock('../shared/useScreenTranslations', () => ({
  useScreenTranslations: useScreenTranslationsMock,
}));

/*
 * Only the profile screen touches the API layer, and it does so on every
 * render, loading branch included. The registry has no services here and the
 * queries would only have to not run, so the screen gets stand-ins that
 * neither fetch nor fail.
 */
const { apiRegistryMock, useApiQueryMock, useApiMutationMock } = vi.hoisted(() => ({
  apiRegistryMock: { getService: vi.fn() },
  useApiQueryMock: vi.fn(),
  useApiMutationMock: vi.fn(),
}));

vi.mock('@gears-frontx/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gears-frontx/react')>();
  return {
    ...actual,
    apiRegistry: apiRegistryMock,
    useApiQuery: useApiQueryMock,
    useApiMutation: useApiMutationMock,
  };
});

import { CurrentThemeScreen } from './theme/CurrentThemeScreen';
import { HelloWorldScreen } from './helloworld/HelloWorldScreen';
import { ProfileScreen } from './profile/ProfileScreen';
import { SettingsScreen } from './settings/SettingsScreen';
import { UIKitElementsScreen } from './uikit/UIKitElementsScreen';

const screens: Array<[string, React.FC<{ bridge: ChildMfeBridge }>]> = [
  ['HelloWorldScreen', HelloWorldScreen],
  ['ProfileScreen', ProfileScreen],
  ['SettingsScreen', SettingsScreen],
  ['CurrentThemeScreen', CurrentThemeScreen],
  ['UIKitElementsScreen', UIKitElementsScreen],
];

describe('demo-mfe screen loading roots', () => {
  it.each(screens)('%s keeps the cold loading frame as tall as the screen slot', (_name, Screen) => {
    useScreenTranslationsMock.mockReturnValue({ t: (key: string) => key, loading: true });
    apiRegistryMock.getService.mockReturnValue({
      getCurrentUser: { type: 'getCurrentUser' },
      updateProfile: { type: 'updateProfile' },
    });
    useApiQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    useApiMutationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false, error: null });

    const { bridge } = createMfeBridgeFixture({
      extDomainId: 'demo-domain',
      extensionId: 'loading-root-probe',
      initialProperties: {
        FRONTX_SHARED_PROPERTY_THEME: 'default',
        FRONTX_SHARED_PROPERTY_LANGUAGE: 'en',
      },
    });

    // Raised before the render, so the screen's mount effect has a host to
    // write its direction on, exactly as in the screens' own suites.
    mockShadowHost(HTMLDivElement);
    const { container, unmount } = render(<Screen bridge={bridge} />);

    const loadingRoot = container.firstElementChild as HTMLElement | null;
    expect(loadingRoot).toBeTruthy();
    expect(loadingRoot?.getAttribute('role')).toBe('status');
    expect(loadingRoot?.getAttribute('aria-busy')).toBe('true');
    expect(getComputedStyle(loadingRoot as HTMLElement).minHeight).toBe('100%');

    unmount();
  });
});
