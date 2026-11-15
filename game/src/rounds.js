// The round machine: freeze time, the live round, the bomb, and the
// match. First team to 3 round wins takes the match (at most 5 rounds).
// The attackers plant a charge at the round's site; the defenders stop
// them, defuse the charge, or run the clock out.
export const FREEZE_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const DETONATE_SECONDS = 35;
export const TARGET_WINS = 3;
export const MAX_ROUNDS = 5;

export function createRounds(hooks) {
  const state = {
    phase: 'idle', // idle | freeze | live | end
    round: 0,
    scoreA: 0,
    scoreB: 0,
    timer: 0,
    attackSite: 'A',
    bomb: { planted: false, site: null, pos: null, timeLeft: 0 },
    channel: { kind: null, who: null, progress: 0, needed: 0 },
    matchOver: false,
    winner: null,
    endReason: '',
  };

  function startMatch() {
    state.round = 0;
    state.scoreA = 0;
    state.scoreB = 0;
    state.matchOver = false;
    state.winner = null;
    state.bomb.planted = false;
    state.bomb.site = null;
    state.channel.kind = null;
    startRound();
  }

  function startRound() {
    state.round += 1;
    state.attackSite = state.round % 2 === 1 ? 'A' : 'B';
    state.phase = 'freeze';
    state.timer = FREEZE_SECONDS;
    state.bomb.planted = false;
    state.bomb.site = null;
    state.bomb.pos = null;
    state.bomb.timeLeft = 0;
    state.channel.kind = null;
    hooks.onPhase('freeze', state);
  }

  function endRound(winnerTeam, reason) {
    if (state.phase === 'end') return;
    if (winnerTeam === 'A') state.scoreA += 1;
    else state.scoreB += 1;
    state.phase = 'end';
    state.timer = 4;
    state.endReason = reason;
    hooks.onRoundEnd(winnerTeam, reason, state);
    if (state.scoreA >= TARGET_WINS || state.scoreB >= TARGET_WINS || state.round >= MAX_ROUNDS) {
      state.matchOver = true;
      state.winner = state.scoreA > state.scoreB ? 'A' : 'B';
    }
  }

  function startChannel(kind, who, needed) {
    state.channel = { kind, who, progress: 0, needed };
  }

  function cancelChannel() {
    state.channel.kind = null;
    state.channel.who = null;
    state.channel.progress = 0;
  }

  function step(dt) {
    if (state.phase === 'freeze') {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.phase = 'live';
        state.timer = ROUND_SECONDS;
        hooks.onPhase('live', state);
      }
      return;
    }
    if (state.phase === 'live') {
      if (state.channel.kind) {
        state.channel.progress += dt;
        if (state.channel.progress >= state.channel.needed) {
          if (state.channel.kind === 'plant') {
            state.bomb.planted = true;
            state.bomb.site = state.attackSite;
            state.bomb.timeLeft = DETONATE_SECONDS;
            hooks.onBombPlanted(state.attackSite, state.channel.who);
          } else {
            state.bomb.planted = false;
            hooks.onBombDefused(state.channel.who);
            endRound('B', 'CHARGE DEFUSED');
            return;
          }
          cancelChannel();
        }
      }
      if (state.bomb.planted) {
        state.bomb.timeLeft -= dt;
        if (state.bomb.timeLeft <= 0) {
          hooks.onBombDetonated(state.bomb.site);
          endRound('A', 'SITE DETONATED');
          return;
        }
      } else {
        state.timer -= dt;
        if (state.timer <= 0) {
          endRound('B', 'TIME EXPIRED');
          return;
        }
      }
      return;
    }
    if (state.phase === 'end') {
      state.timer -= dt;
      if (state.timer <= 0) {
        if (state.matchOver) {
          state.phase = 'idle';
          hooks.onMatchEnd(state.winner, state);
        } else {
          startRound();
        }
      }
    }
  }

  // Force a plant/defuse that a bot completed by channelling in the
  // world (bots time their own channel; the player channels through
  // startChannel above).
  function forcePlant(site, who) {
    if (state.phase !== 'live' || state.bomb.planted) return;
    state.bomb.planted = true;
    state.bomb.site = site;
    state.bomb.timeLeft = DETONATE_SECONDS;
    cancelChannel();
    hooks.onBombPlanted(site, who);
  }

  function forceDefuse(who) {
    if (state.phase !== 'live' || !state.bomb.planted) return;
    state.bomb.planted = false;
    cancelChannel();
    hooks.onBombDefused(who);
    endRound('B', 'CHARGE DEFUSED');
  }

  return {
    state,
    startMatch,
    startRound,
    endRound,
    startChannel,
    cancelChannel,
    forcePlant,
    forceDefuse,
    step,
  };
}
