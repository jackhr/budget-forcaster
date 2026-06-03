import { useState } from 'react';

interface HasId { id: number }

// Minimal native drag-and-drop reordering for a list of {id} items.
// `sameBucket` restricts drops to items in the same group (cross-group moves use the editor).
export function useDnd<T extends HasId>(
  items: T[],
  onReorder: (ids: number[]) => void,
  sameBucket: (a: T, b: T) => boolean = () => true,
) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);

  function handlers(item: T) {
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        setDragId(item.id);
        e.dataTransfer.effectAllowed = 'move';
      },
      onDragOver: (e: React.DragEvent) => {
        const from = items.find((i) => i.id === dragId);
        if (from && sameBucket(from, item)) {
          e.preventDefault();
          if (overId !== item.id) setOverId(item.id);
        }
      },
      onDragLeave: () => {
        if (overId === item.id) setOverId(null);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const from = items.find((i) => i.id === dragId);
        setOverId(null);
        if (dragId == null || !from || dragId === item.id || !sameBucket(from, item)) {
          setDragId(null);
          return;
        }
        const ids = items.map((i) => i.id);
        const fi = ids.indexOf(dragId);
        const ti = ids.indexOf(item.id);
        ids.splice(ti, 0, ids.splice(fi, 1)[0]);
        onReorder(ids);
        setDragId(null);
      },
      onDragEnd: () => { setDragId(null); setOverId(null); },
    };
  }

  return { handlers, dragId, overId };
}
