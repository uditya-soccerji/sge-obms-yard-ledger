"use client";

import { useMemo, useRef, useState } from "react";

export function VirtualRows<T>({
  rows,
  rowHeight = 40,
  height = 420,
  render,
}: {
  rows: T[];
  rowHeight?: number;
  height?: number;
  render: (row: T, index: number) => React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const overscan = 8;
  const { start, end } = useMemo(() => {
    const s = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visible = Math.ceil(height / rowHeight) + overscan * 2;
    return { start: s, end: Math.min(rows.length, s + visible) };
  }, [scrollTop, rowHeight, height, rows.length]);

  return (
    <div
      ref={scroller}
      className="overflow-auto rounded-sm border border-[var(--sge-line)]"
      style={{ height }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: rows.length * rowHeight, position: "relative" }}>
        {rows.slice(start, end).map((row, i) => {
          const index = start + i;
          return (
            <div
              key={index}
              style={{
                position: "absolute",
                top: index * rowHeight,
                left: 0,
                right: 0,
                height: rowHeight,
              }}
            >
              {render(row, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
