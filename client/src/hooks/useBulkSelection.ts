import { useState, useEffect } from 'react';

type HasId = { id: string };

export function useBulkSelection<T extends HasId>(items: T[]) {
  const [selected, setSelected] = useState(new Set<string>());

  // Drop ids no longer in the item list (e.g. after a bulk action refetch)
  useEffect(() => {
    if (selected.size === 0) return;
    const visibleIds = new Set(items.map((i) => i.id));
    const next = new Set([...selected].filter((id) => visibleIds.has(id)));
    if (next.size !== selected.size) setSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const someSelected = selected.size > 0 && !allSelected;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (allSelected || someSelected) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  };

  const clear = () => setSelected(new Set());

  return { selected, toggle, toggleAll, allSelected, someSelected, clear };
}
