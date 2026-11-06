import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS, RoomError, createRoom, overSessionLimit, reduce } from './room-state';
import type { RoomEvent, RoomState } from './types';

const join = (id: string, at: number, isHost = false): RoomEvent => ({
  type: 'PLAYER_JOINED', at, player: { id, name: id.toUpperCase(), isHost },
});

function lobbyWithHost(): RoomState {
  let s = createRoom('ABCD', 0);
  s = reduce(s, { type: 'SPEAKER_CONNECTED', at: 1 });
  s = reduce(s, join('steve', 2));
  s = reduce(s, join('jackie', 3));
  return s;
}

describe('joining', () => {
  it('first player becomes host, later ones do not even if they ask', () => {
    let s = createRoom('ABCD', 0);
    s = reduce(s, join('a', 1));
    s = reduce(s, join('b', 2, true));
    expect(s.players.map((p) => [p.id, p.isHost])).toEqual([['a', true], ['b', false]]);
  });

  it('rejoining keeps the seat and host flag', () => {
    let s = lobbyWithHost();
    s = reduce(s, { type: 'PLAYER_JOINED', at: 9, player: { id: 'steve', name: 'Steve J', isHost: false } });
    expect(s.players.length).toBe(2);
    expect(s.players[0]).toMatchObject({ id: 'steve', name: 'Steve J', isHost: true });
  });

  it('caps the room', () => {
    let s = createRoom('ABCD', 0);
    for (let i = 0; i < MAX_PLAYERS; i++) s = reduce(s, join(`p${i}`, i));
    expect(() => reduce(s, join('extra', 99))).toThrow(RoomError);
  });

  it('promotes the next player when the host leaves', () => {
    let s = lobbyWithHost();
    s = reduce(s, { type: 'PLAYER_LEFT', at: 10, playerId: 'steve' });
    expect(s.players).toHaveLength(1);
    expect(s.players[0]).toMatchObject({ id: 'jackie', isHost: true });
  });

  it('only the host can kick, and not themselves', () => {
    const s = lobbyWithHost();
    expect(() => reduce(s, { type: 'KICK', at: 10, byPlayerId: 'jackie', playerId: 'steve' })).toThrow('not the host');
    expect(() => reduce(s, { type: 'KICK', at: 10, byPlayerId: 'steve', playerId: 'steve' })).toThrow(RoomError);
    const after = reduce(s, { type: 'KICK', at: 10, byPlayerId: 'steve', playerId: 'jackie' });
    expect(after.players.map((p) => p.id)).toEqual(['steve']);
  });
});

describe('happy path: calibrate → learn → dance → results', () => {
  it('walks the whole flow', () => {
    let s = lobbyWithHost();
    s = reduce(s, { type: 'START_CALIBRATION', at: 10, byPlayerId: 'steve' });
    expect(s.phase).toBe('calibrating');
    s = reduce(s, { type: 'CALIBRATED', at: 20, audioOffsetMs: 180 });
    expect(s.phase).toBe('lobby');
    expect(s.audioOffsetMs).toBe(180);
    s = reduce(s, { type: 'START_LEARNING', at: 30, byPlayerId: 'steve', routineId: 'easy-square-1', difficulty: 'easy', bpm: 96 });
    expect(s.phase).toBe('learning');
    s = reduce(s, { type: 'START_DANCING', at: 40, byPlayerId: 'steve', routineStartAt: 4_040 });
    expect(s.phase).toBe('dancing');
    expect(s.routineStartAt).toBe(4_040);
    s = reduce(s, { type: 'FINISH', at: 130_000 });
    expect(s.phase).toBe('results');
    s = reduce(s, { type: 'BACK_TO_LOBBY', at: 130_100, byPlayerId: 'steve' });
    expect(s.phase).toBe('lobby');
    s = reduce(s, { type: 'END_ROOM', at: 130_200, byPlayerId: 'steve' });
    expect(s.phase).toBe('ended');
    expect(() => reduce(s, join('late', 130_300))).toThrow('ended');
  });

  it('the room moves on to the dance by itself when the teaching runs out', () => {
    let s = lobbyWithHost();
    s = reduce(s, { type: 'START_LEARNING', at: 30, byPlayerId: 'steve', routineId: 'r', difficulty: 'easy', bpm: 96 });
    // no host needed, and beat 0 stays where the timeline put it even if the room is a moment late
    s = reduce(s, { type: 'LEARNING_DONE', at: 121_000, routineStartAt: 120_500 });
    expect(s.phase).toBe('dancing');
    expect(s.routineStartAt).toBe(120_500);
    expect(() => reduce(s, { type: 'LEARNING_DONE', at: 121_001, routineStartAt: 125_000 })).toThrow('not allowed');
    expect(() => reduce(lobbyWithHost(), { type: 'LEARNING_DONE', at: 5, routineStartAt: 9 })).toThrow('not allowed');
  });

  it('the host can stop a song at any moment: learning or dancing, back to the lobby', () => {
    let s = lobbyWithHost();
    s = reduce(s, { type: 'START_LEARNING', at: 30, byPlayerId: 'steve', routineId: 'r', difficulty: 'easy', bpm: 96 });
    expect(reduce(s, { type: 'BACK_TO_LOBBY', at: 40, byPlayerId: 'steve' }).phase).toBe('lobby');
    s = reduce(s, { type: 'START_DANCING', at: 40, byPlayerId: 'steve', routineStartAt: 4_000 });
    expect(() => reduce(s, { type: 'BACK_TO_LOBBY', at: 50, byPlayerId: 'jackie' })).toThrow('not the host');
    s = reduce(s, { type: 'BACK_TO_LOBBY', at: 50, byPlayerId: 'steve' });
    expect(s.phase).toBe('lobby');
    expect(s.routineStartAt).toBeNull();
  });

  it('allows a one-tap restart of the section while dancing', () => {
    let s = lobbyWithHost();
    s = reduce(s, { type: 'START_LEARNING', at: 30, byPlayerId: 'steve', routineId: 'r', difficulty: 'medium', bpm: 110 });
    s = reduce(s, { type: 'START_DANCING', at: 40, byPlayerId: 'steve', routineStartAt: 4_000 });
    s = reduce(s, { type: 'RESTART_SECTION', at: 50_000, byPlayerId: 'steve', routineStartAt: 54_000 });
    expect(s.phase).toBe('dancing');
    expect(s.routineStartAt).toBe(54_000);
  });
});

describe('guards', () => {
  it('refuses to start anything without the speaker screen', () => {
    let s = createRoom('ABCD', 0);
    s = reduce(s, join('steve', 1));
    expect(() => reduce(s, { type: 'START_LEARNING', at: 2, byPlayerId: 'steve', routineId: 'r', difficulty: 'easy', bpm: 100 })).toThrow('speaker');
  });

  it('refuses a count-in that is already in the past', () => {
    let s = lobbyWithHost();
    s = reduce(s, { type: 'START_LEARNING', at: 30, byPlayerId: 'steve', routineId: 'r', difficulty: 'easy', bpm: 100 });
    expect(() => reduce(s, { type: 'START_DANCING', at: 40, byPlayerId: 'steve', routineStartAt: 39 })).toThrow('future');
  });

  it('rejects implausible audio offsets and out-of-range bpm', () => {
    let s = lobbyWithHost();
    s = reduce(s, { type: 'START_CALIBRATION', at: 10, byPlayerId: 'steve' });
    expect(() => reduce(s, { type: 'CALIBRATED', at: 20, audioOffsetMs: 5000 })).toThrow('implausible');
    s = reduce(s, { type: 'SKIP_CALIBRATION', at: 21, byPlayerId: 'steve' });
    expect(() => reduce(s, { type: 'START_LEARNING', at: 30, byPlayerId: 'steve', routineId: 'r', difficulty: 'easy', bpm: 30 })).toThrow('bpm');
  });

  it('drops back to the lobby when the speaker disconnects mid-dance', () => {
    let s = lobbyWithHost();
    s = reduce(s, { type: 'START_LEARNING', at: 30, byPlayerId: 'steve', routineId: 'r', difficulty: 'easy', bpm: 100 });
    s = reduce(s, { type: 'START_DANCING', at: 40, byPlayerId: 'steve', routineStartAt: 4_000 });
    s = reduce(s, { type: 'SPEAKER_DISCONNECTED', at: 10_000 });
    expect(s.phase).toBe('lobby');
    expect(s.routineStartAt).toBeNull();
    expect(s.speakerConnected).toBe(false);
  });

  it('FINISH only from dancing; non-host cannot drive', () => {
    const s = lobbyWithHost();
    expect(() => reduce(s, { type: 'FINISH', at: 5 })).toThrow('not allowed');
    expect(() => reduce(s, { type: 'START_CALIBRATION', at: 5, byPlayerId: 'jackie' })).toThrow('not the host');
  });

  it('session limit', () => {
    const s = createRoom('ABCD', 0);
    expect(overSessionLimit(29, s)).toBe(false);
    expect(overSessionLimit(30, s)).toBe(true);
  });
});
