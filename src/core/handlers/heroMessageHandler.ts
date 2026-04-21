import type {HeroAbilityUpdateMessage, HeroPayloadUpdateMessage, HeroScoutResourceUpdateMessage} from '../../shared/protocol';
import {clientMessageRouter} from '../messageRouter';
import {getHero} from '../../store/heroStore';
import { SCOUT_RESOURCE_TASK_TYPE } from '../../shared/game/scoutResources';

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
        hero.abilityCharges = message.abilityCharges;
        hero.xpChargeProgress = message.xpChargeProgress;
        hero.abilityChargesEarned = message.abilityChargesEarned;
    }
}

export const heroMessageHandler = new ClientHeroHandler();
