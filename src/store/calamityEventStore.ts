import { computed, ref } from 'vue';
import type { CalamityEventMessage, CalamityKind } from '../shared/protocol.ts';

export interface CalamityEventReport {
  id: string;
  event: CalamityEventMessage;
  openedAt: number;
}

export interface CalamityWarningReport {
  event: CalamityEventMessage;
  receivedAt: number;
}

const currentCalamityReport = ref<CalamityEventReport | null>(null);
const currentCalamityWarning = ref<CalamityWarningReport | null>(null);

export const activeCalamityReport = computed(() => currentCalamityReport.value);
export const activeCalamityWarning = computed(() => currentCalamityWarning.value);

function shouldOpenReport(event: CalamityEventMessage) {
  if (event.title === 'Calamity unavailable') {
    return false;
  }

  return event.phase === 'warning'
    || event.phase === 'impact'
    || event.phase === 'averted'
    || event.phase === undefined;
}

export function openCalamityReport(event: CalamityEventMessage) {
  if (!shouldOpenReport(event)) {
    return;
  }

  const receivedAt = Date.now();
  if (event.phase === 'warning' && event.impactAt) {
    currentCalamityWarning.value = { event, receivedAt };
  } else if (
    event.phase === 'impact'
    || event.phase === 'averted'
    || event.phase === undefined
  ) {
    const warning = currentCalamityWarning.value;
    if (
      warning
      && warning.event.kind === event.kind
      && (warning.event.settlementId ?? null) === (event.settlementId ?? null)
    ) {
      currentCalamityWarning.value = null;
    }
  }

  currentCalamityReport.value = {
    id: `${event.kind}:${event.phase ?? 'impact'}:${event.timestamp ?? receivedAt}`,
    event,
    openedAt: receivedAt,
  };
}

export function closeCalamityReport() {
  currentCalamityReport.value = null;
}

export function reopenActiveCalamityWarning() {
  const warning = currentCalamityWarning.value;
  if (!warning) {
    return;
  }

  currentCalamityReport.value = {
    id: `${warning.event.kind}:${warning.event.phase ?? 'warning'}:${warning.event.timestamp ?? warning.receivedAt}`,
    event: warning.event,
    openedAt: warning.receivedAt,
  };
}

export function getCalamityDisplayName(kind: CalamityKind) {
  switch (kind) {
    case 'volcano_eruption':
      return 'Volcano Eruption';
    case 'lost_harvest':
      return 'Lost Harvest';
    case 'food_spoilage':
      return 'Food Spoilage';
    case 'forest_fire':
      return 'Forest Fire';
    case 'outbreak':
      return 'Fever Outbreak';
    case 'flood':
    default:
      return 'Flood';
  }
}

export function formatResourceLosses(losses: CalamityEventMessage['resourceLosses']) {
  if (!losses?.length) {
    return [];
  }

  return losses.map((loss) => `${loss.amount} ${loss.type.replaceAll('_', ' ')}`);
}
