# Extracted Game Bugs

This file lists the concrete bugs and broken behaviours mentioned in the playtest conversation. Design suggestions, balance issues, and future feature ideas are excluded unless they were described as currently broken or not working.

## 1. Large World (200) button crashes the server

**Description:**  
The debug menu contains a `[Large world (200)]` button, but pressing it currently crashes the server. The rest of the debug menu buttons were described as safe to use, which makes this button a clear known crash case rather than a general instability issue.

**Where it occurs:**  
Debug menu opened with `[TAB]`.

**Observed behaviour:**  
Clicking `[Large world (200)]` crashes the server.

**Expected behaviour:**  
The button should either generate/load a large world safely or be disabled/hidden until the feature is stable.

**Severity:** High / Critical

---

## 2. Planting saplings on grass gives XP but does not plant saplings

**Description:**  
The scout was observed repeatedly moving between two spots, performing the plant-sapling task, and receiving `10 XP` each time. However, no saplings were actually being planted. It was later confirmed that planting saplings on grass does not work yet.

**Where it occurs:**  
Sapling planting task on grass tiles.

**Observed behaviour:**  
The hero executes the task and receives XP, but the tile does not change and no sapling appears.

**Expected behaviour:**  
If the task is valid, a sapling should be placed on the target tile. If grass planting is not supported yet, the task should be unavailable or should fail without awarding XP.

**Severity:** Medium / High

---

## 3. Scout can get stuck looping between two spots while planting saplings

**Description:**  
Related to the sapling bug, the scout appeared to be stuck in a back-and-forth loop between two locations while repeatedly attempting to plant saplings. Because the action did not produce a valid result but still completed enough to award XP, the hero entered an unintended repetitive behaviour.

**Where it occurs:**  
Hero/scout task execution while assigned to plant saplings.

**Observed behaviour:**  
The scout moves back and forth, repeats the same failed task, and continues receiving XP.

**Expected behaviour:**  
The hero should either complete the task once successfully, stop when the task is invalid, or request a new valid task. Failed tasks should not cause infinite loops or repeated XP gain.

**Severity:** Medium

---

## 4. Population display/objective state is incorrect after reaching 4/4

**Description:**  
The player reported confusion around a guide/objective step mentioning perimeter security and noted that the population needed to be correctly updated to `4/4`. This suggests the UI or guide state was showing outdated or incorrect population progress.

**Where it occurs:**  
Story/hint/objective UI, likely around the perimeter security or early settlement progression step.

**Observed behaviour:**  
The displayed population/objective progress did not accurately reflect the current state.

**Expected behaviour:**  
The guide should update immediately and accurately when population reaches the required value.

**Severity:** Medium

---

## 5. Hero fishing at dock is broken

**Description:**  
Fishing at the dock by a hero/avatar was described as currently broken. NPC settlers are supposed to fish at the dock automatically, but the hero-specific fishing action does not work.

**Where it occurs:**  
Dock interaction / hero fishing task.

**Observed behaviour:**  
Hero fishing at the dock does not work.

**Expected behaviour:**  
A hero should be able to execute a dock fishing task, or the task should be hidden/disabled until implemented.

**Severity:** Medium

---

## 6. Dock/settler fishing appears unclear or possibly not producing food

**Description:**  
The player reported that NPCs did not seem to be fishing and that the settlement had no food while a resident died. The response clarified that settlers also consume food and that the population may have exceeded food production. This may be a balance/visibility issue rather than a confirmed bug, but it should be investigated because the player perceived automated fishing as not working.

**Where it occurs:**  
Dock jobsite and settler food production.

**Observed behaviour:**  
Food remained at zero or insufficient levels even after building a dock, and population declined.

**Expected behaviour:**  
If a dock has an assigned settler and visible surrounding water tiles, it should reliably produce food at the expected rate. The UI should make it clear whether the dock is staffed, producing, blocked, offline, or outpaced by consumption.

**Severity:** Low / Medium

---

## 7. Missing forward navigation in story/hint messages

**Description:**  
The player could open previous guide/story messages using a back button, but could not navigate forward again. This caused confusion when revisiting older instructions and trying to return to the current step.

**Where it occurs:**  
Story/hint/quest popup navigation.

**Observed behaviour:**  
Back navigation exists, but forward navigation is missing.

**Expected behaviour:**  
The story/hint UI should support both backward and forward navigation, or clearly distinguish old messages from the current active objective.

**Severity:** Low / Medium

---

## 8. Old guide messages can make players think completed objectives are still active

**Description:**  
The player reread old guide messages and became confused about whether they still needed to complete earlier objectives such as building a house, watchtower, or supply building. Although this may be more UX than technical bug, it causes objective-state confusion.

**Where it occurs:**  
Guide/story history UI.

**Observed behaviour:**  
Completed instructions remain accessible in a way that can look like active tasks.

**Expected behaviour:**  
Old guide messages should be clearly marked as completed/history, while the current active objective should be visually distinct.

**Severity:** Low

---

## 9. Perimeter security objective is unclear

**Description:**  
The player explicitly asked what “perimeter security” means and how to complete it. This appears to be an unclear objective label or insufficient instruction in the guide system.

**Where it occurs:**  
Story/hint/objective UI.

**Observed behaviour:**  
The objective text does not clearly explain the required action.

**Expected behaviour:**  
The objective should specify the exact action, such as building a watchtower, wall, or other defensive structure, and indicate where or how to place it.

**Severity:** Low

---

## 10. Skills system is not functioning as intended

**Description:**  
The player asked what the skills mean. It was explained that skills were intended to work as stat buffs or task modifiers, such as skipping wait time once, but that the system is not currently a strong mechanism and needs work.

**Where it occurs:**  
Hero skills / task execution modifiers.

**Observed behaviour:**  
Skills are unclear and do not yet behave as a polished or meaningful mechanic.

**Expected behaviour:**  
Skills should have clear names, descriptions, effects, and predictable usage during task execution.

**Severity:** Low / Medium

---

## 11. Surveying system is underdeveloped and unclear

**Description:**  
The player asked what surveying a tile does and whether they should wait before using it. The explanation was that surveying searches for hidden tile specifications, such as discovering that a forest is actually a dense forest, but the mechanic was described as not strong yet and needing work.

**Where it occurs:**  
Tile surveying action.

**Observed behaviour:**  
The mechanic is not self-explanatory and may not yet provide strong feedback or value.

**Expected behaviour:**  
Surveying should clearly communicate cost, duration, result, and gameplay impact, such as revealing hidden resource modifiers.

**Severity:** Low

---

## 12. Place lily pads may appear broken when the required resource is missing

**Description:**  
The player asked whether “place lily pads” was not working. It was explained that the action requires a lily pad resource, which must first be harvested. This is likely not a functional bug, but the UI does not appear to explain the missing requirement clearly enough.

**Where it occurs:**  
Place lily pad task / water traversal mechanic.

**Observed behaviour:**  
The player tried or considered placing lily pads and thought the action might be broken.

**Expected behaviour:**  
The UI should clearly show that a lily pad resource is required, how many are needed, and where to harvest one.

**Severity:** Low

---

## 13. Dock repair process is unclear

**Description:**  
The player asked how to repair the dock. Later, maintenance and repairs were explained: idle settlers repair buildings using wood/stone from a supply depot. This suggests the repair system exists but lacks clear discoverability and status feedback.

**Where it occurs:**  
Building maintenance/repair system, especially dock repairs.

**Observed behaviour:**  
The player did not know how to repair a damaged/offline dock.

**Expected behaviour:**  
Damaged buildings should show repair requirements, whether idle settlers are available, whether materials are available, and why repairs are or are not happening.

**Severity:** Low / Medium

---

## 14. Buildings can go offline due to missing maintenance without clear warning

**Description:**  
Some buildings were going offline because of missing maintenance. The maintenance mechanic requires idle settlers and materials, but this had not been surfaced clearly to the player before buildings started failing.

**Where it occurs:**  
Building maintenance system.

**Observed behaviour:**  
Buildings go offline when there are not enough idle settlers or materials for maintenance.

**Expected behaviour:**  
The game should warn the player before buildings go offline and explain the required corrective action: increase population, free up idle settlers, or provide repair materials.

**Severity:** Medium

---

## 15. Mobile UI buttons are too large

**Description:**  
The game works on mobile, but the buttons were described as too large and requiring UI optimization.

**Where it occurs:**  
Mobile UI.

**Observed behaviour:**  
Buttons are oversized on mobile screens.

**Expected behaviour:**  
Mobile controls should be scaled and laid out appropriately for smaller screens.

**Severity:** Low

---

## 16. Tutorial/guide may not provide enough direction for new players

**Description:**  
The player repeatedly noted that the game needs stronger onboarding, clearer instructions, and possibly forced completion of guide steps before advancing. This is primarily a UX issue, but it affects playability because players can get pulled into later tasks before understanding earlier systems.

**Where it occurs:**  
Early-game tutorial, quest/hint system, objective progression.

**Observed behaviour:**  
The player can miss or misinterpret required steps, move ahead prematurely, and later become confused about what to do next.

**Expected behaviour:**  
The tutorial should guide the player through core actions in sequence: exploring, chopping wood, building houses, finding water, building a dock, hunting, farming, storage, and maintenance.

**Severity:** Medium

