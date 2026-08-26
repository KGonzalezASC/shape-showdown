import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getAppRoute, setAppRoute } from './appRoute';

describe('SPA AppRoute', () => {
  it('defaults to landing route when no hash or game pathname is present', () => {
    const originalWindow = globalThis.window;
    (globalThis as any).window = {
      location: { hostname: 'shape-showdown.pages.dev', pathname: '/', hash: '', search: '?frame_id=123' },
    };

    try {
      assert.equal(getAppRoute(), 'landing');
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('detects game route from hash (#game or #play)', () => {
    const originalWindow = globalThis.window;
    (globalThis as any).window = {
      location: { hostname: 'shape-showdown.pages.dev', pathname: '/', hash: '#game', search: '?frame_id=123' },
    };

    try {
      assert.equal(getAppRoute(), 'game');
    } finally {
      (globalThis as any).window = originalWindow;
    }

    (globalThis as any).window = {
      location: { hostname: 'shape-showdown.pages.dev', pathname: '/', hash: '#play', search: '' },
    };

    try {
      assert.equal(getAppRoute(), 'game');
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('detects game route from legacy /game pathname for direct-web backward compatibility', () => {
    const originalWindow = globalThis.window;
    (globalThis as any).window = {
      location: { hostname: 'shape-showdown.pages.dev', pathname: '/game/', hash: '', search: '' },
    };

    try {
      assert.equal(getAppRoute(), 'game');
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('updates location hash without changing search parameters when switching to game route', () => {
    const originalWindow = globalThis.window;
    const mockLocation: any = {
      hostname: '12345.discordsays.com',
      pathname: '/',
      hash: '',
      search: '?frame_id=frame-456&guild_id=guild-789',
      href: 'https://12345.discordsays.com/?frame_id=frame-456&guild_id=guild-789',
    };

    (globalThis as any).window = {
      location: mockLocation,
    };

    try {
      setAppRoute('game');
      assert.equal(mockLocation.hash, '#game');
      assert.equal(mockLocation.search, '?frame_id=frame-456&guild_id=guild-789');
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('clears hash without full page reload when switching back to landing route', () => {
    const originalWindow = globalThis.window;
    let pushedUrl = '';
    const mockLocation: any = {
      hostname: '12345.discordsays.com',
      pathname: '/',
      hash: '#game',
      search: '?frame_id=frame-456',
      href: 'https://12345.discordsays.com/?frame_id=frame-456#game',
    };

    (globalThis as any).window = {
      location: mockLocation,
      history: {
        pushState: (_state: any, _title: string, url: string) => {
          pushedUrl = url;
          mockLocation.href = url;
          mockLocation.hash = '';
        },
      },
      dispatchEvent: () => true,
    };

    try {
      setAppRoute('landing');
      assert.equal(pushedUrl, 'https://12345.discordsays.com/?frame_id=frame-456');
      assert.equal(mockLocation.hash, '');
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });
});
