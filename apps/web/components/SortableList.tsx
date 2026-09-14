"use client";

/**
 * Sürükle-bırak sıralama (Bölüm 4.1).
 *
 * **Neden dnd-kit, neden native HTML5 drag değil:** HTML5 drag-and-drop API'si
 * dokunmatik cihazlarda hiç çalışmıyor — `dragstart` sadece fare girdisinde
 * tetikleniyor. Bu uygulama öncelikle telefonda kullanılacağı için native API
 * baştan eleniyor.
 *
 * **Tutamak (handle) ayrı:** tüm satırı sürüklenebilir yapmak, telefonda
 * listeyi kaydırmayı imkânsız hâle getiriyor — her kaydırma denemesi sürükleme
 * başlatıyor. Sürükleme yalnızca tutamaktan başlıyor.
 *
 * **Klavye de çalışıyor:** tutamağa odaklanıp boşluk/ok tuşlarıyla sıralama
 * yapılabiliyor. Yalnızca sürüklemeye dayanan bir arayüz klavye ve ekran
 * okuyucu kullanıcılarına kapalı olurdu.
 */

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Props<T> {
  items: T[];
  /** Her öğe için kararlı bir kimlik. Dizin KULLANMA — sıralama sonrası çakışır. */
  getId: (item: T, index: number) => string;
  onReorder: (items: T[]) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  disabled?: boolean;
}

export function SortableList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  disabled = false,
}: Props<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // 6px eşik: dokunmatikte en ufak parmak titremesi sürükleme başlatmasın,
      // ama kasıtlı hareket de gecikmesin.
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = items.map(getId);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onReorder(arrayMove(items, from, to));
  }

  if (disabled) {
    return <>{items.map((item, index) => renderItem(item, index))}</>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {items.map((item, index) => (
          <SortableRow key={ids[index]} id={ids[index]!}>
            {renderItem(item, index)}
          </SortableRow>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        // Sürüklenen satır üstte kalsın ve hafifçe soluklaşsın — tek geri
        // bildirim bu; dekoratif gölge/ölçek yok (Bölüm 7).
        zIndex: isDragging ? 10 : undefined,
        opacity: isDragging ? 0.6 : 1,
        position: "relative",
      }}
      className="touch-none"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label="Sıralamak için sürükle"
          className="mt-0.5 grid size-9 shrink-0 cursor-grab place-items-center rounded-[3px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)] active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          {/* Altı nokta — evrensel sürükleme tutamağı işareti */}
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="currentColor">
            <circle cx="6" cy="4" r="1.2" />
            <circle cx="10" cy="4" r="1.2" />
            <circle cx="6" cy="8" r="1.2" />
            <circle cx="10" cy="8" r="1.2" />
            <circle cx="6" cy="12" r="1.2" />
            <circle cx="10" cy="12" r="1.2" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
