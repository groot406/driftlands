import type { SettlerBlockerReason } from '../../core/types/Settler.ts';

export function formatSettlerBlocker(reason: SettlerBlockerReason | null | undefined) {
    if (!reason) {
        return null;
    }

    const resourceLabel = reason.resourceType?.replace(/_/g, ' ') ?? 'resources';
    const amountLabel = typeof reason.amount === 'number' && reason.amount > 0
        ? `${reason.amount} `
        : '';

    switch (reason.code) {
        case 'missing_input':
            return `Waiting: needs ${amountLabel}${resourceLabel}`;
        case 'missing_repair_material':
            return `Waiting: needs ${amountLabel}${resourceLabel} for repairs`;
        case 'storage_full':
            return `Waiting: storage full for ${resourceLabel}`;
        case 'path_blocked':
            return 'Waiting: no reachable path';
        case 'site_offline':
            return 'Waiting: work site is offline';
        case 'site_paused':
            return 'Waiting: work site is paused';
        case 'resource_depleted':
            return 'Waiting: resource depleted';
        case 'no_work':
            return 'Waiting: no active work';
        default:
            return 'Waiting: blocked';
    }
}
