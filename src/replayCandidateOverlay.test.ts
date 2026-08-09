import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CellValue } from './types';
import { projectCandidatePlacement } from './replayCandidateOverlay';

function emptyBoard(): CellValue[][] {
  return Array.from({ length: 20 }, () => Array<CellValue>(10).fill(null));
}

describe('replay candidate overlay projection', () => {
  it('projects a candidate to its hard-drop landing cells', () => {
    const projection = projectCandidatePlacement(emptyBoard(), 'I', { rotation: 0, x: 0 });

    assert.deepEqual(projection.cells, [
      { x: 0, y: 17 },
      { x: 1, y: 17 },
      { x: 2, y: 17 },
      { x: 3, y: 17 },
    ]);
    assert.equal(projection.lineClearCount, 0);
  });

  it('reports a line clear so the replay UI can avoid a misleading outline', () => {
    const board = emptyBoard();
    board[19].fill('J');
    board[19][0] = null;
    board[19][1] = null;
    board[19][2] = null;
    board[19][3] = null;

    const projection = projectCandidatePlacement(board, 'I', { rotation: 0, x: 0 });

    assert.equal(projection.lineClearCount, 1);
  });

  it('applies the bomber blast before checking for line clears', () => {
    const board = emptyBoard();
    board[19].fill('J');

    const projection = projectCandidatePlacement(board, 'I', { rotation: 0, x: 0 }, true);

    assert.equal(projection.lineClearCount, 0);
  });
});
