import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameState } from '../types';

export const useGameSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myId, setMyId] = useState<string | null>(null);

  useEffect(() => {
    const newSocket = io(window.location.origin);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setMyId(newSocket.id || null);
    });

    newSocket.on('gameState', (state: GameState) => {
      // Deep clone so each tick is a new object graph. Socket.io can reuse the same
      // parsed reference across emits, which breaks prev-vs-next diffs for FX (flying text).
      setGameState(structuredClone(state) as GameState);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const setPaddleInput = useCallback((dir: number) => {
    socket?.emit('paddleInput', dir);
  }, [socket]);

  const shootBall = useCallback(() => {
    socket?.emit('shootBall');
  }, [socket]);

  return {
    socket,
    gameState,
    myId,
    setPaddleInput,
    shootBall
  };
};
