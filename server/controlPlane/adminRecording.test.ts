import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { createServer, type Server } from 'node:http';
import express from 'express';
import { createControlPlaneRouter } from './routes.js';
import {
  isRecordingActive,
  resetRecordingControlForTests,
  setRecordingActive,
} from './recordingControl.js';

describe('Admin Recording Control API', () => {
  let server: Server | null = null;
  let origin = '';
  const originalAdminSecret = process.env.ADMIN_SECRET;

  beforeEach(async () => {
    resetRecordingControlForTests(true);
    process.env.ADMIN_SECRET = 'super-secret-admin-key';

    const app = express();
    app.use(express.json());
    app.use('/api', createControlPlaneRouter({} as any));

    server = createServer(app);
    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', () => {
        const addr = server!.address();
        if (addr && typeof addr === 'object') {
          origin = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    resetRecordingControlForTests(true);
    if (originalAdminSecret === undefined) {
      delete process.env.ADMIN_SECRET;
    } else {
      process.env.ADMIN_SECRET = originalAdminSecret;
    }
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
  });

  it('rejects GET /api/admin/recording without admin auth', async () => {
    const res = await fetch(`${origin}/api/admin/recording`);
    assert.equal(res.status, 401);
  });

  it('rejects GET /api/admin/recording with invalid admin secret', async () => {
    const res = await fetch(`${origin}/api/admin/recording`, {
      headers: { 'x-admin-secret': 'wrong-secret' },
    });
    assert.equal(res.status, 401);
  });

  it('allows GET /api/admin/recording with x-admin-secret header', async () => {
    const res = await fetch(`${origin}/api/admin/recording`, {
      headers: { 'x-admin-secret': 'super-secret-admin-key' },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { enabled: boolean };
    assert.equal(body.enabled, true);
  });

  it('allows GET /api/admin/recording with Bearer admin token', async () => {
    const res = await fetch(`${origin}/api/admin/recording`, {
      headers: { Authorization: 'Bearer super-secret-admin-key' },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { enabled: boolean };
    assert.equal(body.enabled, true);
  });

  it('rejects POST /api/admin/recording without admin auth', async () => {
    const res = await fetch(`${origin}/api/admin/recording`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(res.status, 401);
  });

  it('rejects POST /api/admin/recording with malformed body', async () => {
    const res = await fetch(`${origin}/api/admin/recording`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': 'super-secret-admin-key',
      },
      body: JSON.stringify({ invalidField: true }),
    });
    assert.equal(res.status, 400);
  });

  it('toggles recording state via POST /api/admin/recording', async () => {
    assert.equal(isRecordingActive(), true);

    const toggleOff = await fetch(`${origin}/api/admin/recording`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': 'super-secret-admin-key',
      },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(toggleOff.status, 200);
    const offBody = (await toggleOff.json()) as { enabled: boolean };
    assert.equal(offBody.enabled, false);
    assert.equal(isRecordingActive(), false);

    const toggleOn = await fetch(`${origin}/api/admin/recording`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': 'super-secret-admin-key',
      },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(toggleOn.status, 200);
    const onBody = (await toggleOn.json()) as { enabled: boolean };
    assert.equal(onBody.enabled, true);
    assert.equal(isRecordingActive(), true);
  });
});
