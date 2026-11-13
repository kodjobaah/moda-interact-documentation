import { describe, expect, it, vi } from 'vitest';
import type { FrameLocator, Page } from 'playwright';
import type { CaptureAction } from '../config/capture-targets.js';
import { runAction } from '../src/capture/runner.js';

describe('capture action timeout forwarding', () => {
  for (const type of ['click', 'waitFor', 'scrollIntoView', 'selectOption'] as const) {
    for (const timeoutMs of [undefined, 0, 1200]) {
      it(`${type} ${timeoutMs === undefined ? 'leaves the browser default intact' : `preserves timeout ${timeoutMs}`}`, async () => {
        const method = type === 'scrollIntoView' ? 'scrollIntoViewIfNeeded' : type;
        const call = vi.fn().mockResolvedValue(undefined);
        const locator = { [method]: call };
        const page = { locator: vi.fn().mockReturnValue(locator) } as unknown as Page;
        const action = {
          type,
          locator: '#synthetic',
          ...(type === 'selectOption' ? { value: 'synthetic' } : {}),
          ...(timeoutMs === undefined ? {} : { timeoutMs }),
        } as CaptureAction;

        await runAction(page, undefined, action);

        const options = {
          ...(type === 'waitFor' ? { state: 'visible' } : {}),
          ...(timeoutMs === undefined ? {} : { timeout: timeoutMs }),
        };
        expect(page.locator).toHaveBeenCalledWith('#synthetic');
        expect(call).toHaveBeenCalledExactlyOnceWith(
          ...(type === 'selectOption' ? ['synthetic', options] : [options]),
        );
        expect(Object.hasOwn(options, 'timeout')).toBe(timeoutMs !== undefined);
      });
    }
  }

  it('retains frame scoping and first-match selection', async () => {
    const click = vi.fn().mockResolvedValue(undefined);
    const first = vi.fn().mockReturnValue({ click });
    const frame = { locator: vi.fn().mockReturnValue({ first }) } as unknown as FrameLocator;
    const page = { locator: vi.fn() } as unknown as Page;

    await runAction(page, frame, { type: 'click', locator: '.synthetic', first: true });

    expect(frame.locator).toHaveBeenCalledWith('.synthetic');
    expect(first).toHaveBeenCalledExactlyOnceWith();
    expect(click).toHaveBeenCalledExactlyOnceWith({});
    expect(page.locator).not.toHaveBeenCalled();
  });
});
