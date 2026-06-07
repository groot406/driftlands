import type { Socket } from 'socket.io';
import type { ChangelogAckMessage, ChangelogSnapshotMessage, PlayerJoinMessage } from '../../../src/shared/protocol.ts';
import type { ReleaseChangelogEntry } from '../../../src/shared/changelog/changelog.ts';
import { generatedChangelogEntries } from '../../../src/shared/changelog/generated.ts';
import { sendToSocket, serverMessageRouter } from '../messages/messageRouter.ts';
import { playerSettlementState } from '../state/playerSettlementState.ts';

export class ServerChangelogHandler {
  private readonly entries: ReleaseChangelogEntry[];
  private readonly nowProvider: () => number;

  constructor(entries: ReleaseChangelogEntry[] = generatedChangelogEntries, nowProvider: () => number = () => Date.now()) {
    this.entries = entries;
    this.nowProvider = nowProvider;
  }

  init(): void {
    serverMessageRouter.on('player:join', this.handlePlayerJoin.bind(this));
    serverMessageRouter.on('changelog:ack', this.handleChangelogAck.bind(this));
  }

  private handlePlayerJoin(socket: Socket, _message: PlayerJoinMessage): void {
    const playerId = playerSettlementState.getSocketPlayerId(socket.id);
    const loginCheckpoint = playerSettlementState.recordLoginForChangelog(playerId, this.nowProvider());
    const message: ChangelogSnapshotMessage = {
      type: 'changelog:snapshot',
      entries: this.entries.map((entry) => ({ ...entry, bullets: entry.bullets.slice() })),
      lastSeenChangelogAt: loginCheckpoint.checkpointAt,
    };

    sendToSocket(socket, message);
  }

  private handleChangelogAck(socket: Socket, message: ChangelogAckMessage): void {
    const playerId = playerSettlementState.getSocketPlayerId(socket.id);
    playerSettlementState.setLastSeenChangelogAt(playerId, message.seenAt);
  }
}
