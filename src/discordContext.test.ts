import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { appendFrameId, buildAppUrl, openExternalUrl } from './discordContext';

describe('Discord Activity request context', () => {
  it('adds the frame id without dropping existing query parameters', () => {
    assert.equal(
      appendFrameId('https://activity.example/api/queue?retry=1', 'frame-123'),
      'https://activity.example/api/queue?retry=1&frame_id=frame-123',
    );
  });

  it('replaces an existing frame id and leaves missing ids unchanged', () => {
    assert.equal(
      appendFrameId('https://activity.example/api/queue?frame_id=old', 'frame-123'),
      'https://activity.example/api/queue?frame_id=frame-123',
    );
    assert.equal(
      appendFrameId('https://activity.example/api/queue', null),
      'https://activity.example/api/queue',
    );
  });

  it('preserves query parameters across page navigations', () => {
    assert.equal(
      buildAppUrl('/game/', '?frame_id=frame-123&guild_id=987'),
      '/game/?frame_id=frame-123&guild_id=987',
    );
    assert.equal(
      buildAppUrl('/', '?frame_id=frame-123&guild_id=987'),
      '/?frame_id=frame-123&guild_id=987',
    );
    assert.equal(
      buildAppUrl('/game/', ''),
      '/game/',
    );
    assert.equal(
      buildAppUrl('/game/?theme=seasalt', '?frame_id=frame-123'),
      '/game/?frame_id=frame-123&theme=seasalt',
    );
  });

  it('falls back to window.open on open web without throwing', async () => {
    let openedUrl = '';
    let openedTarget = '';
    const originalWindow = globalThis.window;
    const mockWin: any = {
      location: { hostname: 'shape-showdown.pages.dev', search: '' },
      open: (url: string, target?: string) => {
        openedUrl = url;
        openedTarget = target ?? '';
        return null;
      },
    };
    mockWin.parent = mockWin;
    // @ts-expect-error Mocking window for node test environment
    globalThis.window = mockWin;

    try {
      await openExternalUrl('https://example.com/test');
      assert.equal(openedUrl, 'https://example.com/test');
      assert.equal(openedTarget, '_blank');
    } finally {
      globalThis.window = originalWindow;
    }
  });
});

