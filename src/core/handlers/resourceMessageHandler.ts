import type {ResourceDepositMessage, ResourceWithdrawMessage} from "../../shared/protocol.ts";
import {clientMessageRouter} from "../messageRouter.ts";
import {getHero} from "../../store/heroStore.ts";
import {depositResourceToStorage, withdrawResourceFromStorage} from "../../store/resourceStore.ts";
import {playPositionalSound} from "../../store/soundStore.ts";
import {triggerCameraShake} from "../camera.ts";
import {triggerGameplayImpact} from "../gameFeel.ts";
import {addTextIndicator} from "../textIndicators.ts";
import {tileIndex} from "../world.ts";
import { currentPlayerSettlementId } from "../../store/settlementStartStore.ts";
import { currentPlayerId } from "../socket.ts";

function isLocalHeroEvent(hero: { playerId?: string | null; settlementId?: string | null } | null | undefined) {
    if (!hero) {
        return false;
    }

    if (currentPlayerSettlementId.value && hero.settlementId === currentPlayerSettlementId.value) {
        return true;
    }

    return !!currentPlayerId.value && hero.playerId === currentPlayerId.value;
}

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

        const storageTile = tileIndex[message.storageTileId];
        const localEvent = isLocalHeroEvent(hero);

        if (localEvent) {
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
            addTextIndicator(storageTile ?? hero, `+${message.resource.amount}`, '#fff1a8', 1300);
            triggerCameraShake({
                q: hero.q,
                r: hero.r,
                intensity: Math.min(4.8, 1.7 + (message.resource.amount * 0.42)),
                durationMs: 130,
                falloffRadius: 6,
                frequency: 10,
                directional: true,
                pushScale: 0.34,
            });
        }
    }

    private handleResourceWithdraw(message: ResourceWithdrawMessage): void {
        withdrawResourceFromStorage(message.storageTileId, message.resource.type, message.resource.amount);

        const hero = getHero(message.heroId);
        if (!hero) {
            return;
        }

        if (isLocalHeroEvent(hero)) {
            playPositionalSound(hero.id + ':resource_fetch', 'take.mp3', hero.q, hero.r, { baseVolume: 0.5, maxDistance: 10, loop: false } );
        }
    }
}

export const resourceMessageHandler = new ClientResourceHandler();
