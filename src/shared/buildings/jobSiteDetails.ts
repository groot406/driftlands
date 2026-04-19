import type { ResourceAmount, ResourceType } from '../../core/types/Resource.ts';
import type { JobSiteSnapshot, JobSiteStatus } from '../../store/jobStore.ts';
import type { PressureState } from '../../store/settlementSupportStore.ts';
import type { BuildingDefinition } from './registry.ts';

export interface JobSiteStatusDescriptor {
    text: string;
    tone: 'ok' | 'warn' | 'danger';
}

export interface JobSiteAdviceContext {
    building: Pick<BuildingDefinition, 'key' | 'consumes' | 'produces' | 'jobSlots' | 'cycleMs'>;
    site: Pick<JobSiteSnapshot, 'status' | 'assignedWorkers' | 'slots'>;
    population: {
        current: number;
        max: number;
        beds: number;
        hungerMs: number;
        pressureState: PressureState;
        inactiveTileCount: number;
    };
    workforce: {
        availableWorkers: number;
        idleWorkers: number;
    };
    resourceInventory: Partial<Record<ResourceType, number>>;
    totalFreeStorage: number;
}

export interface JobSiteResourceGap {
    type: ResourceType;
    required: number;
    available: number;
    missing: number;
}

export function getJobSiteStatusDescriptor(status: JobSiteStatus): JobSiteStatusDescriptor {
    switch (status) {
        case 'offline':
            return {
                text: 'Offline — reconnect and restore support',
                tone: 'danger',
            };
        case 'paused':
            return {
                text: 'Paused — manually turned off',
                tone: 'warn',
            };
        case 'unstaffed':
            return {
                text: 'Unstaffed — waiting for an available settler',
                tone: 'warn',
            };
        case 'missing_input':
            return {
                text: 'Missing input — supply required resources',
                tone: 'warn',
            };
        case 'storage_full':
            return {
                text: 'Storage full — clear space in colony stores',
                tone: 'danger',
            };
        case 'depleted':
            return {
                text: 'Depleted — this vein has run dry',
                tone: 'danger',
            };
        case 'complete':
            return {
                text: 'Complete — no studies waiting',
                tone: 'ok',
            };
        case 'staffed':
        default:
            return {
                text: 'Staffed — production is running',
                tone: 'ok',
            };
    }
}

export function scaleResources(resources: ResourceAmount[] | undefined, multiplier: number): ResourceAmount[] {
    if (!resources?.length || multiplier <= 0) {
        return [];
    }

    return resources.map((resource) => ({
        type: resource.type,
        amount: resource.amount * multiplier,
    }));
}

export function getPerMinuteResources(resources: ResourceAmount[] | undefined, workers: number, cycleMs: number | undefined) {
    if (!resources?.length || workers <= 0 || !cycleMs || cycleMs <= 0) {
        return [];
    }

    const cyclesPerMinute = 60_000 / cycleMs;
    return scaleResources(resources, workers).map((resource) => ({
        type: resource.type,
        amount: Number((resource.amount * cyclesPerMinute).toFixed(1)),
    }));
}

export function getMissingInputResources(
    resources: ResourceAmount[] | undefined,
    workers: number,
    resourceInventory: Partial<Record<ResourceType, number>>,
): JobSiteResourceGap[] {
    return scaleResources(resources, workers)
        .map((resource) => {
            const available = Math.max(0, resourceInventory[resource.type] ?? 0);
            return {
                type: resource.type,
                required: resource.amount,
                available,
                missing: Math.max(0, resource.amount - available),
            };
        })
        .filter((resource) => resource.missing > 0);
}

export function formatResourceType(resourceType: ResourceType) {
    return resourceType.replace(/_/g, ' ');
}

function formatShortageList(shortages: JobSiteResourceGap[]) {
    return shortages.map((shortage) => `${shortage.missing} ${formatResourceType(shortage.type)}`).join(', ');
}

function pushAdvice(advice: string[], text: string) {
    if (!advice.includes(text)) {
        advice.push(text);
    }
}

export function getJobSiteAdvice(context: JobSiteAdviceContext) {
    const advice: string[] = [];
    const { building, site, population, workforce, resourceInventory, totalFreeStorage } = context;
    const shortages = getMissingInputResources(building.consumes, site.assignedWorkers, resourceInventory);
    const openSlots = Math.max(0, site.slots - site.assignedWorkers);
    const buildingProducesGrain = building.key === 'granary'
        || (building.produces ?? []).some((resource) => resource.type === 'grain');
    const buildingProducesFood = building.key === 'bakery'
        || building.key === 'dock'
        || (building.produces ?? []).some((resource) => resource.type === 'food');
    const buildingProducesStone = building.key === 'quarry'
        || (building.produces ?? []).some((resource) => resource.type === 'stone');
    const buildingProducesTools = building.key === 'workshop'
        || (building.produces ?? []).some((resource) => resource.type === 'tools');

    switch (site.status) {
        case 'offline':
            pushAdvice(advice, 'Reconnect this site to active settlement support before expecting any work from it.');
            if (population.pressureState !== 'stable' || population.inactiveTileCount > 0) {
                pushAdvice(advice, 'Build houses to raise support capacity, then restore inactive frontier tiles so the district comes back online.');
            }
            pushAdvice(advice, 'If this district sits too far from the current hearth, extend reach with watchtowers or found a new town center.');
            break;
        case 'paused':
            pushAdvice(advice, 'Turn this site back on when you want it competing for settlers again.');
            pushAdvice(advice, 'Paused sites free their workers immediately, which is useful when food or hauling needs the labor more.');
            break;
        case 'unstaffed':
            if (population.current >= population.max) {
                pushAdvice(advice, 'You are at town-center capacity, so another town center is needed before the colony can field more workers.');
            }
            if (population.current >= population.beds) {
                pushAdvice(advice, 'Build more houses to add beds so new settlers can grow into empty job slots.');
            }
            if (population.hungerMs > 0) {
                pushAdvice(advice, 'Stabilize food first, because starving colonies cannot grow into the extra workers this site needs.');
            }
            if (!advice.length || workforce.availableWorkers <= 0) {
                pushAdvice(advice, 'Every available settler is already spoken for, so grow population before expecting this site to staff itself.');
            }
            break;
        case 'missing_input':
            if (shortages.length) {
                pushAdvice(advice, `Stock ${formatShortageList(shortages)} in storage before the next cycle starts.`);
            }
            if (building.key === 'bakery') {
                pushAdvice(advice, 'Bakery output depends on staffed granaries upstream, so keep grain production online as well as storage stocked.');
            }
            pushAdvice(advice, 'Inputs can be drawn from any colony storage, so keep town centers and depots topped up instead of letting one site run dry.');
            break;
        case 'storage_full':
            pushAdvice(advice, 'Spend or relocate stock before the next cycle so workers have somewhere to drop the finished goods.');
            if (totalFreeStorage <= 0) {
                pushAdvice(advice, 'Build a supply depot to open more storage capacity close to the frontier.');
            } else {
                pushAdvice(advice, `Only ${totalFreeStorage} storage space is free across the colony, so this site is bottlenecked by logistics rather than labor.`);
            }
            if (buildingProducesGrain) {
                pushAdvice(advice, 'Granaries work best when bakeries or construction are consuming the stock fast enough to keep bins clear.');
            } else if (buildingProducesFood) {
                pushAdvice(advice, 'Food still needs empty storage, even if settlers will eat it soon, so keep some buffer space available.');
            } else if (buildingProducesStone) {
                pushAdvice(advice, 'Stone piles up quickly when no upgrades or roads are consuming it, so storage and spending both matter.');
            } else if (buildingProducesTools) {
                pushAdvice(advice, 'Tools are compact but precious, so keep workshop output moving into expansion and advanced upgrade projects.');
            }
            break;
        case 'depleted':
            pushAdvice(advice, 'This mountain cluster has been exhausted, so move mining crews to a fresh range.');
            pushAdvice(advice, 'Multiple mines on the same cluster share the same hidden reserve, so splitting crews does not create extra ore.');
            break;
        case 'staffed':
        default:
            if (openSlots > 0) {
                pushAdvice(advice, `Fill the remaining ${openSlots} open slot${openSlots === 1 ? '' : 's'} to raise output without building another copy of this site.`);
                if (population.current >= population.beds) {
                    pushAdvice(advice, 'More houses are the fastest way to unlock extra workers for the remaining staffing slots.');
                }
            } else if ((building.consumes?.length ?? 0) > 0) {
                pushAdvice(advice, 'Keep input stockpiles and storage space healthy so this site does not stall between completed cycles.');
            } else {
                pushAdvice(advice, 'This site only needs workers and storage room, so scaling it mostly comes down to staffing and logistics.');
            }

            if (building.key === 'bakery') {
                pushAdvice(advice, 'Scale grain production alongside bakeries so the ovens stay fed every cycle.');
            } else if (building.key === 'granary') {
                pushAdvice(advice, 'Granaries scale with the grain tile they sit on plus each adjacent active grain field, so dense farms pay off fast.');
            } else if (building.key === 'lumberCamp') {
                pushAdvice(advice, 'Lumber camps scale with their own forest tile plus adjacent active woods, so place them in thicker stands when you can.');
            } else if (building.key === 'quarry') {
                pushAdvice(advice, 'Quarries scale with their own mountain plus adjacent active ridge tiles, so broad mountain clusters produce the best stone flow.');
            } else if (building.key === 'dock') {
                pushAdvice(advice, 'Dock yield scales with adjacent active water, so broad shoreline coves make better fishing platforms than cramped inlets.');
            } else if (building.key === 'workshop') {
                pushAdvice(advice, 'Workshops are the ore sink: keep mines staffed so toolmaking does not starve.');
            }
            break;
    }

    return advice.slice(0, 3);
}
