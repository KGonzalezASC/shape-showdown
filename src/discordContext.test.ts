import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { appendFrameId } from './discordContext';

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
});
