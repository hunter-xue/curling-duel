import { Stone, STONE_RADIUS } from './physics.js';

export const STONES_PER_TEAM = 5;

const TEAM_LABEL = { white: '白方', black: '黑方' };
const OTHER = { white: 'black', black: 'white' };

/** 目标点距离：保证石子之间至少 2.2 倍直径，摆得开 */
const MIN_GAP = STONE_RADIUS * 2.2;
const SPAWN_X = 6.5;
const SPAWN_Z_NEAR = -1.15;
const SPAWN_Z_FAR = -6.5;

/**
 * 生成镜像对称的初始布局：
 * 白方在上半场（-Z），黑方在下半场（+Z），
 * 两边位置完全镜像，保证先后手之外绝对公平。
 */
function generateLayout() {
  /** @type {{x:number,z:number}[]} */
  const spots = [];
  let guard = 0;

  while (spots.length < STONES_PER_TEAM && guard++ < 4000) {
    const x = (Math.random() * 2 - 1) * SPAWN_X;
    const z = SPAWN_Z_FAR + Math.random() * (SPAWN_Z_NEAR - SPAWN_Z_FAR);
    let ok = true;
    for (const s of spots) {
      if (Math.hypot(s.x - x, s.z - z) < MIN_GAP) {
        ok = false;
        break;
      }
    }
    if (ok) spots.push({ x, z });
  }

  // 极端情况兜底：等距排布
  const fallback = [
    { x: -5.2, z: -4.6 },
    { x: 0, z: -5.6 },
    { x: 5.2, z: -4.6 },
    { x: -2.6, z: -2.1 },
    { x: 2.6, z: -2.1 },
  ];
  for (let i = 0; spots.length < STONES_PER_TEAM; i++) {
    spots.push(fallback[i % fallback.length]);
  }

  const out = [];
  for (const p of spots) {
    out.push({ team: 'white', x: p.x, z: p.z });
    out.push({ team: 'black', x: p.x, z: -p.z });
  }
  return out;
}

export class Game {
  /**
   * @param {import('./physics.js').World} world
   * @param {any} hud
   * @param {{ onStone: (s:any)=>void, clearStones: ()=>void, onLaunch: ()=>void, onFall: (s:any)=>void }} hooks
   */
  constructor(world, hud, hooks) {
    this.world = world;
    this.hud = hud;
    this.hooks = hooks;

    /** 'idle' | 'aiming' | 'simulating' | 'over' */
    this.state = 'idle';
    /** @type {'white'|'black'} */
    this.turn = 'white';
    this.scores = { white: 0, black: 0 };
    this.remaining = { white: STONES_PER_TEAM, black: STONES_PER_TEAM };

    this.restTimer = 0;
    this.simTime = 0;
    /** @type {'white'|'black'|null} */
    this.winner = null;

    world.onFall = (stone) => this.handleFall(stone);
  }

  start() {
    this.world.clear();
    this.hooks.clearStones();

    this.turn = 'white';
    this.state = 'idle';
    this.scores = { white: 0, black: 0 };
    this.remaining = { white: STONES_PER_TEAM, black: STONES_PER_TEAM };
    this.restTimer = 0;
    this.simTime = 0;
    this.winner = null;

    for (const spot of generateLayout()) {
      const stone = this.world.add(new Stone(spot.team, spot.x, spot.z));
      this.hooks.onStone(stone);
    }

    this.hud.hideOverlay();
    this.hud.setScores(this.scores);
    this.hud.setTurn(this.turn, 'idle');
    this.hud.setPower(0, false);
  }

  get canAim() {
    return this.state === 'idle' && !this.winner;
  }

  beginAim() {
    if (!this.canAim) return false;
    this.state = 'aiming';
    return true;
  }

  cancelAim() {
    if (this.state !== 'aiming') return;
    this.state = 'idle';
    this.hud.setPower(0, false);
    this.hud.setTurn(this.turn, 'idle');
  }

  /**
   * 投出石子。
   * @param {import('./physics.js').Stone} stone
   */
  launch(stone, vx, vz) {
    if (this.state !== 'aiming') return;
    stone.vx = vx;
    stone.vz = vz;
    this.state = 'simulating';
    this.simTime = 0;
    this.restTimer = 0;
    this.hud.setPower(0, false);
    this.hud.setTurn(this.turn, 'simulating');
    this.hooks.onLaunch?.();
  }

  /** 每帧推进 */
  update(dt) {
    this.world.step(dt);

    if (this.state !== 'simulating') return;

    this.simTime += dt;

    // 兜底：极端情况下（卡住/永远不停）强制结束
    if (this.simTime > 18) {
      for (const s of this.world.stones) s.stop();
      this.endTurn();
      return;
    }

    if (this.world.allAtRest()) {
      this.restTimer += dt;
      if (this.restTimer > 0.22) this.endTurn();
    } else {
      this.restTimer = 0;
    }
  }

  handleFall(stone) {
    const scorer = OTHER[stone.team];
    this.scores[scorer] += 1;
    this.remaining[stone.team] -= 1;
    this.hud.setScores(this.scores);
    this.hooks.onFall?.(stone);
    if (this.remaining[stone.team] <= 0) this.winner = scorer;
  }

  endTurn() {
    if (this.winner) {
      this.state = 'over';
      this.hud.setPower(0, false);
      this.hud.showOverlay(this.winner, this.scores);
      return;
    }
    this.turn = OTHER[this.turn];
    this.state = 'idle';
    this.restTimer = 0;
    this.hud.setTurn(this.turn, 'idle');
  }

  label(team = this.turn) {
    return TEAM_LABEL[team];
  }
}
