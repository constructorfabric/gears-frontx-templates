import { describe, expect, it } from 'vitest';
import { describeScreenCatalogue } from '@inbox-shared/test-support/describeScreenCatalogue';
import en from './en.json';
import { t } from '../test-support/translate';

describeScreenCatalogue({ describe, it, expect }, en, t, 'Dashboard');
