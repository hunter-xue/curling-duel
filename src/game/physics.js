/**
 * 平面圆盘物理：摩擦滑行 + 弹性碰撞 + 掉台。
 *
 * 坐标系为 XZ 平面（y 向上），台面是以原点为中心的
 * TABLE_SIZE × TABLE_SIZE 正方形。
 */

export const TABLE_SIZE = 16;
export const TABLE_HALF = TABLE_SIZE / 2;

export const STONE_RADIUS = 0.55;
/** 冰面减速（世界单位 / 秒²） */
export const FRICTION = 3.3;
/** 石对石恢复系数，0.92 ≈ 冰壶的清脆对撞 */
export const RESTITUTION = 0.92;
/** 安全速度上限，避免数值爆炸 */
export const MAX_SPEED = 17;
/** 静摩擦阈值，低于此速度直接归零 */
export const REST_EPS = 0.025;

let nextId = 1;

export class Stone {
  constructor(team, x, z) {
    this.id = nextId++;
    this.team = team; // 'white' | 'black'

    this.x = x;
    this.z = z;
    this.y = 0;

    this.vx = 0;
    this.vz = 0;
    this.vy = 0;

    this.radius = STONE_RADIUS;
    this.mass = 1;

    this.angle = Math.random() * Math.PI * 2;

    /** 仍在台面上（未进入掉落流程） */
    this.alive = true;
    /** 已越过台边，交给渲染层做掉落动画 */
    this.falling = false;
    this.fallT = 0;
    this.fallSpin = 0;
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  stop() {
    this.vx = 0;
    this.vz = 0;
  }
}

export class World {
  constructor() {
    /** @type {Stone[]} */
    this.stones = [];
    /** @type {((stone: Stone) => void) | null} */
    this.onFall = null;
    /** @type {((a: Stone, b: Stone, impact: number) => void) | null} */
    this.onCollide = null;
  }

  add(stone) {
    this.stones.push(stone);
    return stone;
  }

  clear() {
    this.stones.length = 0;
  }

  /** 台面上仍在参与物理的石子 */
  get active() {
    return this.stones.filter((s) => s.alive && !s.falling);
  }

  reset() {
    for (const s of this.stones) s.stop();
  }

  /** 所有参与物理的石子都静止了吗 */
  allAtRest() {
    for (const s of this.stones) {
      if (!s.alive || s.falling) continue;
      if (s.speed > REST_EPS) return false;
    }
    return true;
  }

  /**
   * 推进一帧。内部按最大位移做子步进，
   * 保证高速石子不会穿透彼此。
   */
  step(dt) {
    const list = this.active;
    if (list.length === 0) return;

    let maxSpeed = 0;
    for (const s of list) maxSpeed = Math.max(maxSpeed, s.speed);
    if (maxSpeed <= 0) return;

    const maxMove = STONE_RADIUS * 0.32;
    const steps = Math.min(32, Math.max(1, Math.ceil((maxSpeed * dt) / maxMove)));
    const h = dt / steps;

    for (let i = 0; i < steps; i++) {
      this.integrate(list, h);
      this.solveCollisions(list);
      this.checkEdges(list);
    }
  }

  integrate(list, h) {
    for (const s of list) {
      const sp = Math.hypot(s.vx, s.vz);
      if (sp > 0) {
        // 恒定动摩擦减速：滑行距离与速度平方成正比，冰面手感
        const dec = FRICTION * h;
        if (sp <= dec) {
          s.vx = 0;
          s.vz = 0;
        } else {
          const k = (sp - dec) / sp;
          s.vx *= k;
          s.vz *= k;
        }
      }
      s.x += s.vx * h;
      s.z += s.vz * h;
    }
  }

  solveCollisions(list) {
    // 两轮迭代：一次冲量 + 一次位置修正，足以稳定
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];

          let dx = b.x - a.x;
          let dz = b.z - a.z;
          const minDist = a.radius + b.radius;
          const d2 = dx * dx + dz * dz;
          if (d2 >= minDist * minDist) continue;

          let dist = Math.sqrt(d2);
          if (dist < 1e-6) {
            // 完全重合时给一个确定性的分离方向
            dx = 1;
            dz = 0;
            dist = 1;
          }
          const nx = dx / dist;
          const nz = dz / dist;

          // 位置修正（质量相同，各让一半）
          const overlap = (minDist - dist) * 0.5;
          a.x -= nx * overlap;
          a.z -= nz * overlap;
          b.x += nx * overlap;
          b.z += nz * overlap;

          // 法向冲量 —— 反作用力天然出现在这里
          const rvx = b.vx - a.vx;
          const rvz = b.vz - a.vz;
          const vn = rvx * nx + rvz * nz;
          if (vn > 0) continue; // 正在分离

          const invA = 1 / a.mass;
          const invB = 1 / b.mass;
          const impulse = (-(1 + RESTITUTION) * vn) / (invA + invB);

          a.vx -= impulse * nx * invA;
          a.vz -= impulse * nz * invA;
          b.vx += impulse * nx * invB;
          b.vz += impulse * nz * invB;

          if (iter === 0 && this.onCollide) {
            this.onCollide(a, b, Math.abs(vn));
          }
        }
      }
    }

    // 限速
    for (const s of list) {
      const sp = Math.hypot(s.vx, s.vz);
      if (sp > MAX_SPEED) {
        const k = MAX_SPEED / sp;
        s.vx *= k;
        s.vz *= k;
      }
    }
  }

  checkEdges(list) {
    for (const s of list) {
      if (s.falling) continue;
      // 圆心越过台边 → 重心失守，掉落
      if (Math.abs(s.x) > TABLE_HALF || Math.abs(s.z) > TABLE_HALF) {
        s.falling = true;
        s.fallT = 0;
        s.vy = 0;
        s.fallSpin = (Math.random() * 0.5 + 0.35) * (Math.random() < 0.5 ? -1 : 1) * 3;
        if (this.onFall) this.onFall(s);
      }
    }
  }
}
