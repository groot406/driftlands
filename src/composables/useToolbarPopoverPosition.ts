import { nextTick, onBeforeUnmount, ref, watch, type Ref, type CSSProperties } from 'vue';

interface ToolbarPopoverOptions {
  isOpen: Ref<boolean>;
  panel: Ref<HTMLElement | null>;
  width?: number;
  mobileWidth?: number;
  margin?: number;
  gap?: number;
}

export function useToolbarPopoverPosition({
  isOpen,
  panel,
  width = 320,
  mobileWidth = 300,
  margin = 12,
  gap = 11,
}: ToolbarPopoverOptions) {
  const style = ref<CSSProperties>({});

  function update() {
    const el = panel.value;
    if (!isOpen.value || !el || typeof window === 'undefined') {
      style.value = {};
      return;
    }

    const anchor = el.parentElement;
    if (!anchor) {
      return;
    }

    const anchorRect = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const preferredWidth = viewportWidth <= 640 ? mobileWidth : width;
    const panelWidth = Math.min(preferredWidth, Math.max(0, viewportWidth - margin * 2));
    const centeredLeft = anchorRect.left + anchorRect.width / 2 - panelWidth / 2;
    const left = Math.max(margin, Math.min(centeredLeft, viewportWidth - margin - panelWidth));
    const bottom = Math.max(margin, viewportHeight - anchorRect.top + gap);
    const maxHeight = Math.max(180, viewportHeight - bottom - margin);

    style.value = {
      left: `${left}px`,
      bottom: `${bottom}px`,
      width: `${panelWidth}px`,
      maxHeight: `${maxHeight}px`,
    };
  }

  async function updateAfterRender() {
    await nextTick();
    update();
  }

  watch(isOpen, (open) => {
    if (open) {
      void updateAfterRender();
    } else {
      style.value = {};
    }
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
  }

  onBeforeUnmount(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.removeEventListener('resize', update);
    window.removeEventListener('scroll', update, true);
  });

  return { popoverStyle: style, updatePopoverPosition: updateAfterRender };
}
