<template>
  <transition name="smooth-modal" appear>
    <div
      v-if="visible"
      class="tc-overlay smooth-modal-backdrop"
      :class="{ 'tc-overlay-standalone': detailOnlyMode }"
      @pointerdown.stop
      @pointerup.stop
      @click.self="close"
    >
      <div v-if="!detailOnlyMode" class="tc-panel smooth-modal-surface">
        <div class="tc-header">
          <div class="tc-header-copy">
            <p class="tc-kicker pixel-font">Settlement</p>
            <h3 class="tc-title">Town Center</h3>
          </div>
          <button class="tc-close" @click.stop.prevent="close" title="Close">
            &#x2715;
          </button>
        </div>

        <div class="tc-section tc-section-progress">
          <div class="tc-section-row">
            <div class="tc-section-title">Colony Progress</div>
          </div>
          <div class="tc-stat-grid">
            <div class="tc-stat">
              <span class="tc-stat-value">{{ populationState.current }}</span>
              <span class="tc-stat-label">Population</span>
            </div>
            <div class="tc-stat">
              <span class="tc-stat-value">{{ exploredTiles }}</span>
              <span class="tc-stat-label">Explored Tiles</span>
            </div>
          </div>
        </div>

        <!-- Population Section -->
        <div class="tc-section tc-section-housing">
          <div class="tc-section-row">
            <div class="tc-section-title">Housing</div>
          </div>
          <div class="tc-stat-grid tc-stat-grid-3">
            <div class="tc-stat">
              <span class="tc-stat-value">{{ populationState.current }}</span>
              <span class="tc-stat-label">Settlers</span>
            </div>
            <div class="tc-stat">
              <span class="tc-stat-value">{{ populationState.beds }}</span>
              <span class="tc-stat-label">Beds</span>
            </div>
            <div class="tc-stat">
              <span class="tc-stat-value">{{ populationState.max }}</span>
              <span class="tc-stat-label">Capacity</span>
            </div>
          </div>
          <div class="tc-status-row" :class="populationStatusClass">
            <span class="tc-status-dot" :class="populationStatusClass" />
            <span class="tc-status-text">{{ populationStatusText }}</span>
          </div>
        </div>

        <div class="tc-section tc-section-support">
          <div class="tc-section-row">
            <div class="tc-section-title">Frontier Support</div>
          </div>
          <div class="tc-stat-grid tc-stat-grid-3">
            <div class="tc-stat">
              <span class="tc-stat-value">{{ populationState.activeTileCount }}/{{ ownedTiles }}</span>
              <span class="tc-stat-label">Active / Owned</span>
            </div>
            <div class="tc-stat">
              <span class="tc-stat-value">{{ populationState.supportCapacity }}</span>
              <span class="tc-stat-label">Support Capacity</span>
            </div>
            <div class="tc-stat">
              <span class="tc-stat-value">{{ populationState.inactiveTileCount }}</span>
              <span class="tc-stat-label">Inactive Tiles</span>
            </div>
          </div>
          <div class="tc-status-row" :class="supportStatusClass">
            <span class="tc-status-dot" :class="supportStatusClass" />
            <span class="tc-status-text">{{ supportStatusText }}</span>
          </div>
        </div>

        <!-- Food Section -->
        <div class="tc-section tc-section-food">
          <div class="tc-section-row">
            <div class="tc-section-title">Food Supply</div>
          </div>
          <div class="tc-stat-grid">
            <div class="tc-stat">
              <span class="tc-stat-value">{{ foodStock }}</span>
              <span class="tc-stat-label">Rations</span>
            </div>
            <div class="tc-stat">
              <span class="tc-stat-value">{{ foodPerMinute }}</span>
              <span class="tc-stat-label">Per minute</span>
            </div>
          </div>
          <div class="tc-food-bar-track">
            <div class="tc-food-bar-fill" :style="{ width: foodBarPercent + '%' }" :class="foodBarClass" />
          </div>
          <div class="tc-status-row" :class="foodStatusClass">
            <span class="tc-status-dot" :class="foodStatusClass" />
            <span class="tc-status-text">{{ foodStatusText }}</span>
          </div>
        </div>

        <div v-if="maintenanceSummary.maintainedCount > 0" class="tc-section tc-section-maintenance">
          <div class="tc-section-row">
            <div class="tc-section-title">Maintenance</div>
            <div class="tc-section-caption">{{ maintenanceSummary.assignedRepairers }}/{{ maintenanceSummary.crewDemand }} crews assigned</div>
          </div>
          <div class="tc-stat-grid tc-stat-grid-4">
            <div class="tc-stat">
              <span class="tc-stat-value">{{ maintenanceSummary.maintainedCount }}</span>
              <span class="tc-stat-label">Maintained</span>
            </div>
            <div class="tc-stat">
              <span class="tc-stat-value">{{ maintenanceSummary.needsRepairCount }}</span>
              <span class="tc-stat-label">Needs Repair</span>
            </div>
            <div class="tc-stat">
              <span class="tc-stat-value">{{ maintenanceSummary.offlineCount }}</span>
              <span class="tc-stat-label">Offline</span>
            </div>
            <div class="tc-stat">
              <span class="tc-stat-value">{{ maintenanceSummary.averageCondition }}%</span>
              <span class="tc-stat-label">Avg Condition</span>
            </div>
          </div>
          <div class="tc-status-row" :class="maintenanceStatusClass">
            <span class="tc-status-dot" :class="maintenanceStatusClass" />
            <span class="tc-status-text">{{ maintenanceSummary.statusText }}</span>
          </div>
          <div v-if="maintenanceSummary.backlogResources.length" class="tc-detail-chip-row tc-maintenance-chip-row">
            <span
              v-for="resource in maintenanceSummary.backlogResources"
              :key="resource.type"
              class="tc-detail-chip"
              :class="{ 'tc-detail-chip-alert': resource.shortfall > 0 }"
            >
              {{ formatMaintenanceBacklog(resource) }}
            </span>
          </div>
          <div v-if="maintenanceSummary.urgentSites.length" class="tc-maintenance-list">
            <div v-for="site in maintenanceSummary.urgentSites" :key="site.tileId" class="tc-maintenance-site">
              <div class="tc-maintenance-site-top">
                <span class="tc-maintenance-site-name">{{ site.label }}</span>
                <span class="tc-maintenance-site-state" :class="getStatusClassFromTone(getConditionTone(site.conditionState))">
                  {{ getConditionLabel(site.conditionState) }}
                </span>
              </div>
              <div class="tc-maintenance-bar-track">
                <div class="tc-maintenance-bar-fill" :class="getConditionFillClass(site.conditionState)" :style="{ width: `${site.condition}%` }" />
              </div>
            </div>
          </div>
        </div>

        <!-- Job Sites Section (placeholder) -->
        <div class="tc-section tc-section-jobs">
          <div class="tc-section-row">
            <div class="tc-section-title">Job Sites</div>
            <div class="tc-section-caption">{{ workforceState.assignedWorkers }}/{{ workforceState.availableWorkers }} staffed</div>
          </div>
          <div class="tc-stat-grid tc-stat-grid-3">
            <div class="tc-stat">
              <span class="tc-stat-value">{{ workforceState.availableWorkers }}</span>
              <span class="tc-stat-label">Available</span>
            </div>
            <div class="tc-stat">
              <span class="tc-stat-value">{{ workforceState.assignedWorkers }}</span>
              <span class="tc-stat-label">Assigned</span>
            </div>
            <div class="tc-stat">
              <span class="tc-stat-value">{{ workforceState.idleWorkers }}</span>
              <span class="tc-stat-label">Idle</span>
            </div>
          </div>
          <div class="tc-status-row" :class="jobsStatusClass">
            <span class="tc-status-dot" :class="jobsStatusClass" />
            <span class="tc-status-text">{{ jobsStatusText }}</span>
          </div>
          <div v-if="jobSites.length" class="tc-job-list">
            <div
              v-for="site in jobSites"
              :key="site.tileId"
              class="tc-job-site"
              :class="{ 'tc-job-site-clickable': site.hasDetail }"
              :tabindex="site.hasDetail ? 0 : -1"
              :role="site.hasDetail ? 'button' : undefined"
              @click="openJobSiteDetail(site.tileId)"
              @keydown.enter.prevent="openJobSiteDetail(site.tileId)"
              @keydown.space.prevent="openJobSiteDetail(site.tileId)"
            >
              <div class="tc-job-site-top">
                <div>
                  <div class="tc-job-site-name">{{ site.label }}</div>
                  <div class="tc-job-site-meta">{{ site.summary }}</div>
                </div>
                <div class="tc-job-site-aside">
                  <div class="tc-job-site-staff">{{ site.assignedWorkers }}/{{ site.slots }}</div>
                  <div v-if="site.hasDetail" class="tc-job-site-open">Inspect</div>
                </div>
              </div>
              <div v-if="site.conditionPercent !== null" class="tc-job-site-condition">
                <div class="tc-job-site-condition-top">
                  <span class="tc-job-site-condition-label">{{ site.conditionLabel }}</span>
                  <span class="tc-job-site-condition-value">{{ site.conditionPercent }}%</span>
                </div>
                <div class="tc-maintenance-bar-track tc-maintenance-bar-track-compact">
                  <div class="tc-maintenance-bar-fill" :class="site.conditionBarClass" :style="{ width: `${site.conditionPercent}%` }" />
                </div>
              </div>
              <div class="tc-job-site-status" :class="site.statusClass">{{ site.statusText }}</div>
              <div v-if="site.blockerText" class="tc-job-site-blocker">{{ site.blockerText }}</div>
            </div>
          </div>
          <p v-else class="tc-placeholder-text">Build a dock, granary, bakery, lumber camp, library, or mine to create settler jobs.</p>
        </div>
      </div>

      <div
        v-if="selectedJobSiteDetail"
        class="tc-detail-backdrop smooth-modal-backdrop"
        :class="{ 'tc-detail-backdrop-standalone': detailOnlyMode }"
        @click.self="closeJobSiteDetail"
      >
        <div class="tc-detail-modal smooth-modal-surface" @click.stop>
            <div class="tc-detail-header">
              <div>
                <p class="tc-detail-kicker pixel-font">{{ selectedJobSiteDetail.detailKicker }}</p>
                <h4 class="tc-detail-title">{{ selectedJobSiteDetail.label }}</h4>
                <p class="tc-detail-summary">{{ selectedJobSiteDetail.summary }}</p>
              </div>
              <button class="tc-detail-close" @click.stop="closeJobSiteDetail" title="Close details">
                &#x2715;
              </button>
            </div>

            <div class="tc-detail-pill-row">
              <span v-if="selectedJobSiteDetail.isJobSite" class="tc-detail-pill" :class="selectedJobSiteDetail.statusBadgeClass">{{ selectedJobSiteDetail.statusText }}</span>
              <span
                v-if="selectedJobSiteDetail.conditionPercent !== null"
                class="tc-detail-pill"
                :class="selectedJobSiteDetail.conditionBadgeClass"
              >
                {{ selectedJobSiteDetail.conditionLabel }} · {{ selectedJobSiteDetail.conditionPercent }}%
              </span>
              <span v-if="selectedJobSiteDetail.isJobSite" class="tc-detail-pill">Crew {{ selectedJobSiteDetail.assignedWorkers }}/{{ selectedJobSiteDetail.slots }}</span>
              <span v-if="selectedJobSiteDetail.cycleLabel" class="tc-detail-pill">{{ selectedJobSiteDetail.cycleLabel }}</span>
            </div>

            <div v-if="selectedJobSiteDetail.isJobSite" class="tc-detail-action-row">
              <button
                class="tc-detail-toggle"
                :class="{ 'tc-detail-toggle-off': !selectedJobSiteDetail.isEnabled }"
                @click.stop="toggleJobSiteEnabled(selectedJobSiteDetail.tileId, !selectedJobSiteDetail.isEnabled)"
              >
                {{ selectedJobSiteDetail.isEnabled ? 'Turn Off Job Site' : 'Turn On Job Site' }}
              </button>
              <p class="tc-detail-action-copy">
                {{ selectedJobSiteDetail.isEnabled ? 'Free this settler and stop production here.' : 'Let this site compete for settlers again.' }}
              </p>
            </div>

            <div v-if="selectedJobSiteDetail.blockerText" class="tc-detail-blocker">
              {{ selectedJobSiteDetail.blockerText }}
            </div>

            <div v-if="selectedJobSiteDetail.isJobSite" class="tc-detail-grid">
              <section class="tc-detail-card">
                <p class="tc-detail-card-label">Current Staffing</p>
                <div class="tc-detail-card-value">{{ selectedJobSiteDetail.assignedWorkersLabel }}</div>
                <p class="tc-detail-card-copy">{{ selectedJobSiteDetail.currentThroughputLabel }}</p>
              </section>
              <section class="tc-detail-card">
                <p class="tc-detail-card-label">Full Staffing</p>
                <div class="tc-detail-card-value">{{ selectedJobSiteDetail.fullStaffingLabel }}</div>
                <p class="tc-detail-card-copy">{{ selectedJobSiteDetail.maxThroughputLabel }}</p>
              </section>
            </div>

            <div class="tc-detail-dashboard">
              <div class="tc-detail-main-column">
                <div v-if="selectedJobSiteDetail.conditionPercent !== null" class="tc-detail-section">
                  <div class="tc-detail-section-title">Condition</div>
                  <div class="tc-detail-condition-card">
                    <div class="tc-detail-condition-top">
                      <div>
                        <p class="tc-detail-flow-copy">{{ selectedJobSiteDetail.conditionStatusText }}</p>
                        <p class="tc-detail-flow-note">{{ selectedJobSiteDetail.repairBacklogLabel }}</p>
                      </div>
                      <span class="tc-detail-pill" :class="selectedJobSiteDetail.conditionBadgeClass">
                        {{ selectedJobSiteDetail.conditionPercent }}%
                      </span>
                    </div>
                    <div class="tc-maintenance-bar-track">
                      <div class="tc-maintenance-bar-fill" :class="selectedJobSiteDetail.conditionBarClass" :style="{ width: `${selectedJobSiteDetail.conditionPercent}%` }" />
                    </div>
                    <div class="tc-detail-chip-row">
                      <span class="tc-detail-chip">{{ selectedJobSiteDetail.repairResourceLabel }}</span>
                      <span
                        v-for="shortage in selectedJobSiteDetail.repairShortages"
                        :key="shortage.type"
                        class="tc-detail-chip tc-detail-chip-alert"
                      >
                        {{ shortage.missingLabel }}
                      </span>
                    </div>
                  </div>
                </div>

                <div v-if="selectedJobSiteDetail.building?.jobSlots" class="tc-detail-section">
                  <div v-if="selectedJobSiteDetail.studyProgress" class="tc-detail-section-title">Study</div>
                  <div v-else class="tc-detail-section-title">Production Flow</div>
                  <div v-if="selectedJobSiteDetail.studyProgress" class="tc-detail-condition-card">
                    <div class="tc-detail-condition-top">
                      <div>
                        <p class="tc-detail-flow-copy">{{ selectedJobSiteDetail.studyProgress.label }}</p>
                        <p class="tc-detail-flow-note">{{ selectedJobSiteDetail.studyProgress.summary }}</p>
                      </div>
                      <span class="tc-detail-pill tc-detail-pill-ok">{{ selectedJobSiteDetail.studyProgress.percent }}%</span>
                    </div>
                    <div class="tc-maintenance-bar-track">
                      <div class="tc-maintenance-bar-fill tc-maintenance-bar-fill-ok" :style="{ width: `${selectedJobSiteDetail.studyProgress.percent}%` }" />
                    </div>
                    <div class="tc-detail-chip-row">
                      <span class="tc-detail-chip">{{ selectedJobSiteDetail.studyProgress.progressLabel }}</span>
                      <span
                        v-for="unlock in selectedJobSiteDetail.studyProgress.unlocks"
                        :key="`${unlock.kind}:${unlock.key}`"
                        class="tc-detail-chip"
                      >
                        {{ unlock.label }}
                      </span>
                    </div>
                  </div>
                  <div v-if="selectedJobSiteDetail.studyOptions.length" class="tc-study-picker">
                    <button
                      v-for="study in selectedJobSiteDetail.studyOptions"
                      :key="study.key"
                      type="button"
                      class="tc-study-option"
                      :class="{
                        'tc-study-option-active': study.active,
                        'tc-study-option-complete': study.completed,
                      }"
                      :disabled="study.completed || study.active"
                      @click.stop="selectStudy(study.key)"
                    >
                      <div class="tc-study-option-top">
                        <span class="tc-study-option-title">{{ study.label }}</span>
                        <span class="tc-detail-pill" :class="study.statusClass">{{ study.statusLabel }}</span>
                      </div>
                      <p class="tc-detail-flow-note">{{ study.summary }}</p>
                      <p v-if="study.unlockText" class="tc-detail-flow-note">{{ study.unlockText }}</p>
                      <div class="tc-maintenance-bar-track">
                        <div class="tc-maintenance-bar-fill tc-maintenance-bar-fill-ok" :style="{ width: `${study.percent}%` }" />
                      </div>
                      <div class="tc-detail-chip-row">
                        <span class="tc-detail-chip">{{ study.progressLabel }}</span>
                        <span
                          v-for="unlock in study.unlocks"
                          :key="`${study.key}:${unlock.kind}:${unlock.key}`"
                          class="tc-detail-chip"
                          :title="unlock.description"
                        >
                          {{ unlock.label }}
                        </span>
                        <span
                          v-for="effect in study.effectLabels"
                          :key="`${study.key}:${effect}`"
                          class="tc-detail-chip"
                        >
                          {{ effect }}
                        </span>
                      </div>
                    </button>
                  </div>
                  <div v-if="!selectedJobSiteDetail.studyProgress" class="tc-detail-flow-grid">
                    <section class="tc-detail-flow-card">
                      <p class="tc-detail-flow-title">Consumes</p>
                      <p class="tc-detail-flow-copy">{{ selectedJobSiteDetail.currentInputLabel }}</p>
                      <p class="tc-detail-flow-note">{{ selectedJobSiteDetail.inputRateLabel }}</p>
                    </section>
                    <section class="tc-detail-flow-card">
                      <p class="tc-detail-flow-title">Produces</p>
                      <p class="tc-detail-flow-copy">{{ selectedJobSiteDetail.currentOutputLabel }}</p>
                      <p class="tc-detail-flow-note">{{ selectedJobSiteDetail.outputRateLabel }}</p>
                    </section>
                  </div>
                </div>

                <div v-if="selectedJobSiteDetail.shortages.length" class="tc-detail-section">
                  <div class="tc-detail-section-title">Current Bottleneck</div>
                  <div class="tc-detail-chip-row">
                    <span v-for="shortage in selectedJobSiteDetail.shortages" :key="shortage.type" class="tc-detail-chip">
                      {{ shortage.missingLabel }}
                    </span>
                  </div>
                </div>

                <div v-if="selectedJobSiteDetail.advice.length" class="tc-detail-section">
                  <div class="tc-detail-section-title">How To Improve</div>
                  <ul class="tc-detail-advice-list">
                    <li v-for="tip in selectedJobSiteDetail.advice" :key="tip" class="tc-detail-advice-item">
                      {{ tip }}
                    </li>
                  </ul>
                </div>
              </div>

              <div class="tc-detail-side-column">
                <div v-if="selectedJobSiteDetail.availableActions.length || selectedJobSiteDetail.actionHint" class="tc-detail-section tc-detail-section-sticky">
                  <div class="tc-detail-section-title">Orders</div>
                  <div v-if="selectedJobSiteDetail.availableActions.length" class="tc-detail-order-list">
                    <div v-for="action in selectedJobSiteDetail.availableActions" :key="action.key" class="tc-detail-order-card">
                      <div class="tc-detail-order-top">
                        <div>
                          <p class="tc-detail-order-title">{{ action.label }}</p>
                          <p class="tc-detail-order-copy">{{ action.summary }}</p>
                          <p v-if="!action.unlocked && action.lockHint" class="tc-detail-order-note">{{ action.lockHint }}</p>
                        </div>
                        <button
                          class="tc-detail-order-button"
                          :class="{ 'tc-detail-order-button-disabled': !action.unlocked }"
                          :disabled="!action.unlocked"
                          @click.stop="startBuildingAction(selectedJobSiteDetail.tileId, action.definition)"
                        >
                          {{ !action.unlocked ? 'Locked' : (selectedHero ? 'Send Hero' : 'Select Hero') }}
                        </button>
                      </div>
                      <div v-if="action.costs.length" class="tc-detail-chip-row">
                        <span
                          v-for="resource in action.costs"
                          :key="`${action.key}:${resource.type}`"
                          class="tc-detail-chip"
                          :class="{ 'tc-detail-chip-alert': getWarehouseAmount(resource.type) < resource.amount }"
                        >
                          {{ formatNumber(resource.amount) }} {{ formatResourceType(resource.type) }}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p v-else class="tc-placeholder-text">{{ selectedJobSiteDetail.actionHint }}</p>
                </div>
              </div>
            </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import type { ResourceAmount, ResourceType } from '../core/types/Resource.ts';
import type { TileConditionState } from '../core/types/Tile.ts';
import type { Hero } from '../core/types/Hero.ts';
import type { TaskDefinition } from '../core/types/Task.ts';
import { requestHeroMovement, startTaskRequest } from '../core/heroService';
import { PathService } from '../core/PathService';
import { getBuildingDefinitionByKey, getBuildingDefinitionByTaskKey, resolveBuildingJobResources } from '../shared/buildings/registry';
import { resolveBuildingStateForTile } from '../shared/buildings/state.ts';
import { getUpgradeDefinitionByTaskKey } from '../shared/buildings/upgrades.ts';
import {
  formatResourceType,
  getJobSiteAdvice,
  getJobSiteStatusDescriptor,
  getMissingInputResources,
  getPerMinuteResources,
} from '../shared/buildings/jobSiteDetails.ts';
import { getTaskEconomyDistance } from '../shared/tasks/economy.ts';
import { findNearestTaskAccessTile, getTaskAccessMode } from '../shared/tasks/taskAccess.ts';
import { canStartTaskDefinition } from '../shared/tasks/taskAvailability.ts';
import { listTaskDefinitions } from '../shared/tasks/taskRegistry.ts';
import { getTaskUnlockStatus, isTaskUnlockedForUse } from '../shared/tasks/taskUnlocks.ts';
import { isBridgeTile, isTunnelTile } from '../shared/game/bridges.ts';
import { isRoadTile } from '../shared/game/roads.ts';
import {
  getConditionLabel,
  getConditionStatusText,
  getConditionTone,
  getMaintenanceOverview,
} from '../shared/buildings/maintenanceDetails.ts';
import { tileIndex, worldVersion } from '../shared/game/world.ts';
import { formatSettlerBlocker } from '../shared/game/settlerBlockers.ts';
import { populationState } from '../store/clientPopulationStore';
import { workforceState } from '../store/clientJobStore';
import { studyState, studyVersion } from '../store/clientStudyStore';
import { resourceInventory, resourceVersion, storageInventories } from '../store/resourceStore';
import { runSnapshot } from '../store/runStore';
import { settlers, settlerVersion } from '../store/settlerStore';
import { getSelectedHero } from '../store/uiStore';
import { detachHeroFromCurrentTask } from '../store/taskStore.ts';
import { addNotification } from '../store/notificationStore';
import { canControlHero, getHeroOwnerName } from '../store/playerStore';
import { sendMessage } from '../core/socket';
import { currentPlayerId } from '../core/socket';
import { closeWindow, isWindowActive, openWindow, WINDOW_IDS } from '../core/windowManager';
import {
  FOOD_PER_SETTLER_PER_MINUTE,
  HUNGER_GRACE_MINUTES,
} from '../store/populationStore';

interface Props {
  visible: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'close'): void;
}>();

const selectedJobSiteId = ref<string | null>(null);
const detailOnlyMode = ref(false);
const pathService = new PathService();
const selectedHero = computed(() => getSelectedHero());

function close() {
  clearJobSiteDetailState();
  emit('close');
}

function clearJobSiteDetailState() {
  selectedJobSiteId.value = null;
  detailOnlyMode.value = false;
  closeWindow(WINDOW_IDS.BUILDING_DETAIL_MODAL);
}

function toggleJobSiteEnabled(tileId: string, enabled: boolean) {
  sendMessage({
    type: 'jobs:set_site_enabled',
    tileId,
    enabled,
    timestamp: Date.now(),
  });
}

function selectStudy(studyKey: string) {
  sendMessage({
    type: 'studies:set_active',
    studyKey,
    timestamp: Date.now(),
  });
}

function formatNumber(value: number) {
  return `${Math.floor(value)}`;
}

function formatCycleDuration(cycleMs: number | undefined) {
  if (!cycleMs || cycleMs <= 0) return 'No cycle';
  const totalSeconds = Math.max(1, Math.round(cycleMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s cycle`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (seconds === 0) return `${minutes}m cycle`;
  return `${minutes}m ${seconds}s cycle`;
}

function formatStudyDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatStudyEffect(effect: { kind: string; multiplier?: number }) {
  if (effect.kind === 'job_output_multiplier' && typeof effect.multiplier === 'number') {
    return `Output +${Math.round((effect.multiplier - 1) * 100)}%`;
  }

  return 'Colony buff';
}

function formatResourceList(resources: ResourceAmount[], emptyText: string) {
  if (!resources.length) {
    return emptyText;
  }

  return resources
    .map((resource) => `${formatNumber(resource.amount)} ${formatResourceType(resource.type)}`)
    .join(' • ');
}

function formatRateList(resources: ResourceAmount[], emptyText: string) {
  if (!resources.length) {
    return emptyText;
  }

  return resources
    .map((resource) => `${formatNumber(resource.amount)} ${formatResourceType(resource.type)}/min`)
    .join(' • ');
}

function getStatusClassFromTone(tone: 'ok' | 'warn' | 'danger') {
  return `tc-job-site-status-${tone}`;
}

function getConditionFillClass(conditionState: TileConditionState) {
  return `tc-maintenance-bar-fill-${getConditionTone(conditionState)}`;
}

function getStructureLabel(tileId: string) {
  const tile = tileIndex[tileId] ?? null;
  const building = resolveBuildingStateForTile(tile)?.building ?? null;
  if (building) {
    return building.label;
  }
  if (isRoadTile(tile)) {
    return tile?.variant?.startsWith('stone_road') ? 'Stone Road' : 'Road';
  }
  if (isBridgeTile(tile)) {
    return 'Bridge';
  }
  if (isTunnelTile(tile)) {
    return 'Tunnel';
  }
  return tile?.terrain ? tile.terrain.charAt(0).toUpperCase() + tile.terrain.slice(1) : 'Building';
}

function getStructureSummary(tileId: string) {
  const tile = tileIndex[tileId] ?? null;
  const buildingState = resolveBuildingStateForTile(tile);
  if (buildingState?.building) {
    return buildingState.upgrade
      ? `${buildingState.building.summary} Level ${buildingState.level}.`
      : buildingState.building.summary;
  }
  if (isRoadTile(tile)) {
    return tile?.variant?.startsWith('stone_road')
      ? 'A paved road segment that speeds movement through the colony.'
      : 'A road segment that keeps movement and logistics flowing.';
  }
  if (isBridgeTile(tile)) {
    return 'A bridge segment that carries roads over water.';
  }
  if (isTunnelTile(tile)) {
    return 'A tunnel segment that carries roads through mountains.';
  }
  return 'Constructed infrastructure in the colony.';
}

function formatMaintenanceBacklog(resource: {
  type: ResourceType;
  amount: number;
  shortfall: number;
}) {
  const base = `${formatNumber(resource.amount)} ${formatResourceType(resource.type)}`;
  return resource.shortfall > 0 ? `${base} · short ${formatNumber(resource.shortfall)}` : base;
}

function getWarehouseAmount(type: ResourceType) {
  return Math.floor(resourceInventory[type] ?? 0);
}

function getActionSummary(def: TaskDefinition) {
  if (def.key === 'dismantle') {
    return 'Order a hero to remove this structure and clear the tile.';
  }
  return getTaskSummary(def);
}

function createInspectorHero(tile: { q: number; r: number }): Hero {
  return {
    id: 'inspector-hero',
    name: 'Inspector',
    avatar: '',
    q: tile.q,
    r: tile.r,
    stats: {
      xp: 0,
      hp: 1,
      atk: 1,
      spd: 1,
    },
    facing: 'down',
  };
}

function getTaskSummary(def: TaskDefinition) {
  const building = getBuildingDefinitionByTaskKey(def.key);
  if (building) {
    return building.summary;
  }

  const upgrade = getUpgradeDefinitionByTaskKey(def.key);
  if (upgrade) {
    return upgrade.summary;
  }

  return def.label;
}

function getTaskLockHint(def: TaskDefinition) {
  const unlockStatus = getTaskUnlockStatus(def.key);
  if (unlockStatus.unlocked || !unlockStatus.lockingNode) {
    return null;
  }

  const unmetRequirement = unlockStatus.lockingNode.requirements.find((requirement) => !requirement.satisfied);
  if (!unmetRequirement) {
    return `${unlockStatus.lockingNode.label} has not been reached yet.`;
  }

  return `${unlockStatus.lockingNode.label}: ${unmetRequirement.label} (${unmetRequirement.currentLabel}).`;
}

// --- Colony Progress ---

const exploredTiles = computed(() => {
  return runSnapshot.value?.discoveredTiles ?? 0;
});

const ownedTiles = computed(() => populationState.activeTileCount + populationState.inactiveTileCount);

// --- Population ---

const populationStatusClass = computed(() => {
  if (populationState.hungerMs > 0) return 'tc-status-danger';
  if (populationState.beds <= 0) return 'tc-status-warn';
  if (populationState.current >= populationState.max) return 'tc-status-warn';
  if (populationState.current >= populationState.beds) return 'tc-status-warn';
  return 'tc-status-ok';
});

const populationStatusText = computed(() => {
  if (populationState.hungerMs > 0) {
    const graceMs = HUNGER_GRACE_MINUTES * 60_000;
    const remaining = Math.max(0, graceMs - populationState.hungerMs);
    const remainingSec = Math.ceil(remaining / 1000);
    const min = Math.floor(remainingSec / 60);
    const sec = remainingSec % 60;
    return `Starving — ${min}:${String(sec).padStart(2, '0')} until settler lost`;
  }
  if (populationState.beds <= 0) {
    return 'No beds — build houses to attract settlers';
  }
  if (populationState.current >= populationState.max) {
    return 'At TC capacity — build another town center';
  }
  if (populationState.current >= populationState.beds) {
    return 'All beds full — build houses to grow';
  }
  const effectiveCap = Math.min(populationState.max, populationState.beds);
  const slots = effectiveCap - populationState.current;
  return `Growing — ${slots} bed${slots !== 1 ? 's' : ''} available`;
});

const supportStatusClass = computed(() => {
  if (populationState.pressureState === 'collapsing') return 'tc-status-danger';
  if (populationState.pressureState === 'strained') return 'tc-status-warn';
  return 'tc-status-ok';
});

const supportStatusText = computed(() => {
  switch (populationState.pressureState) {
    case 'collapsing':
      return `Collapsing — ${populationState.inactiveTileCount} tile${populationState.inactiveTileCount === 1 ? '' : 's'} offline`;
    case 'strained':
      return `Strained — fringe tiles are at risk, restore support before expanding again`;
    case 'stable':
    default:
      if (ownedTiles.value <= 0) {
        return 'Stable — claim more territory to build a larger district';
      }
      return `Stable — ${populationState.activeTileCount} of ${ownedTiles.value} owned tiles remain online`;
  }
});

// --- Food ---

const foodStock = computed(() => {
  // Force reactivity on resourceVersion
  void resourceVersion.value;
  return resourceInventory.food ?? 0;
});

const foodPerMinute = computed(() => {
  return populationState.current * FOOD_PER_SETTLER_PER_MINUTE;
});

const minutesOfFood = computed(() => {
  if (foodPerMinute.value <= 0) return Infinity;
  return foodStock.value / foodPerMinute.value;
});

const foodBarPercent = computed(() => {
  // Show bar relative to ~10 minutes of food as "full"
  const target = foodPerMinute.value * 10;
  if (target <= 0) return 100;
  return Math.min(100, (foodStock.value / target) * 100);
});

const foodBarClass = computed(() => {
  if (foodStock.value <= 0) return 'tc-bar-danger';
  if (minutesOfFood.value < 3) return 'tc-bar-danger';
  if (minutesOfFood.value < 5) return 'tc-bar-warn';
  return 'tc-bar-ok';
});

const foodStatusClass = computed(() => {
  if (foodStock.value <= 0) return 'tc-status-danger';
  if (minutesOfFood.value < 3) return 'tc-status-danger';
  if (minutesOfFood.value < 5) return 'tc-status-warn';
  return 'tc-status-ok';
});

const foodStatusText = computed(() => {
  if (populationState.current <= 0) return 'No settlers to feed';
  if (foodStock.value <= 0) return 'No food — settlers are starving!';
  if (minutesOfFood.value === Infinity) return 'No consumption';
  const mins = Math.floor(minutesOfFood.value);
  if (mins < 1) return 'Less than a minute of food left';
  if (mins === 1) return '~1 minute of food remaining';
  return `~${mins} minutes of food remaining`;
});

// --- Maintenance ---

const maintenanceSummary = computed(() => {
  void resourceVersion.value;
  void settlerVersion.value;
  void worldVersion.value;
  return getMaintenanceOverview(Object.values(tileIndex), settlers, resourceInventory);
});

const maintenanceStatusClass = computed(() => {
  if (maintenanceSummary.value.tone === 'danger') return 'tc-status-danger';
  if (maintenanceSummary.value.tone === 'warn') return 'tc-status-warn';
  return 'tc-status-ok';
});

// --- Jobs ---

const totalFreeStorage = computed(() => {
  void resourceVersion.value;
  return Object.values(storageInventories).reduce((sum, storage) => {
    const used = Object.values(storage.resources).reduce((resourceSum, amount) => resourceSum + (amount ?? 0), 0);
    return sum + Math.max(0, storage.capacity - used);
  }, 0);
});

const jobSites = computed(() => {
  void worldVersion.value;
  return workforceState.sites.map((site) => {
    const building = getBuildingDefinitionByKey(site.buildingKey);
    const status = getJobSiteStatusDescriptor(site.status);
    const tile = tileIndex[site.tileId] ?? null;
    const conditionPercent = typeof tile?.condition === 'number' ? Math.round(tile.condition) : null;
    const conditionState = conditionPercent !== null ? tile?.conditionState ?? 'healthy' : null;
    const statusText = site.status === 'offline' && conditionState === 'offline'
      ? 'Offline — awaiting repairs'
      : status.text;
    const statusTone = site.status === 'offline' && conditionState === 'offline'
      ? 'danger'
      : status.tone;

    return {
      ...site,
      building,
      label: building?.label ?? site.buildingKey,
      summary: building?.summary ?? 'Settlers can staff this site to keep the colony moving.',
      statusText,
      blockerText: formatSettlerBlocker(site.blockerReason),
      statusClass: getStatusClassFromTone(statusTone),
      statusBadgeClass: `tc-detail-pill-${statusTone}`,
      conditionPercent,
      conditionLabel: conditionState ? getConditionLabel(conditionState) : null,
      conditionBarClass: conditionState ? getConditionFillClass(conditionState) : null,
      hasDetail: !!building,
    };
  });
});

const selectedJobSiteDetail = computed(() => {
  void worldVersion.value;
  void studyVersion.value;
  if (!selectedJobSiteId.value) {
    return null;
  }

  const tile = tileIndex[selectedJobSiteId.value] ?? null;
  if (!tile) {
    return null;
  }

  const site = jobSites.value.find((entry) => entry.tileId === selectedJobSiteId.value) ?? null;
  const buildingState = resolveBuildingStateForTile(tile);
  const building = buildingState?.building ?? null;
  const hasJobSite = !!site && !!building;
  const currentWorkerCount = site?.assignedWorkers ?? 0;
  const fullWorkerCount = site?.slots ?? Math.max(1, building?.jobSlots ?? 0);
  const { consumes: currentInputs, produces: currentOutputs } = building
    ? resolveBuildingJobResources(building, tile, currentWorkerCount)
    : { consumes: [], produces: [] };
  const { consumes: fullInputs, produces: fullOutputs } = building
    ? resolveBuildingJobResources(building, tile, fullWorkerCount)
    : { consumes: [], produces: [] };
  const currentInputRates = building ? getPerMinuteResources(currentInputs, 1, building.cycleMs) : [];
  const currentOutputRates = building ? getPerMinuteResources(currentOutputs, 1, building.cycleMs) : [];
  const fullOutputRates = building ? getPerMinuteResources(fullOutputs, 1, building.cycleMs) : [];
  const shortages = building ? getMissingInputResources(currentInputs, 1, resourceInventory) : [];
  const conditionPercent = typeof tile?.condition === 'number' ? Math.round(tile.condition) : null;
  const conditionState = conditionPercent !== null ? tile?.conditionState ?? 'healthy' : null;
  const repairResources = tile ? building?.repairResources ?? [] : [];
  const repairNeeded = conditionPercent !== null ? Math.max(0, 100 - conditionPercent) : 0;
  const repairShortages = getMissingInputResources(repairResources, 1, resourceInventory);
  const activeStudy = building?.key === 'library'
    ? (studyState.studies.find((study) => study.active) ?? null)
    : null;
  const studyProgress = activeStudy
    ? {
      label: activeStudy.label,
      summary: activeStudy.summary,
      progressLabel: `${formatStudyDuration(activeStudy.progressMs)} / ${formatStudyDuration(activeStudy.requiredProgressMs)}`,
      percent: activeStudy.requiredProgressMs > 0
        ? Math.min(100, Math.round((activeStudy.progressMs / activeStudy.requiredProgressMs) * 100))
        : 100,
      unlocks: activeStudy.unlocks,
    }
    : (building?.key === 'library'
      ? {
        label: 'All studies complete',
        summary: 'The shelves are quiet for now. Future subjects can plug into the library queue.',
        progressLabel: `${studyState.completedStudyKeys.length} completed`,
        percent: 100,
        unlocks: [],
      }
      : null);
  const studyOptions = building?.key === 'library'
    ? studyState.studies.map((study) => {
      const percent = study.requiredProgressMs > 0
        ? Math.min(100, Math.floor((study.progressMs / study.requiredProgressMs) * 100))
        : 100;
      return {
        key: study.key,
        label: study.label,
        summary: study.summary,
        progressLabel: `${formatStudyDuration(study.progressMs)} / ${formatStudyDuration(study.requiredProgressMs)}`,
        percent,
        active: study.active,
        completed: study.completed,
        statusLabel: study.completed ? 'Complete' : study.active ? 'Active' : 'Available',
        statusClass: study.completed || study.active ? 'tc-detail-pill-ok' : 'tc-detail-pill-warn',
        unlocks: study.unlocks,
        unlockText: study.unlocks.map((unlock) => `${unlock.label}: ${unlock.description}`).join(' • '),
        effectLabels: study.effects.map(formatStudyEffect),
      };
    })
    : [];
  const advice = hasJobSite && building && site
    ? getJobSiteAdvice({
      building,
      site,
      population: {
        current: populationState.current,
        max: populationState.max,
        beds: populationState.beds,
        hungerMs: populationState.hungerMs,
        pressureState: populationState.pressureState,
        inactiveTileCount: populationState.inactiveTileCount,
      },
      workforce: {
        availableWorkers: workforceState.availableWorkers,
        idleWorkers: workforceState.idleWorkers,
      },
      resourceInventory,
      totalFreeStorage: totalFreeStorage.value,
    })
    : [];
  const isEnabled = tile?.jobSiteEnabled !== false;
  const hero = selectedHero.value;
  const inspectorHero = hero ?? createInspectorHero(tile);
  const availableActions = listTaskDefinitions()
    .filter((task) => task.key !== 'walk')
    .filter((task) => canStartTaskDefinition(task, tile, inspectorHero))
    .map((task) => ({
      key: task.key,
      definition: task,
      label: task.label,
      summary: getActionSummary(task),
      costs: getTaskCosts(task),
      unlocked: isTaskUnlockedForUse(task.key),
      lockHint: getTaskLockHint(task),
    }));
  const isInfrastructure = !building && (isRoadTile(tile) || isBridgeTile(tile) || isTunnelTile(tile));
  if (!building && !isInfrastructure) {
    return null;
  }

  return {
    ...(site ?? {
      tileId: tile.id,
      assignedWorkers: 0,
      slots: building?.jobSlots ?? 0,
      statusText: 'No crew needed',
      statusBadgeClass: 'tc-detail-pill-ok',
      blockerText: null,
      statusClass: 'tc-job-site-status-ok',
    }),
    tileId: tile.id,
    building,
    isEnabled,
    detailKicker: hasJobSite ? 'Production Site' : 'Building',
    label: site?.label ?? getStructureLabel(tile.id),
    summary: site?.summary ?? getStructureSummary(tile.id),
    isJobSite: hasJobSite,
    cycleLabel: formatCycleDuration(building?.cycleMs),
    studyProgress,
    studyOptions,
    assignedWorkersLabel: currentWorkerCount > 0
      ? `${currentWorkerCount} ${building?.jobLabel ?? 'worker'}${currentWorkerCount === 1 ? '' : 's'} on duty`
      : 'No crew assigned',
    fullStaffingLabel: `${fullWorkerCount} slot${fullWorkerCount === 1 ? '' : 's'} available`,
    currentThroughputLabel: studyProgress
      ? (currentWorkerCount > 0 ? 'Study progress advances each completed duty cycle' : 'Study pauses while no scholars are assigned')
      : formatRateList(currentOutputRates, 'No output per minute while idle'),
    maxThroughputLabel: studyProgress
      ? 'More scholars complete subjects sooner'
      : formatRateList(fullOutputRates, 'No output defined'),
    currentInputLabel: formatResourceList(currentInputs, 'No input required'),
    currentOutputLabel: formatResourceList(currentOutputs, 'No output while idle'),
    inputRateLabel: formatRateList(currentInputRates, 'Consumes nothing per minute'),
    outputRateLabel: formatRateList(currentOutputRates, 'Produces nothing per minute'),
    fullInputLabel: formatResourceList(fullInputs, 'No input required'),
    fullOutputLabel: formatResourceList(fullOutputs, 'No output defined'),
    shortages: shortages.map((shortage) => ({
      ...shortage,
      missingLabel: `${formatNumber(shortage.missing)} ${formatResourceType(shortage.type)} missing`,
    })),
    conditionPercent,
    conditionLabel: conditionState ? getConditionLabel(conditionState) : null,
    conditionStatusText: conditionState ? getConditionStatusText(conditionState) : null,
    conditionBarClass: conditionState ? getConditionFillClass(conditionState) : null,
    conditionBadgeClass: conditionState ? `tc-detail-pill-${getConditionTone(conditionState)}` : null,
    repairBacklogLabel: repairNeeded > 0
      ? `${repairNeeded}% condition missing · ${Math.ceil(repairNeeded / 35)} repair cycle${Math.ceil(repairNeeded / 35) === 1 ? '' : 's'} needed`
      : 'No repairs needed right now',
    repairResourceLabel: repairResources.length
      ? `Each repair uses ${formatResourceList(repairResources, 'No repair cost')}`
      : 'No repair materials required',
    repairShortages: repairShortages.map((shortage) => ({
      ...shortage,
      missingLabel: `${formatNumber(shortage.missing)} ${formatResourceType(shortage.type)} missing for repairs`,
    })),
    advice,
    availableActions,
    actionHint: hero
      ? 'No hero orders are available on this structure right now.'
      : 'Select a hero to issue the order shown here.',
  };
});

function openJobSiteDetail(tileId: string, options?: { detailOnly?: boolean }) {
  const site = jobSites.value.find((entry) => entry.tileId === tileId);
  const tile = tileIndex[tileId] ?? null;
  const inspectableStructure = !!resolveBuildingStateForTile(tile) || isRoadTile(tile) || isBridgeTile(tile) || isTunnelTile(tile);
  if (!site?.hasDetail && !inspectableStructure) {
    return;
  }

  detailOnlyMode.value = !!options?.detailOnly;
  selectedJobSiteId.value = tileId;
  openWindow(WINDOW_IDS.BUILDING_DETAIL_MODAL);
}

function openStandaloneJobSiteDetail(tileId: string) {
  openJobSiteDetail(tileId, { detailOnly: true });
}

function openStandaloneBuildingDetail(tileId: string) {
  openJobSiteDetail(tileId, { detailOnly: true });
}

function closeJobSiteDetail() {
  const shouldClosePanel = detailOnlyMode.value;
  clearJobSiteDetailState();
  if (shouldClosePanel) {
    emit('close');
  }
}

function getTaskCosts(def: TaskDefinition) {
  return def.requiredResources?.(getTaskEconomyDistance()) ?? [];
}

function startBuildingAction(tileId: string, def: TaskDefinition) {
  const tile = tileIndex[tileId] ?? null;
  if (!isTaskUnlockedForUse(def.key)) {
    return;
  }
  const hero = selectedHero.value;
  if (!tile) {
    return;
  }
  if (!hero) {
    addNotification({
      type: 'run_state',
      title: 'Select a hero',
      message: 'Pick a hero first, then issue this building order.',
      duration: 2600,
    });
    return;
  }

  const accessMode = getTaskAccessMode(def.key, tile);
  const accessTile = findNearestTaskAccessTile(def.key, tile, hero.q, hero.r);
  if ((accessMode === 'adjacent_walkable' || accessMode === 'adjacent_active') && !accessTile) {
    addNotification({
      type: 'run_state',
      title: 'No valid approach',
      message: 'This structure needs an active approach tile before a hero can work on it.',
      duration: 3200,
    });
    return;
  }

  if (!canControlHero(hero.id, currentPlayerId.value)) {
    addNotification({
      type: 'coop_state',
      title: `${hero.name} is occupied`,
      message: `${getHeroOwnerName(hero.id) ?? 'Another player'} has claimed this hero.`,
      duration: 3000,
    });
    return;
  }

  if (accessTile && hero.q === accessTile.q && hero.r === accessTile.r) {
    if (def.key !== 'walk') {
      startTaskRequest(hero.id, def.key, { q: tile.q, r: tile.r });
      closeJobSiteDetail();
    }
    return;
  }

  const path = accessTile
    ? pathService.findWalkablePath(hero.q, hero.r, accessTile.q, accessTile.r)
    : [];
  if (!path.length) {
    addNotification({
      type: 'run_state',
      title: 'No path',
      message: 'This hero cannot reach the selected structure right now.',
      duration: 2800,
    });
    return;
  }

  detachHeroFromCurrentTask(hero);
  requestHeroMovement(
    hero.id,
    path,
    accessTile ?? tile,
    def.key,
    accessMode !== 'tile' ? tile : undefined,
  );
  closeJobSiteDetail();
}

defineExpose({
  openJobSiteDetail,
  openStandaloneJobSiteDetail,
  openStandaloneBuildingDetail,
  closeJobSiteDetail,
});

const jobsStatusClass = computed(() => {
  if (populationState.hungerMs > 0 && workforceState.sites.length > 0) {
    return 'tc-status-danger';
  }
  if (!workforceState.sites.length || workforceState.idleWorkers > 0) {
    return 'tc-status-warn';
  }
  return 'tc-status-ok';
});

const jobsStatusText = computed(() => {
  if (!workforceState.sites.length) {
    return 'No job buildings online yet';
  }
  if (populationState.hungerMs > 0) {
    return 'The colony is hungry, but staffed jobs keep running';
  }
  if (workforceState.availableWorkers <= 0) {
    return 'No settlers are available for work';
  }
  if (workforceState.idleWorkers > 0) {
    return `${workforceState.idleWorkers} worker${workforceState.idleWorkers === 1 ? '' : 's'} waiting for more job slots`;
  }
  return 'Every available worker is assigned';
});

// --- Keyboard ---

let listenerActive = false;

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (selectedJobSiteId.value && isWindowActive(WINDOW_IDS.BUILDING_DETAIL_MODAL)) {
      e.preventDefault();
      e.stopPropagation();
      closeJobSiteDetail();
      return;
    }

    if (isWindowActive(WINDOW_IDS.TOWN_CENTER_PANEL)) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }
}

watch(() => props.visible, (isVisible) => {
  if (!isVisible) {
    clearJobSiteDetailState();
  }

  if (isVisible && !listenerActive) {
    window.addEventListener('keydown', handleKeydown);
    listenerActive = true;
  } else if (!isVisible && listenerActive) {
    window.removeEventListener('keydown', handleKeydown);
    listenerActive = false;
  }
}, { immediate: true });

watch(selectedJobSiteDetail, (detail) => {
  if (!detail && selectedJobSiteId.value) {
    closeJobSiteDetail();
  }
});

onUnmounted(() => {
  if (listenerActive) {
    window.removeEventListener('keydown', handleKeydown);
    listenerActive = false;
  }

  clearJobSiteDetailState();
});
</script>

<style scoped>
.tc-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(2, 6, 23, 0.68);
  backdrop-filter: blur(4px);
  pointer-events: auto;
}

.tc-overlay-standalone {
  background: transparent;
  backdrop-filter: none;
  pointer-events: none;
}

.tc-overlay-standalone > * {
  pointer-events: auto;
}

.tc-panel {
  position: relative;
  width: min(940px, calc(100vw - 32px));
  padding: 20px;
  border-radius: 28px;
  max-height: min(82vh, calc(100vh - 32px));
  overflow-x: hidden;
  overflow-y: auto;
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  gap: 14px;
  background:
    radial-gradient(circle at top left, rgba(251, 191, 36, 0.14), transparent 32%),
    radial-gradient(circle at 86% 18%, rgba(34, 211, 238, 0.12), transparent 26%),
    linear-gradient(180deg, rgba(7, 12, 24, 0.995), rgba(12, 18, 33, 0.99));
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow:
    0 30px 60px rgba(2, 6, 23, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.03) inset;
  backdrop-filter: none;
}

.tc-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.08), transparent 22%),
    linear-gradient(180deg, transparent, rgba(15, 23, 42, 0.14));
  opacity: 0.8;
}

.tc-panel::-webkit-scrollbar {
  width: 8px;
}

.tc-panel::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.24);
}

/* Header */

.tc-header {
  position: relative;
  z-index: 1;
  grid-column: 1 / -1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.tc-header-copy {
  flex: 1;
}

.tc-kicker {
  margin: 0;
  font-size: 9px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(252, 211, 77, 0.82);
}

.tc-title {
  margin: 8px 0 0;
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.05;
  color: #f8fafc;
  text-shadow: 0 10px 24px rgba(2, 6, 23, 0.35);
}

.tc-close {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.42);
  color: rgba(248, 250, 252, 0.9);
  font-size: 14px;
  cursor: pointer;
  transition: transform .15s, border-color .15s, background .15s;
}

.tc-close:hover {
  transform: translateY(-1px);
  border-color: rgba(125, 211, 252, 0.32);
  background: rgba(15, 23, 42, 0.62);
}

/* Sections */

.tc-section {
  position: relative;
  z-index: 1;
  margin-top: 0;
  padding: 14px;
  border-radius: 20px;
  border: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(15, 23, 42, 0.3);
}

.tc-section-jobs {
  grid-column: 1 / -1;
}

.tc-section-maintenance {
  grid-column: 1 / -1;
}

.tc-section-progress .tc-stat-grid,
.tc-section-food .tc-stat-grid {
  margin-bottom: 10px;
}

.tc-section-muted {
  opacity: 0.5;
}

.tc-section-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.tc-section-title {
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(191, 219, 254, 0.72);
}

.tc-section-caption {
  font-size: 10px;
  color: rgba(191, 219, 254, 0.44);
  font-style: italic;
}

/* Stats */

.tc-stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 10px;
}

.tc-stat-grid-3 {
  grid-template-columns: 1fr 1fr 1fr;
}

.tc-stat-grid-4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.tc-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.52);
  border: 1px solid rgba(148, 163, 184, 0.08);
}

.tc-stat-value {
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1;
  color: #f8fafc;
}

.tc-stat-label {
  font-size: 10px;
  color: rgba(191, 219, 254, 0.56);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* Status row */

.tc-status-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tc-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tc-status-dot.tc-status-ok {
  background: rgba(74, 222, 128, 0.9);
  box-shadow: 0 0 6px rgba(74, 222, 128, 0.4);
}

.tc-status-dot.tc-status-warn {
  background: rgba(251, 191, 36, 0.9);
  box-shadow: 0 0 6px rgba(251, 191, 36, 0.4);
}

.tc-status-dot.tc-status-danger {
  background: rgba(248, 113, 113, 0.9);
  box-shadow: 0 0 6px rgba(248, 113, 113, 0.4);
  animation: tc-pulse 1.2s ease-in-out infinite;
}

.tc-status-text {
  font-size: 11px;
  line-height: 1.35;
  color: rgba(226, 232, 240, 0.72);
}

/* Food bar */

.tc-food-bar-track {
  height: 6px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.08);
  overflow: hidden;
  margin-bottom: 10px;
}

.tc-food-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.5s ease;
}

.tc-bar-ok {
  background: linear-gradient(90deg, rgba(74, 222, 128, 0.7), rgba(34, 197, 94, 0.9));
}

.tc-bar-warn {
  background: linear-gradient(90deg, rgba(251, 191, 36, 0.7), rgba(245, 158, 11, 0.9));
}

.tc-bar-danger {
  background: linear-gradient(90deg, rgba(248, 113, 113, 0.7), rgba(239, 68, 68, 0.9));
}

.tc-job-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.tc-job-site {
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.52);
  border: 1px solid rgba(148, 163, 184, 0.08);
}

.tc-job-site-clickable {
  cursor: pointer;
  transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}

.tc-job-site-clickable:hover,
.tc-job-site-clickable:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(125, 211, 252, 0.26);
  background: rgba(15, 23, 42, 0.68);
  outline: none;
}

.tc-job-site-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.tc-job-site-aside {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.tc-job-site-name {
  font-size: 12px;
  font-weight: 600;
  color: #f8fafc;
}

.tc-job-site-meta {
  margin-top: 2px;
  font-size: 10px;
  color: rgba(191, 219, 254, 0.44);
}

.tc-job-site-staff {
  font-size: 11px;
  font-weight: 700;
  color: rgba(252, 211, 77, 0.9);
}

.tc-job-site-open {
  padding: 3px 7px;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.14);
  border: 1px solid rgba(56, 189, 248, 0.18);
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(186, 230, 253, 0.9);
}

.tc-job-site-status {
  margin-top: 8px;
  font-size: 11px;
  line-height: 1.35;
}

.tc-job-site-blocker,
.tc-detail-blocker {
  margin-top: 8px;
  border-radius: 12px;
  border: 1px solid rgba(251, 191, 36, 0.22);
  background: rgba(120, 53, 15, 0.18);
  padding: 8px 10px;
  color: rgba(254, 243, 199, 0.92);
  font-size: 11px;
  line-height: 1.35;
}

.tc-detail-blocker {
  margin-top: 12px;
}

.tc-job-site-status-ok {
  color: rgba(134, 239, 172, 0.92);
}

.tc-job-site-status-warn {
  color: rgba(253, 224, 71, 0.92);
}

.tc-job-site-status-danger {
  color: rgba(252, 165, 165, 0.94);
}

.tc-job-site-condition {
  margin-top: 8px;
}

.tc-job-site-condition-top,
.tc-maintenance-site-top,
.tc-detail-condition-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tc-job-site-condition-label,
.tc-job-site-condition-value,
.tc-maintenance-site-name,
.tc-maintenance-site-state {
  font-size: 10px;
  line-height: 1.3;
}

.tc-job-site-condition-label,
.tc-maintenance-site-name {
  color: rgba(191, 219, 254, 0.7);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.tc-job-site-condition-value {
  color: rgba(226, 232, 240, 0.84);
}

.tc-maintenance-chip-row {
  margin-top: 10px;
}

.tc-maintenance-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.tc-maintenance-site {
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.44);
  border: 1px solid rgba(148, 163, 184, 0.08);
}

.tc-maintenance-site-state {
  color: rgba(226, 232, 240, 0.84);
}

.tc-maintenance-bar-track {
  height: 8px;
  margin-top: 8px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.66);
  border: 1px solid rgba(148, 163, 184, 0.08);
  overflow: hidden;
}

.tc-maintenance-bar-track-compact {
  height: 6px;
}

.tc-maintenance-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.35s ease;
}

.tc-maintenance-bar-fill-ok {
  background: linear-gradient(90deg, rgba(74, 222, 128, 0.72), rgba(34, 197, 94, 0.92));
}

.tc-maintenance-bar-fill-warn {
  background: linear-gradient(90deg, rgba(251, 191, 36, 0.72), rgba(245, 158, 11, 0.92));
}

.tc-maintenance-bar-fill-danger {
  background: linear-gradient(90deg, rgba(248, 113, 113, 0.74), rgba(239, 68, 68, 0.96));
}

.tc-placeholder-text {
  margin: 12px 0 0;
  font-size: 11px;
  line-height: 1.4;
  color: rgba(226, 232, 240, 0.62);
}

/* Placeholder */

.tc-placeholder-text {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.4;
  color: rgba(191, 219, 254, 0.44);
  font-style: italic;
}

/* Detail modal */

.tc-detail-backdrop {
  position: fixed;
  inset: 0;
  z-index: 45;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(2, 6, 23, 0.56);
  backdrop-filter: blur(4px);
}

.tc-detail-backdrop-standalone {
  background: rgba(2, 6, 23, 0.68);
  backdrop-filter: blur(4px);
}

.tc-detail-modal {
  width: min(520px, calc(100vw - 32px));
  max-height: min(82vh, calc(100vh - 32px));
  overflow-y: auto;
  border-radius: 28px;
  padding: 20px;
  background:
    radial-gradient(circle at top left, rgba(34, 211, 238, 0.12), transparent 34%),
    radial-gradient(circle at 78% 12%, rgba(251, 191, 36, 0.1), transparent 24%),
    linear-gradient(180deg, rgba(5, 10, 19, 0.995), rgba(12, 18, 33, 0.99));
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: 0 34px 80px rgba(2, 6, 23, 0.48);
}

.tc-detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.tc-detail-kicker {
  margin: 0;
  font-size: 9px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(125, 211, 252, 0.82);
}

.tc-detail-title {
  margin: 8px 0 0;
  font-size: 1.35rem;
  font-weight: 700;
  color: #f8fafc;
}

.tc-detail-summary {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(226, 232, 240, 0.72);
}

.tc-detail-close {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.42);
  color: rgba(248, 250, 252, 0.9);
  font-size: 14px;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.tc-detail-close:hover {
  transform: translateY(-1px);
  border-color: rgba(125, 211, 252, 0.28);
  background: rgba(15, 23, 42, 0.62);
}

.tc-detail-pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.tc-detail-action-row {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

.tc-detail-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid rgba(248, 250, 252, 0.16);
  background: rgba(37, 99, 235, 0.2);
  color: #eff6ff;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform .15s, border-color .15s, background .15s;
}

.tc-detail-toggle:hover {
  transform: translateY(-1px);
  border-color: rgba(125, 211, 252, 0.36);
  background: rgba(37, 99, 235, 0.28);
}

.tc-detail-toggle-off {
  background: rgba(245, 158, 11, 0.16);
  color: #fef3c7;
}

.tc-detail-action-copy {
  margin: 0;
  color: rgba(226, 232, 240, 0.78);
  font-size: 0.82rem;
}

.tc-detail-pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(15, 23, 42, 0.52);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(226, 232, 240, 0.78);
}

.tc-detail-pill-ok {
  color: rgba(134, 239, 172, 0.92);
}

.tc-detail-pill-warn {
  color: rgba(253, 224, 71, 0.94);
}

.tc-detail-pill-danger {
  color: rgba(252, 165, 165, 0.94);
}

.tc-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.tc-detail-card,
.tc-detail-flow-card {
  padding: 12px 14px;
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.08);
}

.tc-detail-card-label,
.tc-detail-flow-title,
.tc-detail-section-title {
  margin: 0;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(191, 219, 254, 0.62);
}

.tc-detail-card-value {
  margin-top: 8px;
  font-size: 1rem;
  font-weight: 700;
  color: #f8fafc;
}

.tc-detail-card-copy,
.tc-detail-flow-copy,
.tc-detail-flow-note {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.45;
}

.tc-detail-card-copy,
.tc-detail-flow-copy {
  color: rgba(226, 232, 240, 0.8);
}

.tc-detail-flow-note {
  color: rgba(148, 163, 184, 0.72);
}

.tc-detail-section {
  margin-top: 16px;
}

.tc-detail-flow-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}

.tc-study-picker {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.tc-study-option {
  width: 100%;
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(15, 23, 42, 0.46);
  text-align: left;
  cursor: pointer;
  transition: transform .15s ease, border-color .15s ease, background .15s ease;
}

.tc-study-option:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(125, 211, 252, 0.34);
  background: rgba(37, 99, 235, 0.16);
}

.tc-study-option:disabled {
  cursor: default;
}

.tc-study-option-active {
  border-color: rgba(134, 239, 172, 0.24);
  background: rgba(22, 101, 52, 0.18);
}

.tc-study-option-complete {
  opacity: 0.78;
}

.tc-study-option-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tc-study-option-title {
  color: #f8fafc;
  font-size: 13px;
  font-weight: 700;
}

.tc-detail-condition-card {
  padding: 12px 14px;
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.08);
  margin-top: 10px;
}

.tc-detail-order-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.tc-detail-order-card {
  padding: 12px 14px;
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.08);
}

.tc-detail-order-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.tc-detail-order-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #f8fafc;
}

.tc-detail-order-copy {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: rgba(226, 232, 240, 0.78);
}

.tc-detail-order-note {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.45;
  color: rgba(253, 224, 71, 0.88);
}

.tc-detail-order-button {
  flex-shrink: 0;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid rgba(125, 211, 252, 0.28);
  background: rgba(37, 99, 235, 0.22);
  color: #eff6ff;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: transform .15s ease, border-color .15s ease, background .15s ease;
}

.tc-detail-order-button:hover {
  transform: translateY(-1px);
  border-color: rgba(125, 211, 252, 0.4);
  background: rgba(37, 99, 235, 0.3);
}

.tc-detail-order-button-disabled,
.tc-detail-order-button:disabled {
  cursor: default;
  opacity: 0.7;
  transform: none;
  border-color: rgba(148, 163, 184, 0.16);
  background: rgba(51, 65, 85, 0.4);
  color: rgba(226, 232, 240, 0.72);
}

.tc-detail-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.tc-detail-chip {
  padding: 7px 10px;
  border-radius: 999px;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.14);
  font-size: 11px;
  color: rgba(226, 232, 240, 0.84);
}

.tc-detail-chip-alert {
  background: rgba(127, 29, 29, 0.28);
  border-color: rgba(248, 113, 113, 0.2);
  color: rgba(254, 202, 202, 0.92);
}

.tc-detail-advice-list {
  margin: 10px 0 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tc-detail-advice-item {
  font-size: 12px;
  line-height: 1.5;
  color: rgba(226, 232, 240, 0.78);
}

@media (max-width: 760px) {
  .tc-stat-grid-4,
  .tc-detail-grid,
  .tc-detail-flow-grid,
  .tc-job-list {
    grid-template-columns: 1fr;
  }

  .tc-panel {
    width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
    padding: 18px;
    display: block;
  }

  .tc-section {
    margin-top: 16px;
  }

  .tc-detail-modal {
    width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
    padding: 18px;
  }
}

/* Pulse animation for danger state */

@keyframes tc-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
