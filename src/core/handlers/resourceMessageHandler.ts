import type {ResourceDepositMessage, ResourceWithdrawMessage} from "../../shared/protocol.ts";
import {clientMessageRouter} from "../messageRouter.ts";
import {getHero} from "../../store/heroStore.ts";
import {depositResourceToStorage, withdrawResourceFromStorage} from "../../store/resourceStore.ts";
import {playPositionalSound} from "../../store/soundStore.ts";
import {triggerCameraShake} from "../camera.ts";
import {triggerGameplayImpact} from "../gameFeel.ts";

class ClientResourceHandler {
    private initialized = false;

    init(): void {
        if (this.initialized) {
            return;
        }

        this.initialized = true;
        clientMessageRouter.on('resource:deposit', this.handleResourceDeposit.bind(this));
        clientMessageRouter.on('resource:withdraw', this.handleResourceWithdraw.bind(this));
    }

    private handleResourceDeposit(message: ResourceDepositMessage): void {
        const hero = getHero(message.heroId);
        depositResourceToStorage(message.storageTileId, message.resource.type, message.resource.amount);

        if (hero?.carryingPayload?.type === message.resource.type && hero.carryingPayload.amount > 0) {
            const remaining = hero.carryingPayload.amount - message.resource.amount;
            hero.carryingPayload = remaining > 0 ? { type: hero.carryingPayload.type, amount: remaining } : undefined;
        }

        if (!hero) {
            return;
        }

        playPositionalSound(hero.id + ':resource_deposit', 'drop.mp3', hero.q, hero.r, { baseVolume: 0.5, maxDistance: 10, loop: false } );
        triggerGameplayImpact({
            q: hero.q,
            r: hero.r,
            kind: 'deposit',
            terrain: 'towncenter',
            resourceType: message.resource.type,
            amount: message.resource.amount,
            heroIds: [hero.id],
        });
        triggerCameraShake({
            q: hero.q,
            r: hero.r,
            intensity: Math.min(9, 3.2 + (message.resource.amount * 0.85)),
            durationMs: 170,
            falloffRadius: 7,
            frequency: 13,
            directional: true,
            pushScale: 0.5,
        });
    }

    private handleResourceWithdraw(message: ResourceWithdrawMessage): void {
        withdrawResourceFromStorage(message.storageTileId, message.resource.type, message.resource.amount);

        const hero = getHero(message.heroId);
        if (!hero) {
            return;
        }

        playPositionalSound(hero.id + ':resource_fetch', 'take.mp3', hero.q, hero.r, { baseVolume: 0.5, maxDistance: 10, loop: false } );
    }
}

export const resourceMessageHandler = new ClientResourceHandler();
