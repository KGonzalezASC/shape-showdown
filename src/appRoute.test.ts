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
    const mockLocation = {
      hostname: '12345.discordsays.com',
      pathname: '/',
      hash: '',
      search: '?frame_id=frame-456&guild_id=guild-789',
      href: 'https://12345.discordsays.com/?frame_id=frame-456&guild_id=guild-789',
    };
    let pushedUrl = '';

    (globalThis as { window: unknown }).window = {
      location: mockLocation,
      history: {
        pushState: (_state: unknown, _title: string, url: string) => {
          pushedUrl = url;
          const next = new URL(url);
          mockLocation.href = next.toString();
          mockLocation.pathname = next.pathname;
          mockLocation.search = next.search;
          mockLocation.hash = next.hash;
        },
      },
      dispatchEvent: () => true,
    };

    try {
      setAppRoute('game');
      assert.equal(mockLocation.hash, '#game');
      assert.equal(mockLocation.search, '?frame_id=frame-456&guild_id=guild-789');
      assert.match(pushedUrl, /frame_id=frame-456/);
    } finally {
      (globalThis as { window: unknown }).window = originalWindow;
    }
  });

  it('clears hash without full page reload when switching back to landing route', () => {
    const originalWindow = globalThis.window;
    let pushedUrl = '';
    const mockLocation = {
      hostname: '12345.discordsays.com',
      pathname: '/',
      hash: '#game',
      search: '?frame_id=frame-456',
      href: 'https://12345.discordsays.com/?frame_id=frame-456#game',
    };

    (globalThis as { window: unknown }).window = {
      location: mockLocation,
      history: {
        pushState: (_state: unknown, _title: string, url: string) => {
          pushedUrl = url;
          const next = new URL(url);
          mockLocation.href = next.toString();
          mockLocation.pathname = next.pathname;
          mockLocation.search = next.search;
          mockLocation.hash = next.hash;
        },
      },
      dispatchEvent: () => true,
    };

    try {
      setAppRoute('landing');
      assert.equal(pushedUrl, 'https://12345.discordsays.com/?frame_id=frame-456');
      assert.equal(mockLocation.hash, '');
    } finally {
      (globalThis as { window: unknown }).window = originalWindow;
    }
  });

  it('rewrites a legacy /game/ pathname to / when returning to landing', () => {
    const originalWindow = globalThis.window;
    let pushedUrl = '';
    const mockLocation = {
      hostname: 'shape-showdown.pages.dev',
      pathname: '/game/',
      hash: '',
      search: '?frame_id=frame-456',
      href: 'https://shape-showdown.pages.dev/game/?frame_id=frame-456',
    };

    (globalThis as { window: unknown }).window = {
      location: mockLocation,
      history: {
        pushState: (_state: unknown, _title: string, url: string) => {
          pushedUrl = url;
          const next = new URL(url);
          mockLocation.href = next.toString();
          mockLocation.pathname = next.pathname;
          mockLocation.search = next.search;
          mockLocation.hash = next.hash;
        },
      },
      dispatchEvent: () => true,
    };

    try {
      assert.equal(getAppRoute(), 'game');
      setAppRoute('landing');
      assert.equal(mockLocation.pathname, '/');
      assert.equal(mockLocation.hash, '');
      assert.equal(mockLocation.search, '?frame_id=frame-456');
      assert.equal(pushedUrl, 'https://shape-showdown.pages.dev/?frame_id=frame-456');
      assert.equal(getAppRoute(), 'landing');
    } finally {
      (globalThis as { window: unknown }).window = originalWindow;
    }
  });

  it('rewrites /game/#game to / without a document reload', () => {
    const originalWindow = globalThis.window;
    const mockLocation = {
      hostname: 'shape-showdown.pages.dev',
      pathname: '/game/',
      hash: '#game',
      search: '',
      href: 'https://shape-showdown.pages.dev/game/#game',
    };

    (globalThis as { window: unknown }).window = {
      location: mockLocation,
      history: {
        pushState: (_state: unknown, _title: string, url: string) => {
          const next = new URL(url);
          mockLocation.href = next.toString();
          mockLocation.pathname = next.pathname;
          mockLocation.search = next.search;
          mockLocation.hash = next.hash;
        },
      },
      dispatchEvent: () => true,
    };

    try {
      setAppRoute('landing');
      assert.equal(mockLocation.pathname, '/');
      assert.equal(mockLocation.hash, '');
      assert.equal(getAppRoute(), 'landing');
    } finally {
      (globalThis as { window: unknown }).window = originalWindow;
    }
  });
});
