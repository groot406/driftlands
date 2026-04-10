import type { EntityRenderItem } from '../RenderTypes';

export class EntitySortService {
    static compare(a: EntityRenderItem, b: EntityRenderItem) {
        if (a.sortY !== b.sortY) {
            return a.sortY - b.sortY;
        }
        if (a.sortX !== b.sortX) {
            return a.sortX - b.sortX;
        }
        if (a.layer !== b.layer) {
            return a.layer - b.layer;
        }
        if (a.r !== b.r) {
            return a.r - b.r;
        }
        if (a.q !== b.q) {
            return a.q - b.q;
        }
        return a.entityId.localeCompare(b.entityId);
    }

    static sort(items: readonly EntityRenderItem[]) {
        return [...items].sort((left, right) => this.compare(left, right));
    }
}
