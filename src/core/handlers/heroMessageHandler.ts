import type {HeroPayloadUpdateMessage} from '../../shared/protocol';
import {clientMessageRouter} from '../messageRouter';
import {getHero} from '../../store/heroStore';

class ClientHeroHandler {
    private initialized = false;

    init(): void {
        if (this.initialized) {
            return;
        }

        this.initialized = true;
        clientMessageRouter.on('hero:payload_update', this.handlePayloadUpdate.bind(this));
    }

    private handlePayloadUpdate(message: HeroPayloadUpdateMessage): void {
        const hero = getHero(message.heroId);
        if (!hero) return;
        hero.carryingPayload = message.payload || undefined;
    }
}

export const heroMessageHandler = new ClientHeroHandler();
