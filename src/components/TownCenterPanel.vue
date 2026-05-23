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
      <PanelModalShell
        v-if="!detailOnlyMode"
        as="div"
        class="tc-panel"
        header-label="Settlement"
        :header-title="townCenterTitle"
        header-icon="⌂"
        @close="close"
      >
        <nav class="tc-tab-bar" aria-label="Town center sections">
          <button
            v-for="tab in townCenterTabs"
            :key="tab.key"
            type="button"
            class="tc-tab-button"
            :class="{ 'tc-tab-button-active': activeTownCenterTab === tab.key }"
            @click.stop="activeTownCenterTab = tab.key"
          >
            <span class="tc-tab-glyph" aria-hidden="true">{{ tab.glyph }}</span>
            <span class="tc-tab-copy">
              <span class="tc-tab-label">{{ tab.label }}</span>
              <span class="tc-tab-note">{{ tab.note }}</span>
            </span>
          </button>
        </nav>

        <div v-show="activeTownCenterTab === 'overview'" class="tc-tab-panel tc-tab-panel-overview">
        <div class="tc-section tc-section-progress tc-section-command">
          <div class="tc-section-row">
            <div class="tc-section-title">Command Overview</div>
          </div>
          <div class="tc-stat-grid tc-stat-grid-4">
            <PanelStatCard label="Population" :value="playerPopulation.current" />
            <PanelStatCard label="Explored Tiles" :value="exploredTiles" />
            <PanelStatCard label="Workers" :value="inspectedWorkforce.availableWorkers" />
            <PanelStatCard label="Trade" :value="tradeCharterStatusLabel" />
          </div>
        </div>

        <!-- Population Section -->
        <div class="tc-section tc-section-housing">
          <div class="tc-section-row">
            <div class="tc-section-title">Housing</div>
          </div>
          <div class="tc-stat-grid tc-stat-grid-3">
            <PanelStatCard label="Settlers" :value="playerPopulation.current" />
            <PanelStatCard label="Beds" :value="playerPopulation.beds" />
            <PanelStatCard label="Capacity" :value="playerPopulation.max" />
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
            <PanelStatCard label="Active / Owned" :value="`${playerPopulation.activeTileCount}/${ownedTiles}`" />
            <PanelStatCard label="Support Capacity" :value="playerPopulation.supportCapacity" />
            <PanelStatCard label="Inactive Tiles" :value="playerPopulation.inactiveTileCount" />
          </div>
          <div class="tc-status-row" :class="supportStatusClass">
            <span class="tc-status-dot" :class="supportStatusClass" />
            <span class="tc-status-text">{{ supportStatusText }}</span>
          </div>
        </div>

        <div class="tc-section tc-section-trade">
          <div class="tc-section-row">
            <div class="tc-section-title">Trade Access</div>
            <div class="tc-section-caption">{{ tradeCharterStatusLabel }}</div>
          </div>
          <div class="tc-status-row" :class="tradeCharterStatusClass">
            <span class="tc-status-dot" :class="tradeCharterStatusClass" />
            <span class="tc-status-text">{{ tradeCharterStatusText }}</span>
          </div>
        </div>
        </div>

        <div v-show="activeTownCenterTab === 'defense'" class="tc-tab-panel tc-tab-panel-defense">
        <div class="tc-section tc-section-military tc-section-wide">
          <div class="tc-section-row">
            <div class="tc-section-title">Border Control</div>
            <div class="tc-section-caption">{{ borderCooldownText }}</div>
          </div>
          <div class="tc-stat-grid tc-stat-grid-4">
            <PanelStatCard label="Mode" :value="militarySummary.borderModeLabel" />
            <PanelStatCard label="Reserve Guards" :value="militarySummary.reserveGuards" />
            <PanelStatCard label="Threatened Towers" :value="militarySummary.vulnerableTowerCount" />
            <PanelStatCard label="Raid Target" :value="militarySummary.attackTargetLabel" />
          </div>
          <div class="tc-status-row" :class="militaryStatusClass">
            <span class="tc-status-dot" :class="militaryStatusClass" />
            <span class="tc-status-text">{{ militaryStatusText }}</span>
          </div>
          <div class="tc-detail-chip-row">
            <span
              v-for="tower in militarySummary.vulnerableTowers"
              :key="tower.tileId"
              class="tc-detail-chip tc-detail-chip-alert"
            >
              {{ tower.label }}
            </span>
          </div>
          <div v-if="militarySummary.canManageBorders" class="tc-detail-action-row">
            <button
              class="tc-detail-toggle"
              :class="{ 'tc-detail-toggle-off': militarySummary.borderMode === 'open' }"
              :disabled="militarySummary.borderMode === 'closed' || militarySummary.borderCooldownActive || militarySummary.borderLocked || militarySummary.borderSeasonLocked"
              @click.stop="setBorderMode('closed')"
            >
              Close Borders
            </button>
            <button
              class="tc-detail-toggle"
              :disabled="militarySummary.borderMode === 'open' || militarySummary.borderCooldownActive || militarySummary.borderSeasonLocked"
              @click.stop="setBorderMode('open')"
            >
              Open Borders
            </button>
          </div>
        </div>
        </div>

        <!-- Food Section -->
        <div v-show="activeTownCenterTab === 'economy'" class="tc-tab-panel tc-tab-panel-economy">
        <div class="tc-section tc-section-food">
          <div class="tc-section-row">
            <div class="tc-section-title">Food Supply</div>
          </div>
          <div class="tc-stat-grid">
            <PanelStatCard label="Meals" :value="foodStock" />
            <PanelStatCard label="Per minute" :value="foodPerMinute" />
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
            <PanelStatCard label="Maintained" :value="maintenanceSummary.maintainedCount" />
            <PanelStatCard label="Needs Repair" :value="maintenanceSummary.needsRepairCount" />
            <PanelStatCard label="Offline" :value="maintenanceSummary.offlineCount" />
            <PanelStatCard label="Avg Condition" :value="`${maintenanceSummary.averageCondition}%`" />
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
        </div>

        <!-- Job Sites Section (placeholder) -->
        <div v-show="activeTownCenterTab === 'sites'" class="tc-tab-panel tc-tab-panel-sites">
        <div class="tc-section tc-section-jobs">
          <div class="tc-section-row">
            <div class="tc-section-title">Job Sites</div>
            <div class="tc-section-caption">{{ inspectedWorkforce.assignedWorkers }}/{{ inspectedWorkforce.availableWorkers }} staffed</div>
          </div>
          <div class="tc-stat-grid tc-stat-grid-3">
            <PanelStatCard label="Available" :value="inspectedWorkforce.availableWorkers" />
            <PanelStatCard label="Assigned" :value="inspectedWorkforce.assignedWorkers" />
            <PanelStatCard label="Idle" :value="inspectedWorkforce.idleWorkers" />
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
          <p v-else class="tc-placeholder-text">Build a dock, granary, apiary, bakery, lumber camp, library, or mine to create settler jobs.</p>
        </div>
        </div>
      </PanelModalShell>

      <div
        v-if="selectedJobSiteDetail"
        class="tc-detail-backdrop smooth-modal-backdrop"
        :class="{ 'tc-detail-backdrop-standalone': detailOnlyMode }"
        @click.self="closeJobSiteDetail"
      >
        <PanelModalShell as="div" class="tc-detail-modal" close-title="Close details" close-aria-label="Close building details" @close="closeJobSiteDetail">
          <div class="tc-detail-scroll">
            <div class="tc-detail-header">
              <div>
                <p class="tc-detail-kicker pixel-font">{{ selectedJobSiteDetail.detailKicker }}</p>
                <h4 class="tc-detail-title">{{ selectedJobSiteDetail.label }}</h4>
                <p class="tc-detail-summary">{{ selectedJobSiteDetail.summary }}</p>
              </div>
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

            <div v-if="selectedJobSiteDetail.isJobSite && selectedJobSiteDetail.canManage" class="tc-detail-action-row">
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

            <div v-if="selectedJobSiteDetail.houseDetails" class="tc-detail-section">
              <div class="tc-detail-section-title">Household</div>
              <div class="tc-detail-grid">
                <section class="tc-detail-card">
                  <p class="tc-detail-card-label">Residents</p>
                  <div class="tc-detail-card-value">{{ selectedJobSiteDetail.houseDetails.residentCountLabel }}</div>
                  <p class="tc-detail-card-copy">Settlers assigned to sleep and keep personal goods here.</p>
                </section>
                <section class="tc-detail-card">
                  <p class="tc-detail-card-label">Home Goods</p>
                  <div class="tc-detail-card-value">{{ selectedJobSiteDetail.houseDetails.goodsCapacityLabel }}</div>
                  <p class="tc-detail-card-copy">{{ selectedJobSiteDetail.houseDetails.consumptionLabel }}</p>
                </section>
                <section class="tc-detail-card">
                  <p class="tc-detail-card-label">Home Comfort</p>
                  <div class="tc-detail-card-value">{{ selectedJobSiteDetail.houseDetails.comfortLabel }}</div>
                  <p class="tc-detail-card-copy">{{ selectedJobSiteDetail.houseDetails.comfortCopy }}</p>
                </section>
              </div>

              <div class="tc-house-lists">
                <div>
                  <div v-if="selectedJobSiteDetail.houseDetails.residents.length" class="tc-worker-list">
                    <button
                      v-for="resident in selectedJobSiteDetail.houseDetails.residents"
                      :key="resident.id"
                      type="button"
                      class="tc-worker-row"
                      @click.stop="inspectAssignedWorker(resident.settler)"
                    >
                      <span class="tc-worker-copy">
                        <span class="tc-worker-name">{{ resident.name }}</span>
                        <span class="tc-worker-meta">{{ resident.activityLabel }}</span>
                      </span>
                      <span class="tc-worker-progress">{{ resident.happinessLabel }}</span>
                    </button>
                  </div>
                  <p v-else class="tc-placeholder-text tc-worker-empty">No residents assigned to this house yet.</p>
                </div>

                <div class="tc-house-good-list">
                  <div
                    v-for="good in selectedJobSiteDetail.houseDetails.goods"
                    :key="good.type"
                    class="tc-house-good-row"
                    :class="{ 'tc-house-good-row-empty': !good.stocked }"
                  >
                    <span class="tc-house-good-icon" aria-hidden="true">{{ good.icon }}</span>
                    <span class="tc-house-good-copy">
                      <span class="tc-house-good-title">{{ good.label }} · {{ good.amount }}</span>
                      <span class="tc-house-good-effect">{{ good.effectLabel }}</span>
                      <span class="tc-house-good-note">{{ good.note }}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="selectedJobSiteDetail.watchtowerDetails" class="tc-detail-section">
              <div class="tc-detail-section-title">Border Tower</div>
              <div class="tc-detail-grid">
                <section class="tc-detail-card">
                  <p class="tc-detail-card-label">State</p>
                  <div class="tc-detail-card-value">{{ selectedJobSiteDetail.watchtowerDetails.stateLabel }}</div>
                  <p class="tc-detail-card-copy">{{ selectedJobSiteDetail.watchtowerDetails.borderLabel }}</p>
                </section>
                <section class="tc-detail-card">
                  <p class="tc-detail-card-label">Durability</p>
                  <div class="tc-detail-card-value">{{ selectedJobSiteDetail.watchtowerDetails.durabilityPercent }}%</div>
                  <p class="tc-detail-card-copy">{{ selectedJobSiteDetail.watchtowerDetails.captureLabel }}</p>
                </section>
                <section class="tc-detail-card">
                  <p class="tc-detail-card-label">Guards</p>
                  <div class="tc-detail-card-value">{{ selectedJobSiteDetail.watchtowerDetails.assignedGuards }}</div>
                  <p class="tc-detail-card-copy">{{ selectedJobSiteDetail.watchtowerDetails.reserveLabel }}</p>
                </section>
                <section class="tc-detail-card">
                  <p class="tc-detail-card-label">Walls</p>
                  <div class="tc-detail-card-value">{{ selectedJobSiteDetail.watchtowerDetails.wallLabel }}</div>
                  <p class="tc-detail-card-copy">{{ selectedJobSiteDetail.watchtowerDetails.attackLabel }}</p>
                </section>
              </div>
              <div class="tc-detail-action-row" v-if="selectedJobSiteDetail.watchtowerDetails.canAssignGuards">
                <button
                  class="tc-detail-toggle"
                  :disabled="selectedJobSiteDetail.watchtowerDetails.assignedGuards <= 0"
                  @click.stop="adjustTowerGuards(selectedJobSiteDetail.tileId, -1)"
                >
                  Remove Guard
                </button>
                <button
                  class="tc-detail-toggle"
                  :disabled="selectedJobSiteDetail.watchtowerDetails.reserveGuards <= 0"
                  @click.stop="adjustTowerGuards(selectedJobSiteDetail.tileId, 1)"
                >
                  Assign Guard
                </button>
              </div>
              <div class="tc-detail-action-row" v-if="selectedJobSiteDetail.watchtowerDetails.canBuildPalisade">
                <button class="tc-detail-toggle" @click.stop="buildWatchtowerPalisade(selectedJobSiteDetail.tileId)">
                  Build Wooden Palisade
                </button>
                <p class="tc-detail-action-copy">Adds a wooden wall ring that slows capture and buys response time.</p>
              </div>
              <div class="tc-detail-action-row" v-if="selectedJobSiteDetail.watchtowerDetails.canToggleRaid">
                <button class="tc-detail-toggle" @click.stop="toggleRaidTarget(selectedJobSiteDetail.tileId)">
                  {{ selectedJobSiteDetail.watchtowerDetails.raidButtonLabel }}
                </button>
                <p class="tc-detail-action-copy">{{ selectedJobSiteDetail.watchtowerDetails.raidCopy }}</p>
              </div>
            </div>

            <div v-if="selectedJobSiteDetail.barracksDetails" class="tc-detail-section">
              <div class="tc-detail-section-title">Guard Training</div>
              <div class="tc-detail-grid">
                <section class="tc-detail-card">
                  <p class="tc-detail-card-label">Reserve</p>
                  <div class="tc-detail-card-value">{{ selectedJobSiteDetail.barracksDetails.reserveGuards }}</div>
                  <p class="tc-detail-card-copy">Available for tower defense or border raids.</p>
                </section>
                <section class="tc-detail-card">
                  <p class="tc-detail-card-label">Weapons</p>
                  <div class="tc-detail-card-value">{{ selectedJobSiteDetail.barracksDetails.weapons }}</div>
                  <p class="tc-detail-card-copy">Each recruit consumes 1 weapon and 2 meals.</p>
                </section>
                <section class="tc-detail-card">
                  <p class="tc-detail-card-label">Queue</p>
                  <div class="tc-detail-card-value">{{ selectedJobSiteDetail.barracksDetails.queue }}</div>
                  <p class="tc-detail-card-copy">{{ selectedJobSiteDetail.barracksDetails.progressLabel }}</p>
                </section>
              </div>
              <div class="tc-maintenance-bar-track">
                <div class="tc-maintenance-bar-fill tc-maintenance-bar-fill-ok" :style="{ width: `${selectedJobSiteDetail.barracksDetails.progressPercent}%` }" />
              </div>
              <div class="tc-detail-action-row" v-if="selectedJobSiteDetail.barracksDetails.canTrain">
                <button class="tc-detail-toggle" @click.stop="queueGuardTraining(selectedJobSiteDetail.tileId)">
                  Train Guard
                </button>
                <p class="tc-detail-action-copy">Queues one guard. Training finishes once the barracks can draw both weapons and meals from storage.</p>
              </div>
            </div>

            <div v-if="selectedJobSiteDetail.harborDetails" class="tc-detail-section">
              <div class="tc-detail-section-title">Ship Loading</div>
              <div class="tc-detail-grid">
                <section class="tc-detail-card">
                  <p class="tc-detail-card-label">Route</p>
                  <div class="tc-detail-card-value">{{ selectedJobSiteDetail.harborDetails.statusLabel }}</div>
                  <p class="tc-detail-card-copy">{{ selectedJobSiteDetail.harborDetails.routeLabel }}</p>
                </section>
                <section class="tc-detail-card">
                  <p class="tc-detail-card-label">Cargo</p>
                  <div class="tc-detail-card-value">{{ selectedJobSiteDetail.harborDetails.timingLabel }}</div>
                  <p class="tc-detail-card-copy">{{ selectedJobSiteDetail.harborDetails.cargoLabel }}</p>
                </section>
              </div>
              <div v-if="selectedJobSiteDetail.harborDetails.progressPercent !== null" class="tc-detail-condition-card">
                <div class="tc-detail-flow-main">
                  <p class="tc-detail-flow-copy">{{ selectedJobSiteDetail.harborDetails.progressLabel }}</p>
                  <p class="tc-detail-flow-note">{{ selectedJobSiteDetail.harborDetails.rewardLabel }}</p>
                </div>
                <span class="tc-detail-pill tc-detail-pill-ok">{{ selectedJobSiteDetail.harborDetails.progressPercent }}%</span>
                <div class="tc-maintenance-bar-track">
                  <div class="tc-maintenance-bar-fill tc-maintenance-bar-fill-ok" :style="{ width: `${selectedJobSiteDetail.harborDetails.progressPercent}%` }" />
                </div>
              </div>
              <div class="tc-detail-action-row">
                <button class="tc-detail-toggle" @click.stop="openShipLoadingPanel">
                  {{ selectedJobSiteDetail.harborDetails.buttonLabel }}
                </button>
                <p class="tc-detail-action-copy">{{ selectedJobSiteDetail.harborDetails.buttonCopy }}</p>
              </div>
            </div>

            <div v-if="selectedJobSiteDetail.tradeCenterDetails" class="tc-detail-section">
              <div class="tc-detail-section-title">Trade Center</div>
              <div class="tc-detail-grid">
                <section class="tc-detail-card">
                  <p class="tc-detail-card-label">Access</p>
                  <div class="tc-detail-card-value">{{ selectedJobSiteDetail.tradeCenterDetails.accessLabel }}</div>
                  <p class="tc-detail-card-copy">{{ selectedJobSiteDetail.tradeCenterDetails.accessCopy }}</p>
                </section>
                <section class="tc-detail-card">
                  <p class="tc-detail-card-label">Market</p>
                  <div class="tc-detail-card-value">{{ selectedJobSiteDetail.tradeCenterDetails.marketLabel }}</div>
                  <p class="tc-detail-card-copy">{{ selectedJobSiteDetail.tradeCenterDetails.stockLabel }}</p>
                </section>
              </div>
              <div class="tc-detail-action-row">
                <button
                  class="tc-detail-toggle"
                  :disabled="!selectedJobSiteDetail.tradeCenterDetails.canOpenMarket"
                  @click.stop="openTradeCenter"
                >
                  Open Trade Center
                </button>
                <p class="tc-detail-action-copy">{{ selectedJobSiteDetail.tradeCenterDetails.buttonCopy }}</p>
              </div>
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

            <div v-if="selectedJobSiteDetail.isJobSite" class="tc-detail-section">
              <div class="tc-detail-section-title">Assigned Workers</div>
              <div v-if="selectedJobSiteDetail.assignedWorkerDetails.length" class="tc-worker-list">
                <button
                  v-for="worker in selectedJobSiteDetail.assignedWorkerDetails"
                  :key="worker.id"
                  type="button"
                  class="tc-worker-row"
                  @click.stop="inspectAssignedWorker(worker.settler)"
                >
                  <span class="tc-worker-copy">
                    <span class="tc-worker-name">{{ worker.name }}</span>
                    <span class="tc-worker-meta">{{ worker.activityLabel }} · {{ worker.statusLabel }}</span>
                  </span>
                  <span class="tc-worker-progress">{{ worker.progressLabel }}</span>
                </button>
              </div>
              <p v-else class="tc-placeholder-text tc-worker-empty">No workers assigned.</p>
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
                      :disabled="study.completed || study.active || !study.canSelect"
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
                        <PanelActionButton
                          class="tc-detail-order-button"
                          size="small"
                          variant="secondary"
                          :disabled="!action.unlocked"
                          @click.stop="startBuildingAction(selectedJobSiteDetail.tileId, action.definition)"
                        >
                          {{ !action.unlocked ? 'Locked' : (selectedHero ? 'Send Hero' : 'Select Hero') }}
                        </PanelActionButton>
                      </div>
                      <div v-if="action.costs.length" class="tc-detail-chip-row">
                        <span
                          v-for="resource in action.costs"
                          :key="`${action.key}:${resource.type}`"
                          class="tc-detail-chip"
                          :class="{ 'tc-detail-chip-alert': getRequirementWarehouseAmount(resource.type) < resource.amount }"
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
        </PanelModalShell>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import type { ResourceAmount, ResourceType } from '../core/types/Resource.ts';
import type { Tile, TileConditionState } from '../core/types/Tile.ts';
import type { Hero } from '../core/types/Hero.ts';
import type { TaskDefinition } from '../core/types/Task.ts';
import type { Settler } from '../core/types/Settler.ts';
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
import { getSettlerDisplayName } from '../shared/game/settlerNames.ts';
import {
  GUARD_TRAINING_DURATION_MS,
  getAvailableGuardReserve,
  getEffectiveSettlementBorderMode,
  getSettlementBorderMode,
  getWatchtowerDurabilityPercent,
  isBarracksTile,
  isProtectedByTownCenter,
  isWatchtowerTile,
  resolveWatchtowerConflictState,
} from '../shared/game/military.ts';
import { getGuardTrainingSpeedMultiplier, testModeSettings } from '../shared/game/testMode.ts';
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
import { getStudyStateForSettlement, studyState, studyVersion } from '../store/clientStudyStore';
import { getSettlementResourceInventory, resourceInventory, resourceVersion, storageInventories } from '../store/resourceStore';
import { runSnapshot } from '../store/runStore';
import { seasonSnapshot } from '../store/seasonStore.ts';
import { settlers, settlerVersion } from '../store/settlerStore';
import { getSelectedHero, openSettlerModal } from '../store/uiStore';
import { detachHeroFromCurrentTask } from '../store/taskStore.ts';
import { addNotification } from '../store/notificationStore';
import { canControlHero, getHeroOwnerName, getPlayerEntities } from '../store/playerStore';
import { sendMessage } from '../core/socket';
import { currentPlayerId } from '../core/socket';
import { currentPlayerSettlementId, settlementStartMarkers } from '../store/settlementStartStore.ts';
import { closeWindow, isWindowActive, openWindow, WINDOW_IDS } from '../core/windowManager';
import { getTileSettlementId, isTileInSettlement } from '../shared/game/settlement';
import { hasSettlementMarketAccess, isTradeCenterTile } from '../shared/game/marketAccess.ts';
import { marketOverview, openMarketplace } from '../store/marketStore.ts';
import { openShipOrderPanel, shipOrderOverview } from '../store/shipOrderStore.ts';
import PanelModalShell from './ui/PanelModalShell.vue';
import PanelActionButton from './ui/PanelActionButton.vue';
import PanelIconBanner from './ui/PanelIconBanner.vue';
import PanelStatCard from './ui/PanelStatCard.vue';
import {
  FOOD_PER_SETTLER_PER_MINUTE,
  HUNGER_GRACE_MINUTES,
} from '../store/populationStore';
import {
  TRADE_GOOD_TYPES,
  getHungerFoodMealValue,
  getResourceDefinition,
  getResourceRequirementStock,
  getTradeGoodHappinessGain,
} from '../shared/game/resourceDefinitions.ts';

interface Props {
  visible: boolean;
  townCenterTileId?: string | null;
  standaloneBuildingTileId?: string | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'close'): void;
}>();

const selectedJobSiteId = ref<string | null>(null);
const detailOnlyMode = ref(false);
const pathService = new PathService();
type TownCenterTabKey = 'overview' | 'economy' | 'defense' | 'sites';
const activeTownCenterTab = ref<TownCenterTabKey>('overview');

const inspectedSettlementId = computed(() => props.townCenterTileId ?? currentPlayerSettlementId.value);

const townCenterOwner = computed(() => {
  const townCenterId = inspectedSettlementId.value;
  if (!townCenterId) {
    return null;
  }

  const player = getPlayerEntities.value.find((entry) => entry.settlementId === townCenterId);
  if (player) {
    return {
      playerId: player.id,
      playerName: player.nickname,
    };
  }

  const marker = settlementStartMarkers.value.find((entry) => entry.settlementId === townCenterId);
  if (marker?.playerId || marker?.playerName) {
    return {
      playerId: marker.playerId ?? null,
      playerName: marker.playerName ?? null,
    };
  }

  return null;
});

const townCenterTitle = computed(() => {
  const townCenterId = inspectedSettlementId.value;
  if (townCenterId && townCenterId === currentPlayerSettlementId.value) {
    return 'Your towncenter';
  }

  const owner = townCenterOwner.value;
  if (owner?.playerId && owner.playerId === currentPlayerId.value) {
    return 'Your towncenter';
  }

  if (owner?.playerName) {
    return `${owner.playerName}'s towncenter`;
  }

  return 'Town Center';
});

const playerPopulation = computed(() => {
  const settlementId = inspectedSettlementId.value;
  return settlementId
    ? populationState.settlements.find((settlement) => settlement.settlementId === settlementId) ?? populationState
    : populationState;
});

const playerInventory = computed(() => {
  void resourceVersion.value;
  const settlementId = inspectedSettlementId.value;
  return settlementId ? getSettlementResourceInventory(settlementId) : resourceInventory;
});

const playerTiles = computed(() => {
  const settlementId = inspectedSettlementId.value;
  return Object.values(tileIndex).filter((tile) => !settlementId || tile.ownerSettlementId === settlementId || tile.controlledBySettlementId === settlementId);
});

const inspectedTownCenterTile = computed(() => {
  const settlementId = inspectedSettlementId.value;
  return settlementId ? tileIndex[settlementId] ?? null : null;
});

const tradeCenterTiles = computed(() => {
  void worldVersion.value;
  const settlementId = inspectedSettlementId.value;
  return playerTiles.value.filter((tile) => isTradeCenterTile(tile) && getTileSettlementId(tile) === settlementId);
});
const marketAccessReady = computed(() => {
  void worldVersion.value;
  const settlementId = inspectedSettlementId.value;
  return hasSettlementMarketAccess(settlementId);
});
const tradeCharterStatusLabel = computed(() => (
  marketAccessReady.value
    ? 'Open'
    : tradeCenterTiles.value.length > 0
      ? 'Ready'
      : 'Locked'
));
const tradeCharterStatusClass = computed(() => (
  marketAccessReady.value
    ? 'tc-status-ok'
    : tradeCenterTiles.value.length > 0
      ? 'tc-status-warn'
      : 'tc-status-muted'
));
const tradeCharterStatusText = computed(() => {
  if (marketAccessReady.value) {
    return 'This settlement can trade through the global market.';
  }

  if (tradeCenterTiles.value.length > 0) {
    return 'Inspect the Trade Center to open settlement trading.';
  }

  return 'Build a Trade Center to unlock settlement trading.';
});

const currentPlayerTownCenterTile = computed(() => {
  const settlementId = currentPlayerSettlementId.value;
  return settlementId ? tileIndex[settlementId] ?? null : null;
});

const playerSettlers = computed(() => {
  const settlementId = inspectedSettlementId.value;
  return settlementId ? settlers.filter((settler) => settler.settlementId === settlementId) : settlers;
});

function storageBelongsToCurrentSettlement(storageTileId: string) {
  const settlementId = inspectedSettlementId.value;
  if (!settlementId) return true;

  const tile = tileIndex[storageTileId];
  return isTileInSettlement(tile, settlementId);
}

function canManageTile(tile: Pick<Tile, 'id' | 'terrain' | 'ownerSettlementId' | 'controlledBySettlementId'> | null | undefined) {
  const settlementId = currentPlayerSettlementId.value;
  if (!tile || !settlementId) {
    return false;
  }

  if (tile.terrain === 'towncenter') {
    return getTileSettlementId(tile) === settlementId;
  }

  if (tile.ownerSettlementId) {
    return tile.ownerSettlementId === settlementId;
  }

  return tile.controlledBySettlementId === settlementId;
}

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
  if (!canManageTile(tileIndex[tileId] ?? null)) {
    addNotification({
      type: 'settlement',
      title: 'Foreign site',
      message: 'You can inspect this site, but only its owner can change it.',
      duration: 2600,
    });
    return;
  }

  sendMessage({
    type: 'jobs:set_site_enabled',
    tileId,
    enabled,
    timestamp: Date.now(),
  });
}

function selectStudy(studyKey: string) {
  const settlementId = inspectedSettlementId.value;
  if (!settlementId || settlementId !== currentPlayerSettlementId.value) {
    addNotification({
      type: 'settlement',
      title: 'Foreign library',
      message: 'You can inspect this library, but only its owner can choose research here.',
      duration: 2600,
    });
    return;
  }

  sendMessage({
    type: 'studies:set_active',
    studyKey,
    settlementId,
    timestamp: Date.now(),
  });
}

function setBorderMode(borderMode: 'open' | 'closed') {
  const settlementId = inspectedSettlementId.value;
  if (!settlementId) {
    return;
  }

  sendMessage({
    type: 'settlement:set_border_mode',
    settlementId,
    borderMode,
    timestamp: Date.now(),
  });
}

function queueGuardTraining(barracksTileId: string, quantity: number = 1) {
  sendMessage({
    type: 'military:queue_guard_training',
    barracksTileId,
    quantity,
    timestamp: Date.now(),
  });
}

function adjustTowerGuards(tileId: string, delta: number) {
  sendMessage({
    type: 'military:assign_guards',
    tileId,
    delta,
    timestamp: Date.now(),
  });
}

function buildWatchtowerPalisade(tileId: string) {
  sendMessage({
    type: 'military:build_palisade',
    tileId,
    timestamp: Date.now(),
  });
}

function toggleRaidTarget(tileId: string) {
  const settlementId = currentPlayerSettlementId.value;
  const currentTarget = currentPlayerTownCenterTile.value?.raidTargetTileId ?? null;
  if (!settlementId) {
    return;
  }

  sendMessage({
    type: 'military:set_raid_target',
    settlementId,
    targetTileId: currentTarget === tileId ? null : tileId,
    timestamp: Date.now(),
  });
}

function formatNumber(value: number) {
  return `${Math.floor(value)}`;
}

function formatTitleCase(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

function formatCountdown(ms: number | null | undefined) {
  const remainingMs = Math.max(0, (ms ?? 0) - Date.now());
  if (remainingMs <= 0) {
    return 'Ready now';
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatBorderModeLabel(mode: 'open' | 'closed' | null | undefined) {
  return mode === 'open' ? 'Open' : 'Closed';
}

function formatWatchtowerStateLabel(state: string | null | undefined) {
  switch (state) {
    case 'under_attack':
      return 'Under attack';
    case 'contested':
      return 'Contested';
    case 'damaged':
      return 'Damaged';
    case 'disabled':
      return 'Disabled';
    case 'captured':
      return 'Captured';
    case 'active':
    default:
      return 'Active';
  }
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

function formatAlternativeResourceList(resources: ResourceAmount[], emptyText: string) {
  if (!resources.length) {
    return emptyText;
  }

  return resources
    .map((resource) => `${formatNumber(resource.amount)} ${formatResourceType(resource.type)}`)
    .join(' or ');
}

function formatAlternativeRateList(resources: ResourceAmount[], emptyText: string) {
  if (!resources.length) {
    return emptyText;
  }

  return resources
    .map((resource) => `${formatNumber(resource.amount)} ${formatResourceType(resource.type)}/min`)
    .join(' or ');
}

function formatAssignedWorkerStatus(settler: Settler) {
  const blocker = formatSettlerBlocker(settler.blockerReason);
  if (blocker) {
    return blocker;
  }

  switch (settler.activity) {
    case 'working':
      return 'Working this site';
    case 'commuting_work':
      return 'Heading to site';
    case 'fetching_input':
      return 'Fetching supplies';
    case 'delivering':
      return 'Delivering output';
    case 'waiting':
      return 'Waiting for work';
    case 'sleeping':
      return 'Off shift at home';
    case 'fetching_food':
      return 'Fetching food';
    default:
      return 'Assigned to this site';
  }
}

function formatAssignedWorkerProgress(settler: Settler, cycleMs: number | undefined) {
  if (!cycleMs || cycleMs <= 0) {
    return 'Assigned';
  }

  const progress = Math.max(0, Math.min(settler.workProgressMs, cycleMs));
  return `${Math.round((progress / cycleMs) * 100)}%`;
}

function getAssignedWorkerDetails(tileId: string, cycleMs: number | undefined) {
  return playerSettlers.value
    .filter((settler) => settler.assignedRole === 'job' && settler.assignedWorkTileId === tileId)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((settler) => ({
      id: settler.id,
      settler,
      name: getSettlerDisplayName(settler.id, settler.nameSeed, settler.gender),
      activityLabel: formatTitleCase(settler.activity),
      statusLabel: formatAssignedWorkerStatus(settler),
      progressLabel: formatAssignedWorkerProgress(settler, cycleMs),
    }));
}

function getHouseResidentDetails(tileId: string) {
  return playerSettlers.value
    .filter((settler) => settler.homeTileId === tileId)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((settler) => ({
      id: settler.id,
      settler,
      name: getSettlerDisplayName(settler.id, settler.nameSeed, settler.gender),
      activityLabel: formatTitleCase(settler.activity),
      happinessLabel: `${Math.round(settler.happiness)} happiness`,
    }));
}

function getHouseGoodDetails(tile: { houseGoods?: Partial<Record<ResourceType, number>> } | null | undefined, capacity = 0) {
  const stockedTotal = TRADE_GOOD_TYPES.reduce((sum, resourceType) => sum + Math.max(0, tile?.houseGoods?.[resourceType] ?? 0), 0);
  const isFull = capacity > 0 && stockedTotal >= capacity;
  return TRADE_GOOD_TYPES.map((resourceType) => {
    const definition = getResourceDefinition(resourceType);
    const amount = Math.max(0, tile?.houseGoods?.[resourceType] ?? 0);
    const happinessGain = getTradeGoodHappinessGain(resourceType);
    return {
      type: resourceType,
      icon: definition.icon,
      label: definition.label,
      amount,
      stocked: amount > 0,
      effectLabel: happinessGain > 0 ? `+${happinessGain} happiness when used` : 'Comfort good',
      note: amount > 0
        ? 'Residents will not buy another while this home still has one stocked.'
        : isFull
          ? 'Storage is full; residents will wait until another good is used.'
          : 'Can be bought at a staffed shop when trade goods are in storage.',
    };
  });
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

function getRequirementWarehouseAmount(type: ResourceType) {
  return Math.floor(getResourceRequirementStock(playerInventory.value, type));
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
  const unlockStatus = getTaskUnlockStatus(def.key, inspectedSettlementId.value);
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

const ownedTiles = computed(() => playerPopulation.value.activeTileCount + playerPopulation.value.inactiveTileCount);

// --- Population ---

const populationStatusClass = computed(() => {
  if (playerPopulation.value.hungerMs > 0) return 'tc-status-danger';
  if (playerPopulation.value.beds <= 0) return 'tc-status-warn';
  if (playerPopulation.value.current >= playerPopulation.value.max) return 'tc-status-warn';
  if (playerPopulation.value.current >= playerPopulation.value.beds) return 'tc-status-warn';
  return 'tc-status-ok';
});

const populationStatusText = computed(() => {
  if (playerPopulation.value.hungerMs > 0) {
    const graceMs = HUNGER_GRACE_MINUTES * 60_000;
    const remaining = Math.max(0, graceMs - playerPopulation.value.hungerMs);
    const remainingSec = Math.ceil(remaining / 1000);
    const min = Math.floor(remainingSec / 60);
    const sec = remainingSec % 60;
    return `Starving — ${min}:${String(sec).padStart(2, '0')} until settler lost`;
  }
  if (playerPopulation.value.beds <= 0) {
    return 'No beds — build houses to attract settlers';
  }
  if (playerPopulation.value.current >= playerPopulation.value.max) {
    return 'At TC capacity — build another town center';
  }
  if (playerPopulation.value.current >= playerPopulation.value.beds) {
    return 'All beds full — build houses to grow';
  }
  const effectiveCap = Math.min(playerPopulation.value.max, playerPopulation.value.beds);
  const slots = effectiveCap - playerPopulation.value.current;
  return `Growing — ${slots} bed${slots !== 1 ? 's' : ''} available`;
});

const supportStatusClass = computed(() => {
  if (playerPopulation.value.pressureState === 'collapsing') return 'tc-status-danger';
  if (playerPopulation.value.pressureState === 'strained') return 'tc-status-warn';
  return 'tc-status-ok';
});

const supportStatusText = computed(() => {
  switch (playerPopulation.value.pressureState) {
    case 'collapsing':
      return `Collapsing — ${playerPopulation.value.inactiveTileCount} tile${playerPopulation.value.inactiveTileCount === 1 ? '' : 's'} offline`;
    case 'strained':
      return `Strained — fringe tiles are at risk, restore support before expanding again`;
    case 'stable':
    default:
      if (ownedTiles.value <= 0) {
        return 'Stable — claim more territory to build a larger district';
      }
      return `Stable — ${playerPopulation.value.activeTileCount} of ${ownedTiles.value} owned tiles remain online`;
  }
});

const completedStudyKeys = computed(() => new Set(studyState.completedStudyKeys));

const militarySummary = computed(() => {
  void worldVersion.value;
  const townCenter = inspectedTownCenterTile.value;
  const watchtowers = playerTiles.value.filter((tile) => isWatchtowerTile(tile));
  const vulnerableTowers = watchtowers
    .filter((tile) => (tile.towerCaptureProgress ?? 0) > 0 || !!tile.towerAttackerSettlementId)
    .map((tile) => ({
      tileId: tile.id,
      label: `${getStructureLabel(tile.id)} ${Math.round(tile.towerCaptureProgress ?? 0)}%`,
    }));

  return {
    borderMode: getEffectiveSettlementBorderMode(townCenter, seasonSnapshot.value),
    borderModeLabel: formatBorderModeLabel(getEffectiveSettlementBorderMode(townCenter, seasonSnapshot.value)),
    storedBorderMode: getSettlementBorderMode(townCenter),
    reserveGuards: getAvailableGuardReserve(townCenter),
    committedRaiders: Math.max(0, townCenter?.raidCommittedGuards ?? 0),
    vulnerableTowerCount: vulnerableTowers.length,
    vulnerableTowers,
    attackTargetLabel: !townCenter?.raidTargetTileId
      ? 'None'
      : townCenter.raidBlockedReason
        ? 'Blocked'
        : (townCenter.raidCommittedGuards ?? 0) > 0
          ? `${Math.max(0, townCenter.raidCommittedGuards ?? 0)} marching`
          : 'Active',
    attackTargetTileId: townCenter?.raidTargetTileId ?? null,
    raidBlockedReason: townCenter?.raidBlockedReason ?? null,
    borderCooldownActive: (townCenter?.borderModeCooldownUntilMs ?? 0) > Date.now(),
    borderLocked: (townCenter?.borderLockedUntilMs ?? 0) > Date.now(),
    borderSeasonLocked: seasonSnapshot.value?.status === 'active'
      && seasonSnapshot.value.config.stages.find((stage) => stage.key === seasonSnapshot.value?.currentStage)?.borderPolicy !== 'player_choice',
    canManageBorders: currentPlayerSettlementId.value === inspectedSettlementId.value && completedStudyKeys.value.has('border_management'),
  };
});

const borderCooldownText = computed(() => {
  const townCenter = inspectedTownCenterTile.value;
  if (militarySummary.value.borderSeasonLocked) {
    return `Season locked ${militarySummary.value.borderModeLabel} (effective)`;
  }
  const cooldownUntil = townCenter?.borderModeCooldownUntilMs ?? 0;
  if (cooldownUntil > Date.now()) {
    return `Cooldown ${formatCountdown(cooldownUntil)}`;
  }

  if ((townCenter?.borderLockedUntilMs ?? 0) > Date.now()) {
    return `Contested ${formatCountdown(townCenter?.borderLockedUntilMs ?? 0)}`;
  }

  return 'Policy ready';
});

const militaryStatusClass = computed(() => {
  if (militarySummary.value.vulnerableTowerCount > 0) {
    return 'tc-status-danger';
  }

  if (militarySummary.value.borderMode === 'open') {
    return 'tc-status-warn';
  }

  return 'tc-status-ok';
});

const militaryStatusText = computed(() => {
  if (militarySummary.value.vulnerableTowerCount > 0) {
    return 'Threatened — reinforce exposed towers before the border collapses.';
  }

  if (militarySummary.value.borderMode === 'open') {
    if (militarySummary.value.raidBlockedReason) {
      return `Open borders — ${militarySummary.value.raidBlockedReason}`;
    }
    return militarySummary.value.attackTargetTileId
      ? 'Open borders — a guard squad is currently marching or fighting at the selected watchtower.'
      : 'Open borders — your outer towers can now be attacked or used for raids.';
  }

  return 'Closed borders — your settlement is protected from border conflict.';
});

// --- Food ---

const foodStock = computed(() => {
  // Force reactivity on resourceVersion
  void resourceVersion.value;
  return Math.floor(getHungerFoodMealValue(playerInventory.value));
});

const foodPerMinute = computed(() => {
  return playerPopulation.value.current * FOOD_PER_SETTLER_PER_MINUTE;
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
  if (playerPopulation.value.current <= 0) return 'No settlers to feed';
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
  return getMaintenanceOverview(playerTiles.value, playerSettlers.value, playerInventory.value);
});

const maintenanceStatusClass = computed(() => {
  if (maintenanceSummary.value.tone === 'danger') return 'tc-status-danger';
  if (maintenanceSummary.value.tone === 'warn') return 'tc-status-warn';
  return 'tc-status-ok';
});

// --- Jobs ---

const totalFreeStorage = computed(() => {
  void resourceVersion.value;
  return Object.values(storageInventories).filter((storage) => storageBelongsToCurrentSettlement(storage.tileId)).reduce((sum, storage) => {
    const used = Object.values(storage.resources).reduce((resourceSum, amount) => resourceSum + (amount ?? 0), 0);
    return sum + Math.max(0, storage.capacity - used);
  }, 0);
});

const jobSites = computed(() => {
  void worldVersion.value;
  return workforceState.sites.filter((site) => {
    const settlementId = inspectedSettlementId.value;
    const tile = tileIndex[site.tileId] ?? null;
    return !settlementId || tile?.ownerSettlementId === settlementId || tile?.controlledBySettlementId === settlementId;
  }).map((site) => {
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

const inspectedWorkforce = computed(() => {
  const assignedWorkers = jobSites.value.reduce((sum, site) => sum + site.assignedWorkers, 0);
  const availableWorkers = playerPopulation.value.current;
  return {
    availableWorkers,
    assignedWorkers,
    idleWorkers: Math.max(0, availableWorkers - assignedWorkers),
  };
});

const selectedJobSiteDetail = computed(() => {
  void worldVersion.value;
  void studyVersion.value;
  void settlerVersion.value;
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
  const buildingServiceInputs = building?.jobKind === 'service'
    ? (building.serviceConsumes ?? []).map((resource) => ({
      ...resource,
      amount: resource.amount * Math.max(1, currentWorkerCount || 1),
    }))
    : [];
  const buildingFullServiceInputs = building?.jobKind === 'service'
    ? (building.serviceConsumes ?? []).map((resource) => ({
      ...resource,
      amount: resource.amount * Math.max(1, fullWorkerCount || 1),
    }))
    : [];
  const acceptsAnyServiceInput = building?.jobKind === 'service' && building.serviceConsumeMode === 'any';
  const { consumes: currentInputs, produces: currentOutputs } = building
    ? resolveBuildingJobResources(building, tile, currentWorkerCount)
    : { consumes: [], produces: [] };
  const { consumes: fullInputs, produces: fullOutputs } = building
    ? resolveBuildingJobResources(building, tile, fullWorkerCount)
    : { consumes: [], produces: [] };
  const resolvedCurrentInputs = building?.jobKind === 'service' ? buildingServiceInputs : currentInputs;
  const resolvedFullInputs = building?.jobKind === 'service' ? buildingFullServiceInputs : fullInputs;
  const currentInputRates = building ? getPerMinuteResources(resolvedCurrentInputs, 1, building.cycleMs) : [];
  const currentOutputRates = building ? getPerMinuteResources(currentOutputs, 1, building.cycleMs) : [];
  const fullOutputRates = building ? getPerMinuteResources(fullOutputs, 1, building.cycleMs) : [];
  const shortages = !building
    ? []
    : acceptsAnyServiceInput
      ? resolvedCurrentInputs.some((resource) => (playerInventory.value[resource.type] ?? 0) >= resource.amount)
        ? []
        : [{
          type: resolvedCurrentInputs[0]?.type ?? 'beer',
          required: resolvedCurrentInputs[0]?.amount ?? 1,
          available: 0,
          missing: resolvedCurrentInputs[0]?.amount ?? 1,
        }]
      : getMissingInputResources(resolvedCurrentInputs, 1, playerInventory.value);
  const conditionPercent = typeof tile?.condition === 'number' ? Math.round(tile.condition) : null;
  const conditionState = conditionPercent !== null ? tile?.conditionState ?? 'healthy' : null;
  const repairResources = tile ? building?.repairResources ?? [] : [];
  const repairNeeded = conditionPercent !== null ? Math.max(0, 100 - conditionPercent) : 0;
  const repairShortages = getMissingInputResources(repairResources, 1, playerInventory.value);
  const tileStudyState = getStudyStateForSettlement(getTileSettlementId(tile));
  const activeStudy = building?.key === 'library'
    ? (tileStudyState.studies.find((study) => study.active) ?? null)
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
        progressLabel: `${tileStudyState.completedStudyKeys.length} completed`,
        percent: 100,
        unlocks: [],
      }
      : null);
  const studyOptions = building?.key === 'library'
    ? tileStudyState.studies.map((study) => {
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
        canSelect: getTileSettlementId(tile) === currentPlayerSettlementId.value,
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
        current: playerPopulation.value.current,
        max: playerPopulation.value.max,
        beds: playerPopulation.value.beds,
        hungerMs: playerPopulation.value.hungerMs,
        pressureState: playerPopulation.value.pressureState,
        inactiveTileCount: playerPopulation.value.inactiveTileCount,
      },
      workforce: {
        availableWorkers: inspectedWorkforce.value.availableWorkers,
        idleWorkers: inspectedWorkforce.value.idleWorkers,
      },
      resourceInventory: playerInventory.value,
      totalFreeStorage: totalFreeStorage.value,
    })
    : [];
  const isEnabled = tile?.jobSiteEnabled !== false;
  const canManage = canManageTile(tile);
  const hero = selectedHero.value;
  const inspectorHero = hero ?? createInspectorHero(tile);
  const defenderTownCenter = tile?.ownerSettlementId ? tileIndex[tile.ownerSettlementId] ?? null : null;
  const defenderBorderMode = getEffectiveSettlementBorderMode(defenderTownCenter, seasonSnapshot.value);
  const currentBorderTownCenter = currentPlayerTownCenterTile.value;
  const raidLockReason = isWatchtowerTile(tile)
    ? (
      !currentBorderTownCenter
        ? 'No home settlement is available for raid orders.'
        : tile.ownerSettlementId === currentBorderTownCenter.id
          ? 'You cannot raid your own watchtower.'
          : canManage
            ? 'Only foreign border watchtowers can be targeted for raids.'
            : getEffectiveSettlementBorderMode(currentBorderTownCenter, seasonSnapshot.value) !== 'open'
              ? 'Open your own borders before issuing a raid.'
              : !defenderTownCenter
                ? 'This tower is not linked to a valid defending settlement.'
                : getEffectiveSettlementBorderMode(defenderTownCenter, seasonSnapshot.value) !== 'open'
                  ? 'The target settlement must also have open borders.'
                  : isProtectedByTownCenter(tile, defenderTownCenter)
                    ? 'This tower is still inside the defender safe zone.'
                    : getAvailableGuardReserve(currentBorderTownCenter) <= 0
                      ? 'Train or free at least one reserve guard first.'
                      : null
    )
    : null;
  const availableActions = listTaskDefinitions()
    .filter((task) => task.key !== 'walk')
    .filter((task) => canStartTaskDefinition(task, tile, inspectorHero))
    .map((task) => ({
      key: task.key,
      definition: task,
      label: task.label,
      summary: getActionSummary(task),
      costs: getTaskCosts(task),
      unlocked: isTaskUnlockedForUse(task.key, inspectedSettlementId.value),
      lockHint: getTaskLockHint(task),
    }));
  const watchtowerDetails = isWatchtowerTile(tile)
    ? {
      stateLabel: formatWatchtowerStateLabel(resolveWatchtowerConflictState(tile)),
      borderLabel: `Owner borders ${formatBorderModeLabel(defenderBorderMode)}${seasonSnapshot.value?.status === 'active' ? ' (season)' : ''}`,
      durabilityPercent: getWatchtowerDurabilityPercent(tile),
      captureLabel: `Capture ${Math.round(tile.towerCaptureProgress ?? 0)}%`,
      assignedGuards: tile.towerAssignedGuards ?? 0,
      reserveGuards: getAvailableGuardReserve(inspectedTownCenterTile.value),
      reserveLabel: `${getAvailableGuardReserve(inspectedTownCenterTile.value)} reserve available · ${Math.max(0, currentBorderTownCenter?.raidCommittedGuards ?? 0)} raiding`,
      wallLabel: (tile.towerWallLevel ?? 0) > 0 ? 'Palisaded' : 'Exposed',
      attackLabel: currentBorderTownCenter?.raidTargetTileId === tile.id && currentBorderTownCenter?.raidBlockedReason
        ? currentBorderTownCenter.raidBlockedReason
        : tile.towerAttackerSettlementId ? 'Hostile guards are engaging this watchtower.' : 'No active raid',
      canAssignGuards: canManage && completedStudyKeys.value.has('guard_training'),
      canBuildPalisade: canManage && completedStudyKeys.value.has('defensive_construction') && (tile.towerWallLevel ?? 0) <= 0,
      canToggleRaid: !canManage && !raidLockReason,
      raidLockReason,
      raidButtonLabel: currentBorderTownCenter?.raidTargetTileId === tile.id ? 'Cancel Raid' : 'Start Capture Raid',
      raidCopy: currentBorderTownCenter?.raidTargetTileId === tile.id
        ? 'Break off the current raid order and pull surviving raiders back into reserve duty.'
        : 'Commit your current reserve guards to march on this watchtower and keep fighting until the border breaks.',
    }
    : null;
  const barracksDetails = isBarracksTile(tile)
    ? (() => {
      const remainingProgressMs = Math.max(0, GUARD_TRAINING_DURATION_MS - (tile.barracksTrainingProgressMs ?? 0));
      const speedMultiplier = getGuardTrainingSpeedMultiplier(testModeSettings);
      return {
      reserveGuards: getAvailableGuardReserve(inspectedTownCenterTile.value),
      weapons: Math.max(0, playerInventory.value.weapons ?? 0),
      queue: tile.barracksTrainingQueue ?? 0,
      progressPercent: Math.min(100, Math.round(((tile.barracksTrainingProgressMs ?? 0) / GUARD_TRAINING_DURATION_MS) * 100)),
      progressLabel: `${formatCountdown(Date.now() + Math.max(0, Math.ceil(remainingProgressMs / speedMultiplier)))} to next guard`,
      canTrain: canManage && completedStudyKeys.value.has('guard_training'),
    };
    })()
    : null;
  const activeShip = (shipOrderOverview.value.activeOrders ?? [])
    .find((order) => order.harborTileId === tile.id) ?? null;
  const nextArrivalAt = shipOrderOverview.value.nextArrivals?.[tile.id] ?? null;
  const visibleShip = (shipOrderOverview.value.visibleShips ?? [])
    .find((ship) => ship.harborTileId === tile.id) ?? null;
  const harborDetails = building?.key === 'harbor'
    ? (() => {
      if (!activeShip && visibleShip?.phase === 'approaching') {
        return {
          statusLabel: visibleShip.name,
          routeLabel: 'Ship approaching harbor',
          timingLabel: formatCountdown(visibleShip.phaseEndsAt),
          cargoLabel: 'Manifest pending until the ship reaches the dock water.',
          progressPercent: null,
          progressLabel: '',
          rewardLabel: '',
          buttonLabel: 'Open Ship Panel',
          activeOrderId: visibleShip.orderId,
          buttonCopy: 'Loading opens once the ship stops beside the harbor.',
        };
      }

      if (!activeShip && visibleShip?.phase === 'departing') {
        return {
          statusLabel: visibleShip.name,
          routeLabel: 'Ship departing harbor',
          timingLabel: formatCountdown(visibleShip.phaseEndsAt),
          cargoLabel: 'Cargo closed',
          progressPercent: null,
          progressLabel: '',
          rewardLabel: '',
          buttonLabel: 'Open Ship Panel',
          activeOrderId: visibleShip.orderId,
          buttonCopy: 'The ship is leaving; the next order will schedule after it clears the water route.',
        };
      }

      if (activeShip) {
        const progressPercent = activeShip.totalRequestedValue > 0
          ? Math.min(100, Math.round((activeShip.totalFulfilledValue / activeShip.totalRequestedValue) * 100))
          : 100;
        return {
          statusLabel: activeShip.name,
          routeLabel: activeShip.originDescription ?? activeShip.origin,
          timingLabel: formatCountdown(activeShip.departsAt),
          cargoLabel: formatResourceList(activeShip.requested, 'No cargo requested'),
          progressPercent,
          progressLabel: `${formatNumber(activeShip.totalFulfilledValue)} / ${formatNumber(activeShip.totalRequestedValue)} cargo value loaded`,
          rewardLabel: `${formatNumber(activeShip.rewardPoolGold)} Gold pool · ${formatResourceList(activeShip.rewardGoods, 'No return cargo')}`,
          buttonLabel: 'Open Ship Loading',
          activeOrderId: activeShip.id,
          buttonCopy: 'Load settlement stock onto the current ship before it leaves harbor.',
        };
      }

      if (nextArrivalAt) {
        return {
          statusLabel: 'Next ship en route',
          routeLabel: 'A cargo order will be posted when the ship reaches any settlement harbor.',
          timingLabel: formatCountdown(nextArrivalAt),
          cargoLabel: 'Manifest pending',
          progressPercent: null,
          progressLabel: '',
          rewardLabel: '',
          buttonLabel: 'Open Ship Panel',
          activeOrderId: null,
          buttonCopy: 'Check the ship loading panel for the next arrival timer.',
        };
      }

      return {
        statusLabel: 'Harbor ready',
        routeLabel: 'Trade ships begin scheduling once the harbor network is active.',
        timingLabel: 'Awaiting route',
        cargoLabel: 'No manifest yet',
        progressPercent: null,
        progressLabel: '',
        rewardLabel: '',
        buttonLabel: 'Open Ship Panel',
        activeOrderId: null,
        buttonCopy: 'The panel will show the next ship once one is scheduled.',
      };
    })()
    : null;
  const tradeCenterDetails = building?.key === 'tradeCenter'
    ? (() => {
      const stockedMarketResources = Object.entries(marketOverview.value.resources)
        .map(([type, resource]) => ({
          type: type as ResourceType,
          stock: Math.floor(resource.stock ?? 0),
        }))
        .filter((resource) => resource.stock > 0)
        .sort((a, b) => b.stock - a.stock);
      const topStock = stockedMarketResources.slice(0, 3)
        .map((resource) => `${formatNumber(resource.stock)} ${getResourceDefinition(resource.type).label.toLowerCase()}`)
        .join(' • ');
      const isOwnSettlement = inspectedSettlementId.value === currentPlayerSettlementId.value;

      return {
        accessLabel: marketAccessReady.value ? 'Market open' : 'Trade Center needed',
        accessCopy: marketAccessReady.value
          ? 'This Trade Center connects settlement stores to the resource exchange.'
          : 'Build a Trade Center to authorize settlement trading.',
        marketLabel: `${stockedMarketResources.length} stocked good${stockedMarketResources.length === 1 ? '' : 's'}`,
        stockLabel: topStock || 'Market stock is refreshing.',
        canOpenMarket: marketAccessReady.value && isOwnSettlement,
        buttonCopy: !isOwnSettlement
          ? 'Only this settlement owner can trade from this Trade Center.'
          : marketAccessReady.value
            ? 'Open the exchange to buy or sell any stocked resource.'
            : 'Build a Trade Center first, then the exchange opens from here.',
      };
    })()
    : null;
  const isInfrastructure = !building && (isRoadTile(tile) || isBridgeTile(tile) || isTunnelTile(tile));
  if (!building && !isInfrastructure) {
    return null;
  }
  const assignedWorkerDetails = hasJobSite
    ? getAssignedWorkerDetails(tile.id, building?.cycleMs)
    : [];
  const houseGoodCapacity = buildingState?.houseGoodsCapacity ?? 0;
  const houseComfortHappiness = buildingState?.houseComfortHappiness ?? 0;
  const houseResidentDetails = building?.key === 'house' ? getHouseResidentDetails(tile.id) : [];
  const houseGoodDetails = building?.key === 'house' ? getHouseGoodDetails(tile, houseGoodCapacity) : [];
  const stockedHouseGoodCount = houseGoodDetails.reduce((sum, good) => sum + good.amount, 0);
  const houseDetails = building?.key === 'house'
    ? {
      residents: houseResidentDetails,
      residentCountLabel: `${houseResidentDetails.length} resident${houseResidentDetails.length === 1 ? '' : 's'}`,
      goods: houseGoodDetails,
      goodsCapacityLabel: `${stockedHouseGoodCount}/${houseGoodCapacity} stocked`,
      stockedCountLabel: stockedHouseGoodCount > 0
        ? `${stockedHouseGoodCount} good${stockedHouseGoodCount === 1 ? '' : 's'} stocked`
        : 'No goods stocked',
      comfortLabel: houseComfortHappiness > 0 ? `+${houseComfortHappiness} comfort` : 'Basic comfort',
      comfortCopy: houseComfortHappiness > 0
        ? 'This upgrade adds a small happiness recovery when residents rest at home.'
        : 'Stone and glass upgrades add passive home comfort.',
      consumptionLabel: 'Home goods are consumed slowly for happiness. Shops skip goods already stocked here and stop when storage is full.',
    }
    : null;

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
    canManage,
    cycleLabel: formatCycleDuration(building?.cycleMs),
    studyProgress,
    studyOptions,
    houseDetails,
    assignedWorkerDetails,
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
    currentInputLabel: acceptsAnyServiceInput
      ? formatAlternativeResourceList(resolvedCurrentInputs, 'No input required')
      : formatResourceList(resolvedCurrentInputs, 'No input required'),
    currentOutputLabel: formatResourceList(currentOutputs, 'No output while idle'),
    inputRateLabel: acceptsAnyServiceInput
      ? formatAlternativeRateList(currentInputRates, 'Consumes nothing per minute')
      : formatRateList(currentInputRates, 'Consumes nothing per minute'),
    outputRateLabel: formatRateList(currentOutputRates, 'Produces nothing per minute'),
    fullInputLabel: acceptsAnyServiceInput
      ? formatAlternativeResourceList(resolvedFullInputs, 'No input required')
      : formatResourceList(resolvedFullInputs, 'No input required'),
    fullOutputLabel: formatResourceList(fullOutputs, 'No output defined'),
    shortages: shortages.map((shortage) => ({
      ...shortage,
      missingLabel: acceptsAnyServiceInput
        ? 'Beer or wine missing'
        : `${formatNumber(shortage.missing)} ${formatResourceType(shortage.type)} missing`,
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
    watchtowerDetails,
    barracksDetails,
    harborDetails,
    tradeCenterDetails,
    advice,
    availableActions: canManage ? availableActions : [],
    actionHint: hero
      ? (canManage ? 'No hero orders are available on this structure right now.' : (raidLockReason ?? 'Only this settlement owner can issue orders here.'))
      : (canManage ? 'Select a hero to issue the order shown here.' : (raidLockReason ?? 'Only this settlement owner can issue orders here.')),
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

function openShipLoadingPanel() {
  openShipOrderPanel(selectedJobSiteDetail.value?.harborDetails?.activeOrderId ?? null);
}

function openTradeCenter() {
  if (inspectedSettlementId.value !== currentPlayerSettlementId.value) {
    addNotification({
      type: 'settlement',
      title: 'Foreign trade center',
      message: 'You can inspect this Trade Center, but only its owner can trade from this settlement.',
      duration: 3000,
    });
    return;
  }

  if (!marketAccessReady.value) {
    return;
  }

  openMarketplace();
}

function inspectAssignedWorker(settler: Settler) {
  openSettlerModal(settler);
}

function getTaskCosts(def: TaskDefinition) {
  return def.requiredResources?.(getTaskEconomyDistance()) ?? [];
}

function startBuildingAction(tileId: string, def: TaskDefinition) {
  const tile = tileIndex[tileId] ?? null;
  if (!canManageTile(tile)) {
    addNotification({
      type: 'settlement',
      title: 'Foreign site',
      message: 'You can inspect this structure, but only its owner can issue orders here.',
      duration: 2800,
    });
    return;
  }

  if (!isTaskUnlockedForUse(def.key, inspectedSettlementId.value)) {
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
  const accessTile = findNearestTaskAccessTile(def.key, tile, hero.q, hero.r, hero.settlementId ?? null);
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
  if (playerPopulation.value.hungerMs > 0 && jobSites.value.length > 0) {
    return 'tc-status-danger';
  }
  if (!jobSites.value.length || inspectedWorkforce.value.idleWorkers > 0) {
    return 'tc-status-warn';
  }
  return 'tc-status-ok';
});

const jobsStatusText = computed(() => {
  if (!jobSites.value.length) {
    return 'No job buildings online yet';
  }
  if (playerPopulation.value.hungerMs > 0) {
    return 'The colony is hungry, but staffed jobs keep running';
  }
  if (inspectedWorkforce.value.availableWorkers <= 0) {
    return 'No settlers are available for work';
  }
  if (inspectedWorkforce.value.idleWorkers > 0) {
    return `${inspectedWorkforce.value.idleWorkers} worker${inspectedWorkforce.value.idleWorkers === 1 ? '' : 's'} waiting for more job slots`;
  }
  return 'Every available worker is assigned';
});

const townCenterSubtitle = computed(() => {
  const trade = marketAccessReady.value ? 'market open' : 'trade center needed';
  return `${ownedTiles.value} tiles held · ${jobSites.value.length} job sites · ${trade}`;
});

const townCenterTabs = computed<Array<{
  key: TownCenterTabKey;
  label: string;
  glyph: string;
  note: string;
}>>(() => [
  {
    key: 'overview',
    label: 'Overview',
    glyph: '⌂',
    note: `${playerPopulation.value.current}/${playerPopulation.value.max} settlers`,
  },
  {
    key: 'economy',
    label: 'Economy',
    glyph: '◆',
    note: `${foodStock.value} meals`,
  },
  {
    key: 'defense',
    label: 'Defense',
    glyph: '⚔',
    note: militarySummary.value.borderModeLabel,
  },
  {
    key: 'sites',
    label: 'Sites',
    glyph: '⚒',
    note: `${inspectedWorkforce.value.assignedWorkers}/${inspectedWorkforce.value.availableWorkers} staffed`,
  },
]);

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

  if (isVisible) {
    activeTownCenterTab.value = 'overview';
  }

  if (isVisible && !listenerActive) {
    window.addEventListener('keydown', handleKeydown);
    listenerActive = true;
  } else if (!isVisible && listenerActive) {
    window.removeEventListener('keydown', handleKeydown);
    listenerActive = false;
  }
}, { immediate: true });

watch(
  () => [props.visible, props.standaloneBuildingTileId] as const,
  ([isVisible, tileId]) => {
    if (!isVisible || !tileId) {
      return;
    }

    openStandaloneBuildingDetail(tileId);
  },
  { immediate: true },
);

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
  padding: 24px;
  background:
    radial-gradient(circle at 20% 38%, rgba(50, 66, 47, 0.22), transparent 23rem),
    radial-gradient(circle at 55% 115%, rgba(57, 80, 57, 0.14), transparent 28rem),
    rgba(1, 5, 12, 0.78);
  backdrop-filter: blur(4px) saturate(0.82) brightness(0.78);
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
  box-sizing: border-box;
  --panel-modal-border-width: 20px;
  --tc-panel-padding-top: 1.55rem;
  --tc-panel-padding-x: 1.65rem;
  --tc-panel-padding-bottom: 1.35rem;
  --panel-header-margin: calc(-1 * var(--tc-panel-padding-top)) calc(-1 * (var(--panel-modal-border-width) + var(--tc-panel-padding-x))) 0 calc(-1 * (var(--panel-modal-border-width) + var(--tc-panel-padding-x)));
  width: min(68rem, calc(100vw - 28px));
  height: min(46rem, calc(100vh - 36px));
  overflow: hidden;
  padding: var(--tc-panel-padding-top) var(--tc-panel-padding-x) var(--tc-panel-padding-bottom);
  border: 20px solid transparent;
  border-image: url('../assets/ui/settler-modal/panel-frame.png') 72 / 36px stretch;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 0.75rem;
  background:
    radial-gradient(circle at 66% 0%, rgba(83, 57, 32, 0.2), transparent 24rem),
    radial-gradient(circle at 15% 100%, rgba(47, 31, 20, 0.22), transparent 18rem),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 5px),
    repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.18) 0 1px, transparent 1px 6px),
    linear-gradient(180deg, #121619 0%, #0a0d10 100%);
  color: #f3e4c9;
  backdrop-filter: none;
}

.tc-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.16;
  background-image:
    radial-gradient(circle at 12% 24%, rgba(255, 228, 169, 0.12) 0 1px, transparent 1px),
    radial-gradient(circle at 74% 68%, rgba(255, 228, 169, 0.1) 0 1px, transparent 1px),
    radial-gradient(circle at 46% 44%, rgba(0, 0, 0, 0.42) 0 1px, transparent 1px);
  background-size: 13px 17px, 19px 23px, 11px 13px;
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
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  min-height: 5rem;
  padding: 0.05rem 3.15rem 0.75rem 0;
  border-bottom: 1px solid rgba(130, 88, 43, 0.24);
  background:
    linear-gradient(90deg, rgba(74, 48, 25, 0.22), transparent 70%);
  box-shadow: inset 0 -1px 0 rgba(255, 226, 161, 0.035);
}

.tc-header-emblem {
  flex-shrink: 0;
  width: 3.45rem;
  height: 5.58rem;
  margin-top: -0.35rem;
}

.tc-header-copy {
  min-width: 0;
  flex: 1;
}

.tc-kicker {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #c69549;
}

.tc-title {
  margin: 0.34rem 0 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(1.55rem, 3vw, 2rem);
  font-weight: 700;
  line-height: 1.1;
  color: #fff1d4;
  text-shadow: 0 2px 0 #090807, 0 0 10px rgba(216, 170, 83, 0.18);
}

.tc-subtitle {
  margin: 0.38rem 0 0;
  color: #d7c8a7;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.9rem;
  line-height: 1.3;
}

.tc-tab-bar {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.38rem;
}

.tc-tab-button {
  position: relative;
  min-width: 0;
  min-height: 3.85rem;
  display: flex;
  align-items: center;
  gap: 0.62rem;
  padding: 0.48rem 0.72rem;
  border: 8px solid transparent;
  border-image: url('../assets/ui/settler-modal/stat-badge.png') 46 fill / 8px stretch;
  background:
    radial-gradient(circle at 20% 0%, rgba(255, 226, 161, 0.06), transparent 6rem),
    linear-gradient(180deg, rgba(18, 18, 17, 0.66), rgba(8, 10, 12, 0.72));
  color: #d7c8a7;
  text-align: left;
  cursor: pointer;
  filter: saturate(0.86) brightness(0.86);
  transition: transform .15s ease, filter .15s ease, color .15s ease;
}

.tc-tab-button:hover,
.tc-tab-button:focus-visible {
  transform: translateY(-1px);
  filter: saturate(1.04) brightness(1.04);
  outline: none;
}

.tc-tab-button-active {
  background:
    radial-gradient(circle at 18% 0%, rgba(255, 216, 135, 0.2), transparent 6rem),
    linear-gradient(180deg, rgba(74, 48, 25, 0.78), rgba(16, 14, 13, 0.82));
  color: #fff1d4;
  filter: saturate(1.12) brightness(1.1);
  box-shadow:
    0 0 0 1px rgba(233, 174, 74, 0.18),
    0 0 18px rgba(198, 149, 73, 0.13);
}

.tc-tab-glyph {
  flex-shrink: 0;
  width: 2.05rem;
  height: 2.05rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background:
    radial-gradient(circle at 45% 28%, rgba(255, 226, 161, 0.14), transparent 62%),
    rgba(16, 17, 17, 0.54);
  border: 1px solid rgba(130, 88, 43, 0.3);
  color: #e5b957;
  font-size: 16px;
  box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.46);
}

.tc-tab-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.tc-tab-label {
  overflow: hidden;
  color: inherit;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tc-tab-note {
  overflow: hidden;
  color: #a99b82;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 10px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tc-tab-panel {
  position: relative;
  z-index: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  gap: 0.65rem;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  padding-right: 0.45rem;
  scrollbar-color: rgba(198, 149, 73, 0.78) rgba(7, 10, 12, 0.48);
  scrollbar-width: thin;
}

.tc-tab-panel::-webkit-scrollbar {
  width: 0.55rem;
}

.tc-tab-panel::-webkit-scrollbar-track {
  background:
    repeating-linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0 1px, transparent 1px 5px),
    rgba(7, 10, 12, 0.58);
  border-left: 1px solid rgba(130, 88, 43, 0.2);
}

.tc-tab-panel::-webkit-scrollbar-thumb {
  border: 1px solid rgba(29, 18, 10, 0.9);
  border-radius: 6px;
  background:
    linear-gradient(180deg, rgba(223, 165, 70, 0.92), rgba(102, 65, 31, 0.9));
}

.tc-tab-panel-economy,
.tc-tab-panel-defense,
.tc-tab-panel-sites {
  grid-template-columns: 1fr;
}

/* Sections */

.tc-section {
  position: relative;
  z-index: 1;
  margin-top: 0;
  padding: 0.88rem;
  border-radius: 6px;
  border: 1px solid rgba(130, 88, 43, 0.22);
  background:
    radial-gradient(circle at 18% 0%, rgba(255, 226, 161, 0.038), transparent 7rem),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.014) 0 1px, transparent 1px 8px),
    linear-gradient(180deg, rgba(23, 25, 26, 0.48), rgba(9, 11, 13, 0.34));
  box-shadow:
    inset 0 0 24px rgba(0, 0, 0, 0.2),
    0 1px 0 rgba(255, 226, 161, 0.035);
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
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #c69549;
}

.tc-section-caption {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 10px;
  color: #a99b82;
  font-style: italic;
}

/* Stats */

.tc-stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.45rem;
  margin-bottom: 0.62rem;
}

.tc-panel :deep(.panel-stat-card) {
  min-width: 0;
  min-height: 3rem;
  padding: 0.48rem 0.58rem;
  border: 1px solid rgba(130, 88, 43, 0.26);
  border-image: none;
  border-radius: 4px;
  background:
    radial-gradient(circle at 18% 0%, rgba(255, 226, 161, 0.036), transparent 6rem),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.014) 0 1px, transparent 1px 8px),
    rgba(8, 10, 12, 0.42);
  box-shadow:
    inset 0 0 12px rgba(0, 0, 0, 0.22),
    0 1px 0 rgba(255, 226, 161, 0.025);
}

.tc-panel :deep(.panel-stat-card__label) {
  font-size: 0.54rem;
  letter-spacing: 0.1em;
  line-height: 1.1;
}

.tc-panel :deep(.panel-stat-card__value) {
  font-size: clamp(0.88rem, 1.25vw, 1.18rem);
  line-height: 1.05;
  overflow-wrap: normal;
  word-break: normal;
}

.tc-stat-grid-3 {
  grid-template-columns: 1fr 1fr 1fr;
}

.tc-stat-grid-4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
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

.tc-status-dot.tc-status-muted {
  background: rgba(148, 163, 184, 0.72);
  box-shadow: 0 0 6px rgba(148, 163, 184, 0.24);
}

.tc-status-dot.tc-status-danger {
  background: rgba(248, 113, 113, 0.9);
  box-shadow: 0 0 6px rgba(248, 113, 113, 0.4);
  animation: tc-pulse 1.2s ease-in-out infinite;
}

.tc-status-text {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 11px;
  line-height: 1.35;
  color: #d7c8a7;
}

/* Food bar */

.tc-food-bar-track {
  height: 0.55rem;
  border-radius: 3px;
  background:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 7px),
    rgba(7, 10, 12, 0.72);
  border: 1px solid rgba(130, 88, 43, 0.34);
  overflow: hidden;
  margin-bottom: 10px;
  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.58);
}

.tc-food-bar-fill {
  height: 100%;
  border-radius: 2px;
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
  border-radius: 6px;
  background:
    radial-gradient(circle at 0% 0%, rgba(255, 226, 161, 0.045), transparent 8rem),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 7px),
    rgba(10, 12, 14, 0.34);
  border: 1px solid rgba(130, 88, 43, 0.3);
  box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.22);
}

.tc-job-site-clickable {
  cursor: pointer;
  transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}

.tc-job-site-clickable:hover,
.tc-job-site-clickable:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(223, 165, 70, 0.44);
  background:
    radial-gradient(circle at 0% 0%, rgba(255, 226, 161, 0.065), transparent 8rem),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0 1px, transparent 1px 7px),
    rgba(28, 22, 17, 0.48);
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
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 12px;
  font-weight: 700;
  color: #fff0d2;
}

.tc-job-site-meta {
  margin-top: 2px;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 10px;
  color: #a99b82;
}

.tc-job-site-staff {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 11px;
  font-weight: 700;
  color: #e5b957;
}

.tc-job-site-open {
  padding: 3px 7px;
  border-radius: 6px;
  background:
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 7px),
    rgba(10, 12, 14, 0.46);
  border: 1px solid rgba(130, 88, 43, 0.32);
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #d7c8a7;
}

.tc-job-site-status {
  margin-top: 8px;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 11px;
  line-height: 1.35;
}

.tc-job-site-blocker,
.tc-detail-blocker {
  margin-top: 8px;
  border-radius: 6px;
  border: 1px solid rgba(196, 137, 63, 0.38);
  background:
    linear-gradient(180deg, rgba(120, 53, 15, 0.22), rgba(10, 12, 14, 0.18)),
    rgba(28, 22, 17, 0.42);
  padding: 8px 10px;
  color: #f6d19c;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 11px;
  line-height: 1.35;
}

.tc-detail-blocker {
  margin-top: 12px;
  border-radius: 6px;
  border-color: rgba(196, 137, 63, 0.38);
  background:
    linear-gradient(180deg, rgba(120, 53, 15, 0.22), rgba(10, 12, 14, 0.18)),
    rgba(28, 22, 17, 0.42);
  color: #f6d19c;
  font-family: Georgia, 'Times New Roman', serif;
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

.tc-detail-dashboard {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(14rem, 0.58fr);
  gap: 1rem;
  align-items: start;
}

.tc-detail-main-column,
.tc-detail-side-column {
  min-width: 0;
}

.tc-detail-section-sticky {
  position: sticky;
  top: 0.25rem;
}

.tc-job-site-condition-label,
.tc-job-site-condition-value,
.tc-maintenance-site-name,
.tc-maintenance-site-state {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 10px;
  line-height: 1.3;
}

.tc-job-site-condition-label,
.tc-maintenance-site-name {
  color: #a99b82;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.tc-job-site-condition-value {
  color: #d7c8a7;
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
  border-radius: 6px;
  background:
    radial-gradient(circle at 0% 0%, rgba(255, 226, 161, 0.045), transparent 8rem),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 7px),
    rgba(10, 12, 14, 0.34);
  border: 1px solid rgba(130, 88, 43, 0.3);
  box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.22);
}

.tc-maintenance-site-state {
  color: #d7c8a7;
}

.tc-maintenance-bar-track {
  height: 0.55rem;
  margin-top: 8px;
  border-radius: 3px;
  background:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 7px),
    rgba(7, 10, 12, 0.72);
  border: 1px solid rgba(130, 88, 43, 0.34);
  overflow: hidden;
  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.58);
}

.tc-maintenance-bar-track-compact {
  height: 0.46rem;
}

.tc-maintenance-bar-fill {
  height: 100%;
  border-radius: 2px;
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
  padding: 24px;
  background:
    radial-gradient(circle at 20% 38%, rgba(50, 66, 47, 0.22), transparent 23rem),
    radial-gradient(circle at 55% 115%, rgba(57, 80, 57, 0.14), transparent 28rem),
    rgba(1, 5, 12, 0.76);
  backdrop-filter: blur(4px) saturate(0.82) brightness(0.78);
}

.tc-detail-backdrop-standalone {
  background:
    radial-gradient(circle at 20% 38%, rgba(50, 66, 47, 0.22), transparent 23rem),
    radial-gradient(circle at 55% 115%, rgba(57, 80, 57, 0.14), transparent 28rem),
    rgba(1, 5, 12, 0.84);
  backdrop-filter: blur(4px) saturate(0.82) brightness(0.78);
}

.tc-detail-modal {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: min(58rem, calc(100vw - 32px));
  max-height: min(75vh, calc(100vh - 48px));
  overflow: hidden;
  padding: 1.55rem 1.65rem 1.35rem;
  border: 20px solid transparent;
  border-image: url('../assets/ui/settler-modal/panel-frame.png') 72 / 36px stretch;
  background:
    radial-gradient(circle at 66% 0%, rgba(83, 57, 32, 0.2), transparent 24rem),
    radial-gradient(circle at 15% 100%, rgba(47, 31, 20, 0.22), transparent 18rem),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 5px),
    repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.18) 0 1px, transparent 1px 6px),
    linear-gradient(180deg, #121619 0%, #0a0d10 100%);
  color: #f3e4c9;
  box-shadow:
    0 28px 80px rgba(0, 0, 0, 0.66),
    0 0 0 1px rgba(209, 145, 58, 0.34),
    inset 0 0 70px rgba(0, 0, 0, 0.86);
}


.tc-detail-scroll {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  padding: 0.1rem 0.55rem 0 0;
  scrollbar-color: rgba(198, 149, 73, 0.78) rgba(7, 10, 12, 0.48);
  scrollbar-width: thin;
}

.tc-detail-scroll::-webkit-scrollbar {
  width: 0.55rem;
}

.tc-detail-scroll::-webkit-scrollbar-track {
  background:
    repeating-linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0 1px, transparent 1px 5px),
    rgba(7, 10, 12, 0.58);
  border-left: 1px solid rgba(130, 88, 43, 0.2);
}

.tc-detail-scroll::-webkit-scrollbar-thumb {
  border: 1px solid rgba(29, 18, 10, 0.9);
  border-radius: 6px;
  background:
    linear-gradient(180deg, rgba(223, 165, 70, 0.92), rgba(102, 65, 31, 0.9));
}

.tc-detail-header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 0.05rem 3.15rem 0.75rem 0;
}

.tc-detail-kicker {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #c69549;
}

.tc-detail-title {
  margin: 0.34rem 0 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(1.55rem, 3vw, 2rem);
  font-weight: 700;
  line-height: 1.1;
  color: #fff1d4;
  text-shadow: 0 2px 0 #090807, 0 0 10px rgba(216, 170, 83, 0.18);
}

.tc-detail-summary {
  margin: 0.38rem 0 0;
  max-width: 43rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.95rem;
  line-height: 1.3;
  color: #d7c8a7;
}

.tc-detail-pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 0.75rem;
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
  border-radius: 6px;
  border: 1px solid rgba(198, 149, 73, 0.38);
  background:
    linear-gradient(180deg, rgba(118, 78, 34, 0.78), rgba(65, 39, 19, 0.82)),
    rgba(18, 15, 12, 0.82);
  color: #fff0d2;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform .15s, border-color .15s, background .15s;
}

.tc-detail-toggle:hover {
  transform: translateY(-1px);
  border-color: rgba(223, 165, 70, 0.62);
  background:
    linear-gradient(180deg, rgba(151, 99, 39, 0.86), rgba(77, 45, 20, 0.88)),
    rgba(18, 15, 12, 0.82);
}

.tc-detail-toggle-off {
  background:
    linear-gradient(180deg, rgba(120, 53, 15, 0.44), rgba(10, 12, 14, 0.34)),
    rgba(28, 22, 17, 0.52);
  color: #fef3c7;
}

.tc-detail-action-copy {
  margin: 0;
  color: #cdbb98;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.82rem;
}

.tc-detail-pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid rgba(130, 88, 43, 0.36);
  background:
    radial-gradient(circle at 18% 0%, rgba(255, 226, 161, 0.052), transparent 7rem),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 8px),
    rgba(10, 12, 14, 0.46);
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #d7c8a7;
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
  border-radius: 6px;
  background:
    radial-gradient(circle at 18% 0%, rgba(255, 226, 161, 0.052), transparent 7rem),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 8px),
    linear-gradient(180deg, rgba(23, 25, 26, 0.62), rgba(9, 11, 13, 0.46));
  border: 1px solid rgba(130, 88, 43, 0.3);
  box-shadow:
    inset 0 0 18px rgba(0, 0, 0, 0.28),
    0 1px 0 rgba(255, 226, 161, 0.035);
}

.tc-detail-card-label,
.tc-detail-flow-title,
.tc-detail-section-title {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #c69549;
}

.tc-detail-card-value {
  margin-top: 8px;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1rem;
  font-weight: 700;
  color: #fff0d2;
  text-shadow: 0 1px 0 #070707;
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
  color: #d7c8a7;
}

.tc-detail-flow-note {
  color: #a99b82;
}

.tc-detail-section {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(130, 88, 43, 0.24);
  box-shadow: inset 0 1px 0 rgba(255, 226, 161, 0.035);
}

.tc-detail-flow-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}

.tc-house-lists {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  gap: 12px;
  margin-top: 12px;
}

.tc-house-good-list {
  display: grid;
  gap: 8px;
}

.tc-house-good-row {
  min-height: 58px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid rgba(130, 88, 43, 0.3);
  background:
    radial-gradient(circle at 0% 0%, rgba(255, 226, 161, 0.05), transparent 8rem),
    rgba(10, 12, 14, 0.36);
}

.tc-house-good-row-empty {
  opacity: 0.62;
}

.tc-house-good-icon {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.32);
  border: 1px solid rgba(198, 149, 73, 0.26);
  font-size: 17px;
}

.tc-house-good-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.tc-house-good-title {
  color: #fff0d2;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 13px;
  font-weight: 700;
}

.tc-house-good-effect {
  color: #d7c8a7;
  font-size: 12px;
  line-height: 1.35;
}

.tc-house-good-note {
  color: #a99b82;
  font-size: 11px;
  line-height: 1.35;
}

.tc-study-picker {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.tc-study-option {
  width: 100%;
  padding: 12px 14px;
  border-radius: 6px;
  border: 1px solid rgba(130, 88, 43, 0.3);
  background:
    radial-gradient(circle at 0% 0%, rgba(255, 226, 161, 0.045), transparent 8rem),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 7px),
    rgba(10, 12, 14, 0.34);
  text-align: left;
  cursor: pointer;
  transition: transform .15s ease, border-color .15s ease, background .15s ease;
}

.tc-study-option:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(223, 165, 70, 0.44);
  background:
    radial-gradient(circle at 0% 0%, rgba(255, 226, 161, 0.065), transparent 8rem),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0 1px, transparent 1px 7px),
    rgba(28, 22, 17, 0.48);
}

.tc-study-option:disabled {
  cursor: default;
}

.tc-study-option-active {
  border-color: rgba(158, 230, 168, 0.34);
  background:
    radial-gradient(circle at 0% 0%, rgba(158, 230, 168, 0.08), transparent 8rem),
    rgba(22, 101, 52, 0.18);
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
  border-radius: 6px;
  background:
    radial-gradient(circle at 0% 0%, rgba(255, 226, 161, 0.045), transparent 8rem),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 7px),
    rgba(10, 12, 14, 0.34);
  border: 1px solid rgba(130, 88, 43, 0.3);
  margin-top: 10px;
  box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.22);
}

.tc-detail-order-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.tc-detail-order-card {
  padding: 12px 14px;
  border-radius: 6px;
  background:
    radial-gradient(circle at 0% 0%, rgba(255, 226, 161, 0.045), transparent 8rem),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 7px),
    rgba(10, 12, 14, 0.34);
  border: 1px solid rgba(130, 88, 43, 0.3);
  box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.22);
}

.tc-detail-order-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.tc-detail-order-title {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 13px;
  font-weight: 700;
  color: #fff0d2;
}

.tc-detail-order-copy {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: #d7c8a7;
}

.tc-detail-order-note {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.45;
  color: rgba(253, 224, 71, 0.88);
}

.tc-detail-order-button {
  flex-shrink: 0;
  min-width: 6.6rem;
}

.tc-detail-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.tc-detail-chip {
  padding: 7px 10px;
  border-radius: 6px;
  background:
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 7px),
    rgba(10, 12, 14, 0.46);
  border: 1px solid rgba(130, 88, 43, 0.32);
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 11px;
  color: #d7c8a7;
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

.tc-worker-list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.tc-worker-row {
  width: 100%;
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid rgba(130, 88, 43, 0.3);
  background:
    radial-gradient(circle at 0% 0%, rgba(255, 226, 161, 0.045), transparent 8rem),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 7px),
    rgba(10, 12, 14, 0.34);
  cursor: pointer;
  text-align: left;
  transition: transform .15s ease, border-color .15s ease, background .15s ease;
}

.tc-worker-row:hover,
.tc-worker-row:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(223, 165, 70, 0.44);
  background:
    radial-gradient(circle at 0% 0%, rgba(255, 226, 161, 0.065), transparent 8rem),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0 1px, transparent 1px 7px),
    rgba(28, 22, 17, 0.48);
  outline: none;
}

.tc-worker-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.tc-worker-name {
  color: #fff0d2;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 13px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.tc-worker-meta {
  color: #a99b82;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 11px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.tc-worker-progress {
  flex-shrink: 0;
  min-width: 44px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid rgba(130, 88, 43, 0.32);
  background:
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 7px),
    rgba(10, 12, 14, 0.46);
  color: #d7c8a7;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 10px;
  font-weight: 700;
  text-align: center;
}

.tc-worker-empty {
  margin-top: 10px;
}

@media (max-width: 760px) {
  .tc-overlay,
  .tc-detail-backdrop {
    padding: 0;
  }

  .tc-tab-bar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tc-tab-panel {
    grid-template-columns: 1fr;
  }

  .tc-header {
    align-items: center;
  }

  .tc-header-emblem {
    width: 2.85rem;
    height: 4.6rem;
  }

  .tc-tab-button {
    min-height: 54px;
  }

  .tc-tab-note {
    white-space: normal;
  }

  .tc-stat-grid-3,
  .tc-stat-grid-4,
  .tc-detail-grid,
  .tc-detail-flow-grid,
  .tc-detail-dashboard,
  .tc-house-lists,
  .tc-job-list {
    grid-template-columns: 1fr;
  }

  .tc-detail-section-sticky {
    position: static;
  }

  .tc-panel {
    --tc-panel-padding-top: 1.55rem;
    --tc-panel-padding-x: 1rem;
    --tc-panel-padding-bottom: 1rem;
    width: 100dvw;
    max-width: 100dvw;
    height: 100dvh;
    max-height: 100dvh;
    display: grid;
  }

  .tc-section {
    margin-top: 0;
  }

  .tc-detail-modal {
    width: 100dvw;
    max-width: 100dvw;
    height: 100dvh;
    max-height: 100dvh;
    padding: 1.55rem 1rem 1rem;
  }

}

/* Pulse animation for danger state */

@keyframes tc-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
