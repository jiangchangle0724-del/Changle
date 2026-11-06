/**
 * Room state machine. A pure reducer: (state, event) → new state, or throws RoomError
 * when the transition is not allowed. The Durable Object calls this and persists the result;
 * UIs never mutate state directly.
 */
import type { Difficulty, Player, RoomEvent, RoomPhase, RoomState } from './types';

export class RoomError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'RoomError';
  }
}

export const MAX_PLAYERS = 15;
export const DEFAULT_SESSION_MINUTES = 30;
/** BEAT_MOVED moves the dance's beat 0 by at most this much (a video late to start, or stalled; not a new start). */
export const MAX_BEAT_MOVE_MS = 60_000;

export function createRoom(code: string, at: number): RoomState {
  return {
    code,
    phase: 'lobby',
    players: [],
    speakerConnected: false,
    routineId: null,
    difficulty: null,
    audioOffsetMs: 0,
    routineStartAt: null,
    bpm: null,
    sessionMinutesLimit: DEFAULT_SESSION_MINUTES,
    createdAt: at,
    updatedAt: at,
  };
}

function requireHost(state: RoomState, playerId: string): void {
  const p = state.players.find((x) => x.id === playerId);
  if (!p?.isHost) throw new RoomError('not_host', `player ${playerId} is not the host`);
}

function requirePhase(state: RoomState, allowed: RoomPhase[], event: string): void {
  if (!allowed.includes(state.phase)) {
    throw new RoomError('bad_phase', `${event} not allowed in phase ${state.phase}`);
  }
}

function touch(state: RoomState, at: number): RoomState {
  return { ...state, updatedAt: at };
}

export function reduce(state: RoomState, ev: RoomEvent): RoomState {
  if (state.phase === 'ended') throw new RoomError('ended', 'room has ended');

  switch (ev.type) {
    case 'SPEAKER_CONNECTED':
      return touch({ ...state, speakerConnected: true }, ev.at);

    case 'SPEAKER_DISCONNECTED': {
      // Losing the speaker mid-routine drops everyone back to the lobby: no sound, no game.
      const back: RoomPhase = state.phase === 'lobby' || state.phase === 'results' ? state.phase : 'lobby';
      return touch({ ...state, speakerConnected: false, phase: back, routineStartAt: null }, ev.at);
    }

    case 'PLAYER_JOINED': {
      if (state.players.some((p) => p.id === ev.player.id)) {
        // Reconnect: keep the seat, refresh the name.
        return touch(
          { ...state, players: state.players.map((p) => (p.id === ev.player.id ? { ...p, name: ev.player.name } : p)) },
          ev.at,
        );
      }
      if (state.players.length >= MAX_PLAYERS) throw new RoomError('room_full', `room ${state.code} is full`);
      const isHost = state.players.length === 0 ? true : ev.player.isHost && !state.players.some((p) => p.isHost);
      const player: Player = { ...ev.player, isHost, joinedAt: ev.at };
      return touch({ ...state, players: [...state.players, player] }, ev.at);
    }

    case 'PLAYER_LEFT':
    case 'KICK': {
      if (ev.type === 'KICK') {
        requireHost(state, ev.byPlayerId);
        if (ev.byPlayerId === ev.playerId) throw new RoomError('self_kick', 'host cannot kick themselves');
      }
      const remaining = state.players.filter((p) => p.id !== ev.playerId);
      if (remaining.length === state.players.length) return state;
      // Host left: promote the earliest-joined remaining player.
      const hostStillHere = remaining.some((p) => p.isHost);
      const players = hostStillHere || remaining.length === 0
        ? remaining
        : remaining.map((p, i) => (i === 0 ? { ...p, isHost: true } : p));
      return touch({ ...state, players }, ev.at);
    }

    case 'START_CALIBRATION':
      requireHost(state, ev.byPlayerId);
      requirePhase(state, ['lobby', 'results'], ev.type);
      if (!state.speakerConnected) throw new RoomError('no_speaker', 'connect the speaker screen first');
      return touch({ ...state, phase: 'calibrating' }, ev.at);

    case 'CALIBRATED':
      requirePhase(state, ['calibrating'], ev.type);
      if (!Number.isFinite(ev.audioOffsetMs) || Math.abs(ev.audioOffsetMs) > 2000) {
        throw new RoomError('bad_offset', `implausible audio offset ${ev.audioOffsetMs}`);
      }
      return touch({ ...state, phase: 'lobby', audioOffsetMs: ev.audioOffsetMs }, ev.at);

    case 'SKIP_CALIBRATION':
      requireHost(state, ev.byPlayerId);
      requirePhase(state, ['calibrating'], ev.type);
      return touch({ ...state, phase: 'lobby' }, ev.at);

    case 'START_LEARNING': {
      requireHost(state, ev.byPlayerId);
      requirePhase(state, ['lobby', 'results'], ev.type);
      if (!state.speakerConnected) throw new RoomError('no_speaker', 'connect the speaker screen first');
      if (!(ev.bpm >= 60 && ev.bpm <= 200)) throw new RoomError('bad_bpm', `bpm out of range: ${ev.bpm}`);
      const difficulty: Difficulty = ev.difficulty;
      return touch(
        { ...state, phase: 'learning', routineId: ev.routineId, difficulty, bpm: ev.bpm, routineStartAt: null },
        ev.at,
      );
    }

    case 'START_DANCING':
      requireHost(state, ev.byPlayerId);
      requirePhase(state, ['learning', 'results'], ev.type);
      if (!state.routineId) throw new RoomError('no_routine', 'pick a routine first');
      if (ev.routineStartAt < ev.at) throw new RoomError('start_in_past', 'routineStartAt must be in the future (count-in)');
      return touch({ ...state, phase: 'dancing', routineStartAt: ev.routineStartAt }, ev.at);

    case 'LEARNING_DONE':
      // The room's own step (no host): the teaching ran to its end and the dance carries straight
      // on, so its beat 0 is where the timeline puts it, even when this event comes a moment late.
      requirePhase(state, ['learning'], ev.type);
      if (!Number.isFinite(ev.routineStartAt)) throw new RoomError('bad_start', 'routineStartAt must be a time');
      return touch({ ...state, phase: 'dancing', routineStartAt: ev.routineStartAt }, ev.at);

    case 'BEAT_MOVED':
      requirePhase(state, ['dancing'], ev.type);
      if (!Number.isFinite(ev.routineStartAt) || state.routineStartAt === null || Math.abs(ev.routineStartAt - state.routineStartAt) > MAX_BEAT_MOVE_MS) {
        throw new RoomError('bad_start', 'the beat can only move by a minute at most');
      }
      return touch({ ...state, routineStartAt: ev.routineStartAt }, ev.at);

    case 'RESTART_SECTION':
      requireHost(state, ev.byPlayerId);
      requirePhase(state, ['dancing', 'learning'], ev.type);
      if (ev.routineStartAt < ev.at) throw new RoomError('start_in_past', 'routineStartAt must be in the future');
      return touch({ ...state, phase: 'dancing', routineStartAt: ev.routineStartAt }, ev.at);

    case 'FINISH':
      requirePhase(state, ['dancing'], ev.type);
      return touch({ ...state, phase: 'results', routineStartAt: null }, ev.at);

    case 'BACK_TO_LOBBY':
      // (from dancing too: the host can stop a song at any moment)
      requireHost(state, ev.byPlayerId);
      requirePhase(state, ['results', 'learning', 'dancing', 'calibrating'], ev.type);
      return touch({ ...state, phase: 'lobby', routineStartAt: null }, ev.at);

    case 'END_ROOM':
      requireHost(state, ev.byPlayerId);
      return touch({ ...state, phase: 'ended', routineStartAt: null }, ev.at);
  }
}

/** Minutes of play consumed by routines since creation is tracked by the DO; this checks the cap. */
export function overSessionLimit(playedMinutes: number, state: RoomState): boolean {
  return playedMinutes >= state.sessionMinutesLimit;
}
