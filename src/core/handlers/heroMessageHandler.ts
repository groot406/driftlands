import type {HeroAbilityUpdateMessage, HeroPayloadUpdateMessage, HeroScoutResourceUpdateMessage} from '../../shared/protocol';
import {clientMessageRouter} from '../messageRouter';
import {getHero} from '../../store/heroStore';
import { SCOUT_RESOURCE_TASK_TYPE } from '../../shared/game/scoutResources';
import { addTextIndicator } from '../textIndicators';
import { playPositionalSound } from '../../store/soundStore';
import { addNotification } from '../../store/notificationStore';

class ClientHeroHandler {
    private initialized = false;

    init(): void {
        if (this.initialized) {
            return;
        }

        this.initialized = true;
        clientMessageRouter.on('hero:payload_update', this.handlePayloadUpdate.bind(this));
        clientMessageRouter.on('hero:scout_resource_update', this.handleScoutResourceUpdate.bind(this));
        clientMessageRouter.on('hero:ability_update', this.handleAbilityUpdate.bind(this));
    }

    private handlePayloadUpdate(message: HeroPayloadUpdateMessage): void {
        const hero = getHero(message.heroId);
        if (!hero) return;
        hero.carryingPayload = message.payload || undefined;
    }

    private handleScoutResourceUpdate(message: HeroScoutResourceUpdateMessage): void {
        const hero = getHero(message.heroId);
        if (!hero) return;
        hero.scoutResourceIntent = message.intent || undefined;
        if (!message.intent && hero.pendingTask?.taskType === SCOUT_RESOURCE_TASK_TYPE) {
            hero.pendingTask = undefined;
        }
    }

    private handleAbilityUpdate(message: HeroAbilityUpdateMessage): void {
        const hero = getHero(message.heroId);
        if (!hero) return;
        const earnedSkillPointDelta = Math.max(0, message.skillPointsEarned - (hero.skillPointsEarned ?? 0));
        hero.abilityCharges = message.abilityCharges;
        hero.xpChargeProgress = message.xpChargeProgress;
        hero.abilityChargesEarned = message.abilityChargesEarned;
        hero.skillPoints = message.skillPoints;
        hero.skillPointsEarned = message.skillPointsEarned;
        hero.skills = { ...message.skills };

        if (earnedSkillPointDelta > 0) {
            this.announceSkillPointReady(hero, earnedSkillPointDelta);
        }
    }

    private announceSkillPointReady(hero: NonNullable<ReturnType<typeof getHero>>, amount: number): void {
        const plural = amount === 1 ? '' : 's';
        addTextIndicator(hero, amount === 1 ? 'Skill point ready' : `+${amount} skill points`, '#fde047', 2400);
        void playPositionalSound(
            `${hero.id}:skill_point:${hero.skillPointsEarned ?? amount}`,
            'success.mp3',
            hero.q,
            hero.r,
            { baseVolume: 0.55, maxDistance: 14, loop: false },
        );
        addNotification({
            type: 'hero_skill',
            title: 'Skill point ready',
            message: `${hero.name} earned ${amount} skill point${plural}. Open Skills to choose an upgrade.`,
            duration: 6500,
        });
    }
}

export const heroMessageHandler = new ClientHeroHandler();
