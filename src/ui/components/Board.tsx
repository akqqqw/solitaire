import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BoardGameManager } from '../../game/BoardGame';
import type { BoardController } from '../../game/BoardScene';
import { getBoardAdapter } from '../../game/adapters/interactions';
import { presentBoard } from '../../game/view';
import { useGameStore } from '../../store/gameStore';
import type { BoardView } from '../../game/view/types';

export function Board() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<BoardGameManager | null>(null);
  const latestView = useRef<BoardView | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const session = useGameStore((s) => s.session);
  const gameState = useGameStore((s) => s.gameState);
  const selection = useGameStore((s) => s.selection);
  const hint = useGameStore((s) => s.hint);
  const settings = useGameStore((s) => s.settings);
  const gameId = session?.gameId ?? null;
  const adapter = gameId ? getBoardAdapter(gameId) : null;

  const hintSlotIds = useMemo(() => {
    if (!adapter || !gameState) return [];
    return adapter.hintSlotIds(gameState, hint);
  }, [adapter, gameState, hint]);

  const dropSlotIds = useMemo(() => {
    if (!adapter || !gameState || !selection) return [];
    return adapter.dropSlots(gameState, selection);
  }, [adapter, gameState, selection]);

  const view = useMemo(() => {
    if (!gameId || !gameState || size.width < 20 || size.height < 20) return null;
    return presentBoard(gameId, gameState, {
      width: size.width,
      height: size.height,
      selected: selection,
      hint,
      hintSlotIds,
      dropSlotIds,
      cardBack: settings.cardBack,
      animations: settings.animations,
    });
  }, [gameId, gameState, size, selection, hint, hintSlotIds, dropSlotIds, settings]);

  useLayoutEffect(() => {
    const element = hostRef.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      const next = {
        width: Math.max(0, Math.round(rect.width)),
        height: Math.max(0, Math.round(rect.height)),
      };
      setSize((previous) =>
        previous.width === next.width && previous.height === next.height ? previous : next,
      );
      managerRef.current?.resize(next.width, next.height);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener('orientationchange', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller: BoardController = {
      onClickCard: (cardId) => useGameStore.getState().handleCardClick(cardId),
      onDoubleClickCard: (cardId) => useGameStore.getState().handleCardDoubleClick(cardId),
      onSlotClick: (slotId) => useGameStore.getState().handleSlotClick(slotId),
      getDragCards: (cardId) => {
        const store = useGameStore.getState();
        const current = store.session;
        if (!current) return null;
        const boardAdapter = getBoardAdapter(current.gameId);
        if (store.selection?.cards.includes(cardId)) return store.selection.cards;
        return boardAdapter.selectCards(current.state, cardId)?.cards ?? null;
      },
      getDropSlots: (cards) => {
        const store = useGameStore.getState();
        const current = store.session;
        if (!current || !cards.length) return [];
        const boardAdapter = getBoardAdapter(current.gameId);
        const location = boardAdapter.locate(current.state, cards[0]);
        if (!location) return [];
        return boardAdapter.dropSlots(current.state, { cards, slot: location.slot });
      },
      onDrop: (cards, slotId) => useGameStore.getState().handleDrop(cards, slotId),
    };
    const manager = new BoardGameManager(canvas, controller);
    managerRef.current = manager;
    if (latestView.current) manager.render(latestView.current);
    return () => {
      manager.destroy();
      managerRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    latestView.current = view;
    if (view && managerRef.current) {
      managerRef.current.resize(view.width, view.height);
      managerRef.current.render(view);
    }
  }, [view]);

  return (
    <div className="board" ref={hostRef}>
      <div className="board-canvas" ref={canvasRef} />
      {!view ? <div className="board-loading">Готовим карты…</div> : null}
    </div>
  );
}
