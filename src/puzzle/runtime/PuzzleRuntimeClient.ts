/**
 * Typed browser client adapter for communicating with the puzzle Web Worker.
 * Handles worker lifecycle, message routing, and page visibility / window focus boundaries.
 */
import type {
  PuzzleActionV1,
  PuzzleInputStateV1,
  PublishedPuzzleV1,
} from '../publishedPuzzle.js';
import type { PuzzleRuntimeSnapshot } from './PuzzleRuntime.js';
import {
  isPuzzleWorkerEvent,
  type PuzzleWorkerEvent,
  type PuzzleWorkerRequest,
} from './puzzleWorkerProtocol.js';

export interface PuzzleRuntimeClientOptions {
  /** Optional custom worker instance (useful in tests). */
  worker?: Worker;
}

export type FinishedEventListener = (
  event: Extract<PuzzleWorkerEvent, { type: 'finished' }>,
) => void;

export class PuzzleRuntimeClient {
  private worker: Worker | null = null;
  private disposed = false;
  private hasLoadedPuzzle = false;

  private readonly snapshotListeners = new Set<(snapshot: PuzzleRuntimeSnapshot) => void>();
  private readonly finishedListeners = new Set<FinishedEventListener>();
  private readonly errorListeners = new Set<(error: { message: string; code?: string }) => void>();
  private readonly readyListeners = new Set<(puzzleId: string, snapshot: PuzzleRuntimeSnapshot) => void>();

  private loadPromiseResolver: ((snapshot: PuzzleRuntimeSnapshot) => void) | null = null;
  private loadPromiseRejecter: ((reason: Error) => void) | null = null;

  constructor(options?: PuzzleRuntimeClientOptions) {
    if (options?.worker) {
      this.worker = options.worker;
    } else if (typeof Worker !== 'undefined') {
      this.worker = new Worker(new URL('./puzzleRuntime.worker.ts', import.meta.url), {
        type: 'module',
      });
    }

    if (this.worker) {
      this.worker.addEventListener('message', this.handleWorkerMessage);
      this.worker.addEventListener('error', this.handleWorkerError);
    }

    this.attachWindowListeners();
  }

  private handleWorkerMessage = (event: MessageEvent<unknown>): void => {
    if (this.disposed || !isPuzzleWorkerEvent(event.data)) return;
    const data: PuzzleWorkerEvent = event.data;

    switch (data.type) {
      case 'ready':
        this.hasLoadedPuzzle = true;
        if (this.loadPromiseResolver) {
          this.loadPromiseResolver(data.initialSnapshot);
          this.loadPromiseResolver = null;
          this.loadPromiseRejecter = null;
        }
        for (const listener of this.readyListeners) {
          listener(data.puzzleId, data.initialSnapshot);
        }
        break;

      case 'snapshot':
        for (const listener of this.snapshotListeners) {
          listener(data.snapshot);
        }
        break;

      case 'finished':
        for (const listener of this.finishedListeners) {
          listener(data);
        }
        break;

      case 'error':
        if (this.loadPromiseRejecter) {
          this.loadPromiseRejecter(new Error(data.message));
          this.loadPromiseResolver = null;
          this.loadPromiseRejecter = null;
        }
        for (const listener of this.errorListeners) {
          listener({ message: data.message, code: data.code });
        }
        break;
    }
  };

  private handleWorkerError = (event: ErrorEvent): void => {
    if (this.disposed) return;
    const message = event.message || 'Unknown Web Worker error';
    if (this.loadPromiseRejecter) {
      this.loadPromiseRejecter(new Error(message));
      this.loadPromiseResolver = null;
      this.loadPromiseRejecter = null;
    }
    for (const listener of this.errorListeners) {
      listener({ message, code: 'WORKER_INTERNAL_ERROR' });
    }
  };

  private attachWindowListeners(): void {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', this.onWindowBlur);
      window.addEventListener('focus', this.onWindowFocus);
    }
  }

  private detachWindowListeners(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('blur', this.onWindowBlur);
      window.removeEventListener('focus', this.onWindowFocus);
    }
  }

  private onVisibilityChange = (): void => {
    if (this.disposed || !this.hasLoadedPuzzle) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      this.setInput({ left: false, right: false, softDrop: false });
      this.pause();
    } else if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      this.setInput({ left: false, right: false, softDrop: false });
      this.resume();
    }
  };

  private onWindowBlur = (): void => {
    if (this.disposed || !this.hasLoadedPuzzle) return;
    this.setInput({ left: false, right: false, softDrop: false });
    this.pause();
  };

  private onWindowFocus = (): void => {
    if (this.disposed || !this.hasLoadedPuzzle) return;
    this.setInput({ left: false, right: false, softDrop: false });
    this.resume();
  };

  private postRequest(request: PuzzleWorkerRequest): void {
    if (this.disposed || !this.worker) return;
    this.worker.postMessage(request);
  }

  public async load(
    puzzle: PublishedPuzzleV1,
    attemptGrantId?: string | null,
  ): Promise<PuzzleRuntimeSnapshot> {
    if (this.disposed) {
      throw new Error('Cannot load puzzle on a disposed PuzzleRuntimeClient');
    }
    return new Promise<PuzzleRuntimeSnapshot>((resolve, reject) => {
      this.loadPromiseResolver = resolve;
      this.loadPromiseRejecter = reject;
      this.postRequest({
        type: 'load',
        puzzle,
        attemptGrantId: attemptGrantId ?? null,
      });
    });
  }

  public setInput(inputState: PuzzleInputStateV1): void {
    this.postRequest({
      type: 'input',
      inputState: {
        left: !!inputState.left,
        right: !!inputState.right,
        softDrop: !!inputState.softDrop,
      },
    });
  }

  public sendAction(action: PuzzleActionV1): void {
    this.postRequest({
      type: 'action',
      action,
    });
  }

  public pause(): void {
    this.postRequest({ type: 'pause' });
  }

  public resume(): void {
    this.postRequest({ type: 'resume' });
  }

  public restart(): void {
    this.postRequest({ type: 'restart' });
  }

  public onSnapshot(listener: (snapshot: PuzzleRuntimeSnapshot) => void): () => void {
    this.snapshotListeners.add(listener);
    return () => {
      this.snapshotListeners.delete(listener);
    };
  }

  public onFinished(listener: FinishedEventListener): () => void {
    this.finishedListeners.add(listener);
    return () => {
      this.finishedListeners.delete(listener);
    };
  }

  public onError(listener: (error: { message: string; code?: string }) => void): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  public onReady(
    listener: (puzzleId: string, initialSnapshot: PuzzleRuntimeSnapshot) => void,
  ): () => void {
    this.readyListeners.add(listener);
    return () => {
      this.readyListeners.delete(listener);
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hasLoadedPuzzle = false;
    this.detachWindowListeners();

    if (this.worker) {
      this.postRequest({ type: 'dispose' });
      this.worker.removeEventListener('message', this.handleWorkerMessage);
      this.worker.removeEventListener('error', this.handleWorkerError);
      this.worker.terminate();
      this.worker = null;
    }

    this.snapshotListeners.clear();
    this.finishedListeners.clear();
    this.errorListeners.clear();
    this.readyListeners.clear();

    if (this.loadPromiseRejecter) {
      this.loadPromiseRejecter(new Error('PuzzleRuntimeClient was disposed before load resolved'));
      this.loadPromiseResolver = null;
      this.loadPromiseRejecter = null;
    }
  }
}
