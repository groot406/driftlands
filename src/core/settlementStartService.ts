import { markSettlementStartFounding } from '../store/settlementStartStore.ts';
import { sendMessage } from './socket.ts';

export function requestSettlementStartOptions() {
  sendMessage({
    type: 'settlement:request_start_options',
    timestamp: Date.now(),
  });
}

export function requestFoundSettlement(candidateId: string) {
  markSettlementStartFounding(candidateId);
  sendMessage({
    type: 'settlement:found_request',
    candidateId,
    timestamp: Date.now(),
  });
}

export function requestFoundSettlementAt(q: number, r: number) {
  const candidateId = `free-start:${q}:${r}`;
  markSettlementStartFounding(candidateId);
  sendMessage({
    type: 'settlement:found_request',
    q,
    r,
    timestamp: Date.now(),
  });
}
