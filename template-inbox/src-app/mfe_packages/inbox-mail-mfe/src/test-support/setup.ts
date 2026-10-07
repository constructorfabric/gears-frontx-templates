/**
 * This package's Vitest setup: the inbox packages' shared platform and
 * per-test resets (`@inbox-shared/test-support/setup`), with this package's
 * mock backend put back to its seed after each test.
 */
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { resetMailMockState } from '../api/mailMockStore';
import { registerInboxTestSetup } from '@inbox-shared/test-support/setup';

registerInboxTestSetup({ afterEach, vi, cleanup, resetMockState: resetMailMockState });
