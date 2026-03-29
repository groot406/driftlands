import type { RunMutatorKey, RunMutatorSnapshot, RunStoryBeat } from '../goals/types.ts';

export interface StoryModeFeature {
  label: string;
  description: string;
}

export interface StoryModeActSummary {
  label: string;
  title: string;
  description: string;
}

interface StoryChapterTemplate {
  chapterId: string;
  actLabel: string;
  title: string;
  kicker: string;
  briefing: string;
  stakes: string;
  completionTitle: string;
  completionText: string;
  failureTitle: string;
  failureText: string;
  nextHint: string;
}

export const storyModeFeatures: StoryModeFeature[] = [
  {
    label: 'Chaptered charters',
    description: 'Each mission carries a named chapter, a clear stake, and a narrative payoff when you fulfill it.',
  },
  {
    label: 'Persistent frontier',
    description: 'The colony keeps its hard-won ground, and each charter unlocks more recruits, works, and terrain for the next push.',
  },
  {
    label: 'Guided priorities',
    description: 'Mutators still remix the economy, but the story now highlights what matters without rushing the mission.',
  },
];

export const storyModeActs: StoryModeActSummary[] = [
  {
    label: 'Act I',
    title: 'Landfall',
    description: 'Secure the first camp, map safe ground, and prove the drift can hold a settlement at all.',
  },
  {
    label: 'Act II',
    title: 'Roots And Ore',
    description: 'Turn a desperate beachhead into real infrastructure before supplies and nerves give out.',
  },
  {
    label: 'Act III',
    title: 'Signal Fires',
    description: 'Push far enough into the unknown that other crews can follow your light.',
  },
];

const STORY_CHAPTERS: StoryChapterTemplate[] = [
  {
    chapterId: 'landfall-in-the-shallows',
    actLabel: 'Act I',
    title: 'Landfall in the Shallows',
    kicker: 'The convoy has broken apart on the mudflats, and only your charter reached the center stone intact.',
    briefing: 'Before night closes over the shoals, you need a working camp, a mapped perimeter, and proof that Driftlands can be settled.',
    stakes: 'If the first lantern line fails, the fleet turns back to open water and the colony ends before it begins.',
    completionTitle: 'The first beacon holds',
    completionText: 'Lanterns answer from the dark water. Other boats can finally pick their way toward the colony without vanishing in the mist.',
    failureTitle: 'The shoreline goes dark',
    failureText: 'Without a marked camp and a stable shoreline, the fleet loses its nerve and the founding charter splinters in the surf.',
    nextHint: 'Quartermasters are already drafting a harsher second charter while the tide is still low.',
  },
  {
    chapterId: 'embers-under-canvas',
    actLabel: 'Act I',
    title: 'Embers Under Canvas',
    kicker: 'A settlement exists now, but it is still more rumor than refuge.',
    briefing: 'You have one small pocket of safety. The next charter is about turning that pocket into routines the whole expedition can trust.',
    stakes: 'If your camp cannot feed itself and raise stockpiles, every future landing will arrive hungry, cold, and ready to panic.',
    completionTitle: 'The camp learns its rhythm',
    completionText: 'Cookfires stay lit through the windbreaks, workers stop sleeping beside empty crates, and the shoreline begins to sound inhabited.',
    failureTitle: 'The camp never settles',
    failureText: 'A camp without reserves cannot keep its people steady. Restlessness spreads faster than any banner can answer it.',
    nextHint: 'The maps now point inland, toward stone ridges and the promise of deeper industry.',
  },
  {
    chapterId: 'the-hollow-below',
    actLabel: 'Act II',
    title: 'The Hollow Below',
    kicker: 'Surveyors have marked richer veins inland, but every step away from the docks stretches the colony thin.',
    briefing: 'This charter asks you to do more than survive. You need industry now: mines, hauling routes, and enough confidence to dig into the drift itself.',
    stakes: 'Without metal and proper works, the settlement remains a camp forever, one bad season away from collapse.',
    completionTitle: 'Stone answers the colony',
    completionText: 'The first mined loads return under cheering hands. For the first time, the drift feels like something that can support more than tents.',
    failureTitle: 'The ridges refuse you',
    failureText: 'When the mine fronts stall, every unfinished structure becomes a reminder that the colony still cannot shape the land it occupies.',
    nextHint: 'Command shifts its eyes back to the coast, where a broader frontier needs better approach routes.',
  },
  {
    chapterId: 'shore-of-echoes',
    actLabel: 'Act II',
    title: 'Shore of Echoes',
    kicker: 'The settlement now has weight, and the outer water has started carrying that weight back to you.',
    briefing: 'Dock works, hauled timber, and a wider frontier are the difference between a lonely camp and a colony that can receive people, tools, and hope.',
    stakes: 'If the shoreline remains crude, every new arrival becomes a gamble and every resupply run risks the rocks.',
    completionTitle: 'The harbor begins to speak',
    completionText: 'Pilings bite into the shallows, ropes sing in the wind, and incoming crews finally have a place to aim for besides a bonfire.',
    failureTitle: 'The water keeps its distance',
    failureText: 'Without cleaner approaches and proper works, the coast stays hostile, and the colony remains cut off from the help it needs.',
    nextHint: 'Beyond the harbor, scouts report shapes in the mist that could become whole districts if anyone dares reach them.',
  },
  {
    chapterId: 'signal-fires',
    actLabel: 'Act III',
    title: 'Signal Fires Beyond The Ridge',
    kicker: 'Your charter is no longer alone. Other crews are waiting for a sign that this frontier is worth following.',
    briefing: 'The colony must now expand on purpose. Push deeper, secure broader routes, and leave markers strong enough for distant crews to trust.',
    stakes: 'If your frontier stalls here, Driftlands stays a rumor and every surviving crew is forced to cling to the same narrow shore.',
    completionTitle: 'The horizon answers',
    completionText: 'Signal towers and work crews dot the map. The frontier feels inhabited, and the wider expedition finally starts moving to your rhythm.',
    failureTitle: 'The frontier narrows again',
    failureText: 'When the lights fail to spread, distant crews hesitate, and the drift closes back into something lonely and uncertain.',
    nextHint: 'Future charters will read more like chronicles than emergencies, but they will demand even more from the colony.',
  },
];

const MUTATOR_GUIDANCE: Record<RunMutatorKey, string> = {
  open_frontier: 'Scouts have the loudest voice in council today. Claim distance early and let the rest of the colony build behind that momentum.',
  timber_rush: 'Builders are setting the tempo. Wood, docks, and quick construction matter more than perfect efficiency right now.',
  prospectors_call: 'The charter is betting on industry. Establish mining quickly and keep ore moving before the inland routes harden against you.',
  foragers_feast: 'Quartermasters are nervous about lean weeks ahead. Stabilize food first so every later expansion has something to stand on.',
  roadworks_drive: 'Surveyors need reliable lanes now. Clear the rough ground, keep road crews moving, and stage supplies so every new district stays reachable.',
  new_hearths: 'Command is ready to light another hearth. Found the new town center first, then bind it back into the colony with roads crews can actually hold.',
};

function ordinal(value: number) {
  const remainder10 = value % 10;
  const remainder100 = value % 100;

  if (remainder10 === 1 && remainder100 !== 11) return `${value}st`;
  if (remainder10 === 2 && remainder100 !== 12) return `${value}nd`;
  if (remainder10 === 3 && remainder100 !== 13) return `${value}rd`;
  return `${value}th`;
}

function getChapterTemplate(missionNumber: number): StoryChapterTemplate {
  if (missionNumber <= STORY_CHAPTERS.length) {
    const chapter = STORY_CHAPTERS[missionNumber - 1];
    if (chapter) {
      return chapter;
    }
  }

  const frontierRing = Math.max(8, missionNumber + 3);

  return {
    chapterId: `frontier-chronicle-${missionNumber}`,
    actLabel: 'Frontier Chronicle',
    title: `Chronicle of the ${ordinal(missionNumber)} Charter`,
    kicker: `The colony has survived long enough for its crises to become history, but every new charter still asks more of the frontier.`,
    briefing: `Surveyors are now planning beyond the ${ordinal(frontierRing)} ring, where every outpost must pay for itself and every route has to justify the labor that keeps it open.`,
    stakes: 'Late charters are no longer about proving the colony can exist. They are about proving it can keep expanding without breaking the people who built it.',
    completionTitle: 'Another chapter enters the archive',
    completionText: 'The settlement absorbs the new ground, records the work, and turns another emergency into something future crews will call tradition.',
    failureTitle: 'The archive records a setback',
    failureText: 'Even a seasoned colony can stumble. When a late charter fails, the cost is measured in confidence, momentum, and the frontier left untended.',
    nextHint: 'The next charter will assume the colony still intends to grow, and it will ask for proof all over again.',
  };
}

export function createStoryBeat(
  missionNumber: number,
  frontierDistance: number,
  mutator: RunMutatorSnapshot,
): RunStoryBeat {
  const chapter = getChapterTemplate(missionNumber);

  return {
    chapterId: chapter.chapterId,
    chapterLabel: `Chapter ${missionNumber}`,
    actLabel: chapter.actLabel,
    title: chapter.title,
    kicker: chapter.kicker,
    briefing: chapter.briefing,
    stakes: chapter.stakes,
    guidance: `${MUTATOR_GUIDANCE[mutator.key]} Frontier survey currently reaches ring ${Math.max(frontierDistance, 1)}.`,
    completionTitle: chapter.completionTitle,
    completionText: chapter.completionText,
    failureTitle: chapter.failureTitle,
    failureText: chapter.failureText,
    nextHint: chapter.nextHint,
  };
}
