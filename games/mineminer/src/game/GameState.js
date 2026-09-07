/** Timer, penalties, stats and star rating for a single run. Pure logic (uses Date.now). */
export class GameState {
  constructor(bus, { level = null, misfirePenalty = 10, boomPenalty = 30 } = {}) {
    this.level = level;
    this.startTime = null;
    this.endTime = null;
    this.pausedAt = null;
    this.pausedMs = 0;
    this.penaltyMs = 0;
    this.misfires = 0;
    this.detonations = 0;
    this.largestCascade = 0;
    this.won = false;
    this.lost = false;
    this.unsubs = [
      bus.on('board:started', () => {
        this.startTime = Date.now();
      }),
      bus.on('board:action', (r) => {
        if (r.kind === 'misfire') {
          this.misfires++;
          this.penaltyMs += misfirePenalty * 1000;
        }
        if (r.kind === 'boom') {
          this.detonations++;
          this.penaltyMs += boomPenalty * 1000;
        }
        if (r.revealed.length > this.largestCascade) this.largestCascade = r.revealed.length;
      }),
      bus.on('board:won', () => this.end(true)),
      bus.on('board:lost', () => this.end(false)),
    ];
  }

  end(won) {
    if (this.endTime !== null) return;
    this.endTime = Date.now();
    this.won = won;
    this.lost = !won;
  }

  pause() {
    if (this.pausedAt === null && this.endTime === null) this.pausedAt = Date.now();
  }

  resume() {
    if (this.pausedAt !== null) {
      this.pausedMs += Date.now() - this.pausedAt;
      this.pausedAt = null;
    }
  }

  elapsedMs() {
    if (this.startTime === null) return 0;
    const end = this.endTime ?? this.pausedAt ?? Date.now();
    return Math.max(0, end - this.startTime - this.pausedMs + this.penaltyMs);
  }

  stars() {
    if (!this.won) return 0;
    let s = 1;
    if (this.misfires === 0 && this.detonations === 0) s++;
    if (this.level?.par && this.elapsedMs() <= this.level.par * 1000) s++;
    return s;
  }

  summary() {
    return {
      won: this.won,
      lost: this.lost,
      timeMs: this.elapsedMs(),
      misfires: this.misfires,
      detonations: this.detonations,
      largestCascade: this.largestCascade,
      stars: this.stars(),
      par: this.level?.par ?? null,
    };
  }

  dispose() {
    for (const off of this.unsubs) off();
    this.unsubs.length = 0;
  }
}

const PROGRESS_KEY = 'mineminer.progress';

export function loadProgress() {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(PROGRESS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function recordProgress(levelId, { timeMs, stars }) {
  const progress = loadProgress();
  const cur = progress[levelId] || { best: null, stars: 0, clears: 0 };
  cur.clears++;
  cur.stars = Math.max(cur.stars, stars);
  if (cur.best === null || timeMs < cur.best) cur.best = timeMs;
  progress[levelId] = cur;
  try {
    globalThis.localStorage?.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    /* storage unavailable */
  }
  return progress;
}