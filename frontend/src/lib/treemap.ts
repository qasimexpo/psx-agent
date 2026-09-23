/**
 * Squarified treemap layout (Bruls, Huizing and van Wijk, 2000).
 *
 * Kept as a dependency-free pure function for two reasons: the map is rendered
 * on the server into static SVG, so shipping a layout library to the browser
 * would be waste, and a pure function of numbers is something that can be
 * checked by hand.
 *
 * "Squarified" means the algorithm prefers rectangles close to square rather
 * than the long slivers a naive slice-and-dice produces. That matters here
 * because a sliver cannot hold a ticker label, and a label is the whole point.
 */

export type Rect = { x: number; y: number; w: number; h: number };

export type Sized<T> = { value: number; item: T };

export type Tile<T> = Rect & { item: T };

/** Lays out `items` inside `rect`, areas proportional to their values. */
export function treemap<T>(items: Sized<T>[], rect: Rect): Tile<T>[] {
  const positive = items.filter((entry) => entry.value > 0);
  if (positive.length === 0 || rect.w <= 0 || rect.h <= 0) return [];

  // Descending order is what makes the result squarish; the algorithm is
  // defined on sorted input.
  const sorted = [...positive].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((sum, entry) => sum + entry.value, 0);
  const scale = (rect.w * rect.h) / total;

  const out: Tile<T>[] = [];
  let free: Rect = { ...rect };
  let row: Sized<T>[] = [];
  let index = 0;

  const areaOf = (entry: Sized<T>) => entry.value * scale;
  const rowArea = (entries: Sized<T>[]) => entries.reduce((sum, e) => sum + areaOf(e), 0);

  /** The worst aspect ratio in `entries` if laid along a side of `length`. */
  const worst = (entries: Sized<T>[], length: number): number => {
    if (entries.length === 0 || length <= 0) return Infinity;
    const area = rowArea(entries);
    const breadth = area / length;
    if (breadth <= 0) return Infinity;
    let ratio = 0;
    for (const entry of entries) {
      const side = areaOf(entry) / breadth;
      ratio = Math.max(ratio, Math.max(side / breadth, breadth / side));
    }
    return ratio;
  };

  /** Places a finished row along the shorter side and shrinks the free space. */
  const place = (entries: Sized<T>[]): void => {
    const horizontal = free.w >= free.h;
    const length = horizontal ? free.h : free.w;
    const breadth = rowArea(entries) / length;
    let offset = horizontal ? free.y : free.x;

    for (const entry of entries) {
      const side = areaOf(entry) / breadth;
      out.push(
        horizontal
          ? { x: free.x, y: offset, w: breadth, h: side, item: entry.item }
          : { x: offset, y: free.y, w: side, h: breadth, item: entry.item },
      );
      offset += side;
    }

    free = horizontal
      ? { x: free.x + breadth, y: free.y, w: Math.max(0, free.w - breadth), h: free.h }
      : { x: free.x, y: free.y + breadth, w: free.w, h: Math.max(0, free.h - breadth) };
  };

  while (index < sorted.length) {
    const length = Math.min(free.w, free.h);
    const next = sorted[index];
    // Keep adding to the row while doing so makes the shapes no worse.
    if (row.length === 0 || worst([...row, next], length) <= worst(row, length)) {
      row.push(next);
      index += 1;
    } else {
      place(row);
      row = [];
    }
  }
  if (row.length > 0) place(row);

  return out;
}

/** Shrinks a rectangle on every side, for the gap between tiles. */
export function inset(rect: Rect, by: number, top = by): Rect {
  return {
    x: rect.x + by,
    y: rect.y + top,
    w: Math.max(0, rect.w - by * 2),
    h: Math.max(0, rect.h - by - top),
  };
}
