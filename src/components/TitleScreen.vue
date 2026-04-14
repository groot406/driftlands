<template>
  <div class="story-title relative h-screen overflow-x-hidden overflow-y-auto bg-slate-950 text-slate-100">
    <div class="fixed inset-0">
      <TitleBackground :move="true" :blur="10" />
      <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.14),transparent_36%),linear-gradient(125deg,rgba(15,23,42,0.62),rgba(2,6,23,0.92))]" />
      <div class="absolute left-[-8rem] top-[-5rem] h-72 w-72 rounded-full bg-amber-300/12 blur-3xl" />
      <div class="absolute bottom-[-8rem] right-[-4rem] h-80 w-80 rounded-full bg-cyan-300/10 blur-3xl" />
    </div>

    <div class="relative z-10 flex min-h-screen items-start px-5 py-5 lg:items-center lg:px-10 lg:py-8">
      <div class="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <section class="story-panel story-hero-panel">
          <div class="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-200/90">
            <span class="story-badge story-badge-primary">Colony Story</span>
            <span class="story-badge">Persistent Colony</span>
            <span class="story-badge">Seed {{ activeSeed }}</span>
          </div>

          <p class="mt-5 text-sm uppercase tracking-[0.32em] text-amber-200/80">Driftlands</p>
          <h1 class="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Grow a colony through houses, job sites, and new resource chains.
          </h1>
          <p class="mt-5 max-w-2xl text-sm leading-7 text-slate-200/78 sm:text-base">
            Gather raw materials, build the next specialist structure, house more settlers, and let each new production line unlock the next layer of the frontier.
          </p>

          <div class="mt-6 flex flex-wrap items-center gap-4">
            <button class="story-btn-primary" @click="joinGame">{{ primaryActionLabel }}</button>
            <p class="max-w-md text-xs leading-5 text-slate-300/80">
              {{ currentRun ? 'Your colony state is already live. Step back in and continue the next production chain.' : 'You begin with just enough tools to survive. Real growth starts once the first houses and job sites begin feeding each other.' }}
            </p>
          </div>

          <div class="mt-10">
            <div class="flex items-center justify-between gap-3">
              <p class="pixel-font text-[10px] uppercase tracking-[0.2em] text-amber-200/80">Colony Loop</p>
              <p class="text-xs uppercase tracking-[0.16em] text-slate-300/80">One chain unlocks the next</p>
            </div>

            <div class="mt-4 grid gap-3 sm:grid-cols-2">
              <article
                v-for="step in loopSteps"
                :key="step.label"
                class="rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-4"
              >
                <div class="flex flex-wrap items-center gap-3">
                  <span class="story-badge story-badge-primary">{{ step.label }}</span>
                  <h2 class="text-lg font-semibold text-white">{{ step.title }}</h2>
                </div>
                <p class="mt-3 text-sm leading-6 text-slate-300">{{ step.description }}</p>
              </article>
            </div>

            <p class="mt-4 max-w-2xl text-xs leading-5 text-slate-300/78">
              Story beats now sit on top of this loop instead of locking it. The crew reacts to what the colony achieves, but the economy itself decides what comes next.
            </p>
          </div>
        </section>

        <aside class="flex flex-col gap-4">
          <section class="story-panel">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="pixel-font text-[10px] uppercase tracking-[0.18em] text-amber-200/80">Current Story</p>
                <h2 class="mt-3 text-2xl font-semibold text-white">{{ previewStory.title }}</h2>
              </div>
              <div class="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em]">
                <span class="story-badge story-badge-primary">{{ previewStory.chapterLabel }}</span>
                <span class="story-badge">{{ previewStory.actLabel }}</span>
              </div>
            </div>

            <p class="mt-4 text-sm leading-7 text-slate-200/78">{{ previewStory.kicker }}</p>

            <div class="mt-4 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4">
              <p class="text-[10px] uppercase tracking-[0.16em] text-slate-400">Scene</p>
              <p class="mt-2 text-sm leading-6 text-slate-200/78">{{ previewStory.briefing }}</p>
            </div>

            <div class="mt-4 grid gap-3 sm:grid-cols-2">
              <div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                <p class="text-[10px] uppercase tracking-[0.16em] text-slate-400">Next Unlock</p>
                <p class="mt-2 text-base font-semibold text-white">{{ nextMilestoneLabel }}</p>
                <p class="mt-2 text-xs leading-5 text-slate-300/75">{{ nextMilestoneDescription }}</p>
              </div>
              <div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                <p class="text-[10px] uppercase tracking-[0.16em] text-slate-400">Colony Pressure</p>
                <p class="mt-2 text-base font-semibold text-white">{{ colonyPressure }}</p>
                <p class="mt-2 text-xs leading-5 text-slate-300/75">{{ previewStory.guidance }}</p>
              </div>
            </div>
          </section>

          <section class="story-panel">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="pixel-font text-[10px] uppercase tracking-[0.18em] text-amber-200/80">Landing Crew</p>
                <h2 class="mt-3 text-xl font-semibold text-white">{{ crewHeading }}</h2>
              </div>
              <span class="story-badge">{{ crew.length }} crew</span>
            </div>

            <div class="mt-5 grid grid-cols-2 gap-3">
              <article
                v-for="member in crew"
                :key="member.name"
                class="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/55 px-3 py-3"
              >
                <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900/80">
                  <Sprite
                    :sprite="member.avatar"
                    :zoom="1.75"
                    :row="8"
                    :frame="0"
                    :size="32"
                    :aria-label="member.name"
                  />
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-white">{{ member.name }}</p>
                  <p class="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">{{ member.role }}</p>
                </div>
              </article>
            </div>

            <p class="mt-4 text-xs leading-5 text-slate-300/80">{{ crewHint }}</p>
          </section>
        </aside>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import TitleBackground from './TitleBackground.vue';
import Sprite from './Sprite.vue';
import { resumeGame } from '../store/uiStore.ts';
import { runSnapshot } from '../store/runStore.ts';
import { createStoryProgression } from '../shared/story/progression.ts';
import { getStoryHeroTemplate } from '../shared/story/heroRoster.ts';
import boyAvatar from '../assets/heroes/boy.png';
import girlAvatar from '../assets/heroes/girl.png';
import loopheadAvatar from '../assets/heroes/loophead.png';
import santaAvatar from '../assets/heroes/santa.png';

const openingStory = {
  chapterId: 'landfall',
  chapterLabel: 'Landfall',
  actLabel: 'Opening Days',
  title: 'A New Landing',
  kicker: 'A handful of people, a rough shoreline, and just enough supplies to start making promises.',
  briefing: 'Gather the first stockpile, raise shelter, and turn scattered labor into the first real production chain.',
  stakes: 'If housing, food, and work fall out of balance, the colony stalls before it becomes self-sustaining.',
  guidance: 'Build the next useful thing, then make sure the colony has enough beds and workers to keep it running.',
  completionTitle: 'The colony finds its footing',
  completionText: 'The first loop holds. From here on, each new structure can unlock the next.',
  failureTitle: 'The landing goes quiet',
  failureText: 'Without enough shelter, food, and labor, the frontier stops moving.',
  nextHint: 'The next unlock comes from the colony state itself, not a mission list.',
};

const openingProgression = createStoryProgression(1);
const avatarByKey: Record<string, string> = {
  boy: boyAvatar,
  girl: girlAvatar,
  loophead: loopheadAvatar,
  santa: santaAvatar,
};
const loopSteps = [
  {
    label: '01',
    title: 'Gather',
    description: 'Collect wood, food, and salvage from the open ground around the landing.',
  },
  {
    label: '02',
    title: 'Build',
    description: 'Turn that stockpile into a new structure that solves the next colony problem.',
  },
  {
    label: '03',
    title: 'Settle',
    description: 'Raise houses so more settlers can join and keep the new site staffed.',
  },
  {
    label: '04',
    title: 'Produce',
    description: 'Specialized job sites create the resource that unlocks the next building in the chain.',
  },
] as const;

const currentRun = computed(() => runSnapshot.value);
const previewStory = computed(() => currentRun.value?.chapter ?? openingStory);
const currentProgression = computed(() => currentRun.value?.progression ?? openingProgression);
const nextMilestone = computed(() => {
  const nextNodeKey = currentProgression.value.nextRecommendedNodeKeys[0];
  return currentProgression.value.nodes.find((node) => node.key === nextNodeKey) ?? null;
});
const crew = computed(() => currentProgression.value.heroes.available
  .map((heroId) => getStoryHeroTemplate(heroId))
  .filter((hero): hero is NonNullable<ReturnType<typeof getStoryHeroTemplate>> => !!hero)
  .map((hero) => ({
    name: hero.name,
    role: hero.role,
    avatar: avatarByKey[hero.avatar] ?? santaAvatar,
  })));
const primaryActionLabel = computed(() => currentRun.value ? 'Continue Colony' : 'Start Colony');
const nextMilestoneLabel = computed(() => nextMilestone.value?.label ?? 'Keep Expanding');
const nextMilestoneDescription = computed(() => nextMilestone.value?.description ?? 'Build another useful production link and the next milestone will appear.');
const activeSeed = computed(() => currentRun.value?.seed ?? 123456789);
const crewHeading = computed(() => `${crew.value.length} hero${crew.value.length === 1 ? '' : 'es'} on the center stone`);
const colonyPressure = computed(() => {
  if (!currentRun.value) {
    return 'Housing, food, and labor are all still fragile.';
  }

  const run = currentRun.value;
  return `${run.activeTiles} active tiles, ${run.discoveredTiles} explored, ${run.progression.unlocked.heroes.length} hero${run.progression.unlocked.heroes.length === 1 ? '' : 'es'} available.`;
});
const crewHint = computed(() => {
  const lockedCount = 4 - crew.value.length;

  if (lockedCount > 0) {
    return `${lockedCount} more recruit${lockedCount === 1 ? '' : 's'} join once the colony can support more beds, more jobs, and stronger supply lines.`;
  }

  return 'Every recruit is already in the field now, so further growth comes from deeper production chains and upgraded infrastructure.';
});

function joinGame() {
  resumeGame();
}
</script>

<style scoped>
.story-title {
  background:
    radial-gradient(circle at top, rgba(251, 191, 36, 0.08), transparent 32%),
    linear-gradient(160deg, #0f172a 0%, #020617 55%, #02030a 100%);
}

.story-panel {
  position: relative;
  overflow: hidden;
  border-radius: 28px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.82), rgba(2, 6, 23, 0.9)),
    radial-gradient(circle at top left, rgba(251, 191, 36, 0.08), transparent 30%);
  padding: 1.5rem;
  box-shadow: 0 28px 70px rgba(2, 6, 23, 0.42);
  backdrop-filter: blur(18px);
}

.story-panel::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px);
  background-size: 100% 28px;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.35), transparent 88%);
  pointer-events: none;
}

.story-hero-panel {
  padding: 1.75rem;
}

.story-badge {
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(15, 23, 42, 0.66);
  padding: 0.4rem 0.7rem;
  color: rgba(226, 232, 240, 0.95);
}

.story-badge-primary {
  border-color: rgba(251, 191, 36, 0.24);
  background: rgba(251, 191, 36, 0.12);
  color: #fde68a;
}

.story-btn-primary {
  border-radius: 999px;
  border: 1px solid rgba(251, 191, 36, 0.45);
  background: linear-gradient(135deg, #f59e0b, #fcd34d);
  padding: 0.95rem 1.4rem;
  color: #111827;
  font-weight: 700;
  transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
  box-shadow: 0 16px 34px rgba(245, 158, 11, 0.28);
}

.story-btn-primary:hover {
  transform: translateY(-1px);
  filter: brightness(1.04);
  box-shadow: 0 20px 40px rgba(245, 158, 11, 0.32);
}

@media (max-width: 640px) {
  .story-panel {
    padding: 1.1rem;
    border-radius: 24px;
  }

  .story-hero-panel {
    padding: 1.2rem;
  }
}
</style>
