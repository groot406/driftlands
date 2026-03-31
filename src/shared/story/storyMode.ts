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
    briefing: 'Before night closes over the shoals, you need a working camp, a mapped perimeter, and proof that Driftlands can be settled. Scout the frontier, clear the first stands, and lay a road so the next crew has something to follow.',
    stakes: 'If the first lantern line fails, the fleet turns back to open water and the colony ends before it begins.',
    completionTitle: 'The first beacon holds',
    completionText: 'Lanterns answer from the dark water. Other boats can finally pick their way toward the colony without vanishing in the mist.',
    failureTitle: 'The shoreline goes dark',
    failureText: 'Without a marked camp and a stable shoreline, the fleet loses its nerve and the founding charter splinters in the surf.',
    nextHint: 'The shore crew is unloading building kits. A dock and proper shelter would change everything.',
  },
  {
    chapterId: 'embers-under-canvas',
    actLabel: 'Act I',
    title: 'Embers Under Canvas',
    kicker: 'A settlement exists now, but it is still more rumor than refuge.',
    briefing: 'The shore crew has brought dock timbers and house frames. Build a landing point, raise the first shelter, and forage the shallows so the camp has more than campfire promises to offer.',
    stakes: 'If your camp cannot shelter its people and reach the water, every future landing will arrive hungry, cold, and ready to panic.',
    completionTitle: 'The camp learns its rhythm',
    completionText: 'Cookfires stay lit through the windbreaks, workers stop sleeping beside empty crates, and the shoreline begins to sound inhabited.',
    failureTitle: 'The camp never settles',
    failureText: 'A camp without shelter and a working shore cannot keep its people steady. Restlessness spreads faster than any banner can answer it.',
    nextHint: 'The soil here is rich enough to farm. Someone should try tilling the inland plots.',
  },
  {
    chapterId: 'the-first-harvest',
    actLabel: 'Act I',
    title: 'The First Harvest',
    kicker: 'Foraging keeps the camp fed day to day, but real growth demands grain in the ground.',
    briefing: 'Turn the inland plots into working farmland. Till the earth, plant seeds, and bring in the colony\'s first real harvest before the foraging runs thin.',
    stakes: 'A colony that cannot farm is a colony on borrowed time. Without grain, every new mouth is a liability.',
    completionTitle: 'Golden rows stand in the drift',
    completionText: 'The first sheaves come in under tired but steady hands. The colony has food it grew itself, and that changes the arithmetic of survival entirely.',
    failureTitle: 'The fields stay fallow',
    failureText: 'Empty fields and hungry settlers make for bitter councils. Without a harvest, expansion talk dies in the same breath it starts.',
    nextHint: 'The crops need more water than rain provides. A well and proper irrigation could double the yield.',
  },
  {
    chapterId: 'water-from-the-deep',
    actLabel: 'Act I',
    title: 'Water from the Deep',
    kicker: 'A new recruit has arrived with engineering knowledge, and the surveyors have found the water table.',
    briefing: 'Sink a well, learn to irrigate the dry inland plots, and prove the colony can bring water wherever it needs it. Your new crew member has ideas that could reshape the landscape.',
    stakes: 'Dry soil produces nothing. Without inland water, the colony is pinned to the coast and every farm plot is a gamble on the weather.',
    completionTitle: 'Clear water rises',
    completionText: 'The well draws clean and steady. Irrigation channels fan out from the source, and plots that were cracked earth yesterday are dark with promise.',
    failureTitle: 'The ground stays parched',
    failureText: 'Without working wells the inland plots crack and curl. The colony contracts back toward the shore, losing ground it thought it had claimed.',
    nextHint: 'The quartermasters want proper food storage and a watchtower to keep the perimeter secure.',
  },
  {
    chapterId: 'stores-and-sentries',
    actLabel: 'Act II',
    title: 'Stores and Sentries',
    kicker: 'The colony feeds itself now, but one bad week could empty every barrel.',
    briefing: 'Build a granary to preserve the harvest, raise a watchtower to secure the perimeter, and get the docks producing fish. The colony needs reserves and vigilance before it can afford to grow.',
    stakes: 'Without storage the harvest rots, and without lookouts the frontier closes in overnight. Both must come before the next push.',
    completionTitle: 'The perimeter holds steady',
    completionText: 'Sentries call the hours from the tower, sealed barrels line the granary walls, and for the first time the colony feels like something that could last.',
    failureTitle: 'Stores run dry, sentries see nothing',
    failureText: 'Unsecured grain draws vermin and an unwatched frontier breeds surprises. The colony stumbles into its next crisis unprepared.',
    nextHint: 'Surveyors have marked richer veins inland, in the mountain ridges beyond the tree line.',
  },
  {
    chapterId: 'the-hollow-below',
    actLabel: 'Act II',
    title: 'The Hollow Below',
    kicker: 'Surveyors have marked richer veins inland, but every step away from the docks stretches the colony thin.',
    briefing: 'Establish a mine in the mountain ridges and start hauling ore back to camp. The colony needs metal if it wants to build anything that lasts beyond the first winter.',
    stakes: 'Without metal and proper works, the settlement remains a camp forever, one bad season away from collapse.',
    completionTitle: 'Stone answers the colony',
    completionText: 'The first mined loads return under cheering hands. For the first time, the drift feels like something that can support more than tents.',
    failureTitle: 'The ridges refuse you',
    failureText: 'When the mine fronts stall, every unfinished structure becomes a reminder that the colony still cannot shape the land it occupies.',
    nextHint: 'A seasoned frontier hand has arrived. With proper logistics, the colony could start running supply chains.',
  },
  {
    chapterId: 'shore-of-echoes',
    actLabel: 'Act II',
    title: 'Shore of Echoes',
    kicker: 'A fourth veteran has joined the expedition, and the inland routes need proper staging.',
    briefing: 'Build a supply depot to stage materials, establish a lumber camp for sustainable timber, and tighten the hauling routes. The colony is ready for real logistics.',
    stakes: 'If the supply lines stay improvised, every construction job becomes a scramble and the frontier stalls under its own weight.',
    completionTitle: 'The harbor begins to speak',
    completionText: 'Pilings bite into the shallows, ropes sing in the wind, and incoming crews finally have a place to aim for besides a bonfire.',
    failureTitle: 'The water keeps its distance',
    failureText: 'Without cleaner approaches and proper works, the coast stays hostile, and the colony remains cut off from the help it needs.',
    nextHint: 'Beyond the harbor, scouts report harsh ground: snowfields and desert stretches that test everything the colony has learned.',
  },
  {
    chapterId: 'the-bitter-rings',
    actLabel: 'Act III',
    title: 'The Bitter Rings',
    kicker: 'The frontier has reached terrain the colony has never faced: frozen wastes and sun-scorched flats.',
    briefing: 'Push into the snowfields and desert using everything you have built so far. No new tools here, just harsher conditions and longer supply lines. Prove the colony can handle adversity.',
    stakes: 'If the colony cannot work hostile ground with its current toolkit, every ring beyond this one will break the expedition.',
    completionTitle: 'Hard ground, harder people',
    completionText: 'Crews return from the frost and the sand with sunburn and frostbite but also with confidence. The colony can survive anything the drift throws at it.',
    failureTitle: 'The frontier bites back',
    failureText: 'Harsh terrain and thin supply lines grind the advance to a halt. The colony retreats to familiar ground and the outer rings remain unclaimed.',
    nextHint: 'Command believes the colony is ready for something bigger: a second town center to anchor a whole new district.',
  },
  {
    chapterId: 'a-second-hearth',
    actLabel: 'Act III',
    title: 'A Second Hearth',
    kicker: 'The colony is no longer a camp. It is time to found a second settlement and double the frontier.',
    briefing: 'Choose a site deep in the frontier and build a town center. Connect it with roads and supply lines. A second hearth means the colony can grow in two directions at once.',
    stakes: 'A single settlement has a single point of failure. Without a second anchor, one disaster can end everything.',
    completionTitle: 'Two fires burn in the drift',
    completionText: 'The new town center lights its first lantern and the road between the two settlements fills with carts. The colony has doubled its footprint overnight.',
    failureTitle: 'The second site falls silent',
    failureText: 'An unfounded district is just an empty promise on the map. The colony remains a single settlement, vulnerable and pinned.',
    nextHint: 'Scouts have found something at the edge of the map: a volcanic ridge that could hold the rarest resources or the greatest danger.',
  },
  {
    chapterId: 'signal-fires',
    actLabel: 'Act III',
    title: 'Signal Fires Beyond The Ridge',
    kicker: 'Your charter is no longer alone. Other crews are waiting for a sign that this frontier is worth following.',
    briefing: 'The volcanic ridge marks the edge of the known drift. Push to it, secure it, and leave signal fires strong enough for distant crews to trust. This is the final proving ground.',
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
