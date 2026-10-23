"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A right-click menu: a small card at the pointer. It closes the way a native
 * one does — Escape, a click anywhere else, scrolling, or the window losing
 * focus — and Escape stops there rather than also leaving the level.
 */

export interface MenuItem {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

export function Menu({
  x,
  y,
  title,
  items,
  onClose,
}: {
  x: number;
  y: number;
  /** What the menu acts on, named above the items. */
  title?: string;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Kept on screen: opened near the right or bottom edge, it flips inward.
  const [at, setAt] = useState({ x, y });
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setAt({
      x: Math.max(4, Math.min(x, window.innerWidth - box.width - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - box.height - 4)),
    });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as globalThis.Node)) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: at.x, top: at.y }}
      className="fixed z-50 min-w-[220px] max-w-[320px] overflow-hidden rounded-[8px] border border-border-gray bg-pure-white py-1 shadow-lift"
    >
      {title ? (
        <p className="truncate border-b border-border-gray px-3 pb-1.5 pt-1 text-[11.5px] text-faint">{title}</p>
      ) : null}
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            item.onClick?.();
            onClose();
          }}
          className={cn(
            "block w-full px-3 py-1.5 text-left text-[13px] text-ink",
            item.disabled ? "text-faint" : "cursor-pointer hover:bg-surface-container-low",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
