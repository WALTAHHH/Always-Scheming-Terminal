"use client";

import { useState, ReactNode } from "react";
import { useSwipeable } from "react-swipeable";

interface Panel {
  id: string;
  label: string;
  color: string;
  content: ReactNode;
}

interface MobileSwipeViewProps {
  panels: Panel[];
  initialIndex?: number;
}

export function MobileSwipeView({ panels, initialIndex = 0 }: MobileSwipeViewProps) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [offsetX, setOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const handlers = useSwipeable({
    onSwiping: (e) => {
      setIsSwiping(true);
      // Limit the drag distance and add resistance at edges
      const maxDrag = 100;
      let delta = e.deltaX;
      
      // Add resistance at edges
      if ((activeIndex === 0 && delta > 0) || (activeIndex === panels.length - 1 && delta < 0)) {
        delta = delta * 0.3;
      }
      
      setOffsetX(Math.max(-maxDrag, Math.min(maxDrag, delta)));
    },
    onSwipedLeft: () => {
      setIsSwiping(false);
      setOffsetX(0);
      if (activeIndex < panels.length - 1) {
        setActiveIndex(activeIndex + 1);
      }
    },
    onSwipedRight: () => {
      setIsSwiping(false);
      setOffsetX(0);
      if (activeIndex > 0) {
        setActiveIndex(activeIndex - 1);
      }
    },
    onTouchEndOrOnMouseUp: () => {
      setIsSwiping(false);
      setOffsetX(0);
    },
    trackMouse: false,
    trackTouch: true,
    delta: 30,
    preventScrollOnSwipe: true,
  });

  return (
    <div className="flex flex-col h-full">
      {/* Panel tabs */}
      <div className="flex border-b border-ast-border bg-ast-surface/50">
        {panels.map((panel, idx) => (
          <button
            key={panel.id}
            onClick={() => setActiveIndex(idx)}
            className={`flex-1 py-2 text-xs font-medium transition-colors border-b-2 ${
              idx === activeIndex
                ? `border-current text-${panel.color}`
                : "border-transparent text-ast-muted hover:text-ast-text"
            }`}
            style={idx === activeIndex ? { color: `var(--${panel.color})` } : undefined}
          >
            {panel.label}
          </button>
        ))}
      </div>

      {/* Swipeable content area */}
      <div {...handlers} className="flex-1 overflow-hidden relative">
        <div
          className="absolute inset-0 flex transition-transform"
          style={{
            transform: `translateX(calc(-${activeIndex * 100}% + ${offsetX}px))`,
            transitionDuration: isSwiping ? "0ms" : "300ms",
            transitionTimingFunction: "ease-out",
          }}
        >
          {panels.map((panel) => (
            <div
              key={panel.id}
              className="w-full h-full flex-shrink-0 overflow-y-auto"
            >
              {panel.content}
            </div>
          ))}
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-2 py-2 bg-ast-surface border-t border-ast-border">
        {panels.map((panel, idx) => (
          <button
            key={panel.id}
            onClick={() => setActiveIndex(idx)}
            className={`w-2 h-2 rounded-full transition-all ${
              idx === activeIndex
                ? "w-4 bg-ast-accent"
                : "bg-ast-muted/30 hover:bg-ast-muted/50"
            }`}
            aria-label={`Go to ${panel.label}`}
          />
        ))}
      </div>
    </div>
  );
}
