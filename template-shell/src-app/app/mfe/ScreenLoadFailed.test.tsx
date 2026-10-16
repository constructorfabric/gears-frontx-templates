import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { ScreenLoadFailed } from './ScreenLoadFailed';

describe('ScreenLoadFailed', () => {
  it('announces the failure as an alert with a level-two title, keeping the header the page one h1', () => {
    render(<ScreenLoadFailed onRetry={() => {}} />);

    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('heading', { level: 2 }).textContent).toBe('This screen could not be loaded');
    expect(within(alert).queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('calls onRetry from its Retry button', () => {
    const onRetry = vi.fn();
    render(<ScreenLoadFailed onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
