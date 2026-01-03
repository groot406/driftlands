import type {ResourceDepositMessage, ResourceWithdrawMessage} from "../../shared/protocol.ts";
import {clientMessageRouter} from "../messageRouter.ts";
import {getHero} from "../../store/heroStore.ts";
import {depositResource, withdrawResource} from "../../store/resourceStore.ts";
import {playPositionalSound} from "../../store/soundStore.ts";

class ClientResourceHandler {
    init(): void {
        clientMessageRouter.on('resource:deposit', this.handleResourceDeposit.bind(this));
        clientMessageRouter.on('resource:withdraw', this.handleResourceWithdraw.bind(this));
    }

    private handleResourceDeposit(message: ResourceDepositMessage): void {
        const hero = getHero(message.heroId);
        if (!hero) {
            return;
        }

        hero.carryingPayload = undefined;
        depositResource(message.resource.type, message.resource.amount);
        playPositionalSound(hero.id + ':resource_deposit', 'drop.mp3', hero.q, hero.r, { baseVolume: 0.5, maxDistance: 10, loop: false } );
    }

    private handleResourceWithdraw(message: ResourceWithdrawMessage): void {
        const hero = getHero(message.heroId);
        if (!hero) {
            return;
        }

        // When a hero picks up resources from warehouse, reflect it on the client UI inventory.
        withdrawResource(message.resource.type, message.resource.amount);
        playPositionalSound(hero.id + ':resource_fetch', 'take.mp3', hero.q, hero.r, { baseVolume: 0.5, maxDistance: 10, loop: false } );
    }
}

export const resourceMessageHandler = new ClientResourceHandler();
