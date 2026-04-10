export interface DebugFlags {
    showChunkBounds: boolean;
    showVisibleTiles: boolean;
    showPickedTile: boolean;
    showCameraCenter: boolean;
    showDirtyChunks: boolean;
    showEntitySortOrder: boolean;
}

export const DEFAULT_DEBUG_FLAGS: DebugFlags = {
    showChunkBounds: false,
    showVisibleTiles: false,
    showPickedTile: false,
    showCameraCenter: false,
    showDirtyChunks: false,
    showEntitySortOrder: false,
};
