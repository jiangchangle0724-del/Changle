import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ServerMsg } from './protocol';
import { HostLink } from './host-link';

const transport = vi.hoisted(() => ({ receive: (_message: ServerMsg): void => {} }));
vi.mock('./socket', () => ({
  wsUrl: () => 'ws://localhost/test',
  RoomSocket: class {
    isOpen = true;
    constructor(_url: () => string, onMsg: (m: ServerMsg) => void) { transport.receive = onMsg; }
    send(): boolean { return true; }
    close(): void {}
  },
}));

const peers: Peer[] = [];
class Peer {
  remoteDescription: RTCSessionDescriptionInit | null = null;
  localDescription: RTCSessionDescriptionInit | null = null;
  accepted: RTCIceCandidateInit[] = [];
  rejected = 0;
  constructor() { peers.push(this); }
  createDataChannel(): { close(): void } { return { close() {} }; }
  async createOffer(): Promise<RTCSessionDescriptionInit> { return { type: 'offer', sdp: 'test offer' }; }
  async setLocalDescription(d: RTCSessionDescriptionInit): Promise<void> { this.localDescription = d; }
  async setRemoteDescription(d: RTCSessionDescriptionInit): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 10));
    this.remoteDescription = d;
  }
  async addIceCandidate(c: RTCIceCandidateInit): Promise<void> {
    // A real RTCPeerConnection rejects candidates while remoteDescription is null.
    // https://www.w3.org/TR/webrtc/#dom-rtcpeerconnection-addicecandidate
    if (!this.remoteDescription) {
      this.rejected++;
      throw new DOMException('remoteDescription is null', 'InvalidStateError');
    }
    this.accepted.push(c);
  }
  close(): void {}
}

let host: HostLink;
const candidate = { candidate: 'candidate:1 1 udp 1 127.0.0.1 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 } satisfies RTCIceCandidateInit;
const relay = (data: Extract<ServerMsg, { t: 'relay' }>['data']): void => {
  transport.receive({ t: 'relay', from: { seat: 'pad-00000001' }, data });
};
const settle = async (): Promise<void> => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('RTCPeerConnection', Peer);
  peers.length = 0;
  host = new HostLink('ABCD', {}, 'http://localhost');
  transport.receive({ t: 'room', room: { code: 'ABCD', phase: 'playing', hostConnected: true,
    seats: [{ id: 'pad-00000001', name: '阿一', color: 0, connected: true }], watchers: 0, age: 0 } });
  relay({ k: 'hello' });
  await settle();
  expect(peers[0]!.localDescription?.type).toBe('offer');
});
afterEach(() => {
  host.close();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('重连的 answer 先到时，后来的 ICE 候选正常交给 PeerConnection', async () => {
  relay({ k: 'sdp', sdp: { type: 'answer', sdp: 'test answer' } });
  await vi.advanceTimersByTimeAsync(10);
  relay({ k: 'ice', ice: candidate });
  await settle();
  expect(peers[0]!.accepted).toEqual([candidate]);
});

// C4 found HostLink dropped ICE arriving while setRemoteDescription was pending; it now queues it as PadLink does.
// Real browsers also chain addIceCandidate behind setRemoteDescription, so this is hardening, not the cause of a timeout.
it('重连的 answer 还在异步安装时收到 ICE，安装好后仍保留候选', async () => {
  relay({ k: 'sdp', sdp: { type: 'answer', sdp: 'test answer' } });
  relay({ k: 'ice', ice: candidate });
  await vi.advanceTimersByTimeAsync(10);
  await settle();
  expect(peers[0]!.remoteDescription?.type).toBe('answer');
  expect(peers[0]!.accepted).toEqual([candidate]);
});
