import * as THREE from 'three';
import { TABLE_HALF } from './physics.js';

/** 达到满力所需的拖拽距离（世界单位） */
const MAX_DRAG = 2.75;
const MIN_LAUNCH = 1.8;
const MAX_LAUNCH = 13.6;
/** 鼠标甩动带来的额外力度上限 */
const FLICK_MAX = 2.6;
/** 世界单位 / 秒 → 加成（约 3000px/s 的甩动接近上限） */
const FLICK_SCALE = 0.05;
/** 拾取半径系数 */
const HIT_SLOP = 1.65;
/** 低于此力度视为取消 */
const DEAD_ZONE = 0.035;

export class InputController {
  constructor({ dom, camera, scene, world, game, hud, sound }) {
    this.dom = dom;
    this.camera = camera;
    this.world = world;
    this.game = game;
    this.hud = hud;
    this.sound = sound;

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.tmp = new THREE.Vector3();

    /** @type {import('./physics.js').Stone | null} */
    this.drag = null;
    /** @type {import('./physics.js').Stone | null} */
    this.hover = null;
    this.dir = { x: 0, z: -1 };
    this.power = 0;
    this.samples = [];

    this._buildAimVisuals(scene);
    this._bind();
  }

  /* ── 瞄准可视化 ───────────────────────────────────── */

  _buildAimVisuals(scene) {
    const group = new THREE.Group();
    group.visible = false;
    group.renderOrder = 20;

    // 拉杆：石子 → 鼠标（向后拉）
    const bandGeo = new THREE.BufferGeometry();
    bandGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(6), 3)
    );
    const band = new THREE.Line(
      bandGeo,
      new THREE.LineBasicMaterial({
        color: 0xff8a5c,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        depthTest: false,
      })
    );
    band.renderOrder = 21;

    // 预测轨迹
    const aimGeo = new THREE.BufferGeometry();
    aimGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const aim = new THREE.Line(
      aimGeo,
      new THREE.LineDashedMaterial({
        color: 0xffffff,
        dashSize: 0.3,
        gapSize: 0.19,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        depthTest: false,
      })
    );
    aim.renderOrder = 22;

    // 落点 / 碰撞点
    const ghost = new THREE.Mesh(
      new THREE.RingGeometry(0.46, 0.62, 44),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      })
    );
    ghost.rotation.x = -Math.PI / 2;
    ghost.position.y = 0.02;
    ghost.renderOrder = 23;

    group.add(band, aim, ghost);
    scene.add(group);

    this.aimGroup = group;
    this.band = band;
    this.aimLine = aim;
    this.ghost = ghost;
  }

  _setLine(line, ax, az, bx, bz) {
    const pos = line.geometry.attributes.position;
    pos.setXYZ(0, ax, 0.03, az);
    pos.setXYZ(1, bx, 0.03, bz);
    pos.needsUpdate = true;
    line.geometry.computeBoundingSphere();
    if (line.computeLineDistances) line.computeLineDistances();
  }

  /* ── 事件 ─────────────────────────────────────────── */

  _bind() {
    this.dom.addEventListener('pointerdown', (e) => this._onDown(e));
    this.dom.addEventListener('pointermove', (e) => this._onMove(e));
    this.dom.addEventListener('pointerup', (e) => this._onUp(e));
    this.dom.addEventListener('pointercancel', (e) => this._onUp(e, true));
    // 兜底：指针捕获失败 / 移出窗口后松开
    window.addEventListener('pointerup', (e) => this._onUp(e));
    window.addEventListener('blur', () => this._cancelDrag());
    this.dom.addEventListener('contextmenu', (e) => {
      if (this.drag) e.preventDefault();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._cancelDrag();
    });
  }

  _pointerToWorld(e) {
    const rect = this.dom.getBoundingClientRect();
    this.ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.plane, this.tmp)) return null;
    return { x: this.tmp.x, z: this.tmp.z };
  }

  _pick(x, z, team = null) {
    let best = null;
    let bestD = Infinity;
    for (const s of this.world.stones) {
      if (!s.alive || s.falling) continue;
      if (team && s.team !== team) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < s.radius * HIT_SLOP && d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  _onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    this.sound?.unlock();
    if (!this.game.canAim) return;

    const p = this._pointerToWorld(e);
    if (!p) return;

    const stone = this._pick(p.x, p.z, this.game.turn);
    if (!stone) return;

    e.preventDefault();
    if (!this.game.beginAim()) return;

    this.drag = stone;
    this.power = 0;
    this.samples.length = 0;
    this._pushSample(p);

    this.dom.classList.add('is-dragging');
    this.dom.classList.remove('is-grabbable');
    try {
      this.dom.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    this.aimGroup.visible = true;
    this.hud.setPower(0, true);
    this._updateAim(p);
  }

  _onMove(e) {
    const p = this._pointerToWorld(e);
    if (!p) return;

    if (this.drag) {
      this._pushSample(p);
      this._updateAim(p);
      return;
    }

    if (this.game.canAim) {
      const stone = this._pick(p.x, p.z, this.game.turn);
      this.hover = stone;
      this.dom.classList.toggle('is-grabbable', !!stone);
    } else if (this.hover) {
      this.hover = null;
      this.dom.classList.remove('is-grabbable');
    }
  }

  _onUp(e, cancelled = false) {
    if (!this.drag) return;

    const stone = this.drag;
    this.drag = null;
    this.aimGroup.visible = false;
    this.dom.classList.remove('is-dragging');

    try {
      this.dom.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (cancelled || this.power < DEAD_ZONE) {
      this.hud.setPower(0, false);
      this.game.cancelAim();
      return;
    }

    const flick = Math.min(FLICK_MAX, this._pointerSpeed() * FLICK_SCALE);
    const speed = Math.min(
      MAX_LAUNCH + FLICK_MAX,
      MIN_LAUNCH + this.power * (MAX_LAUNCH - MIN_LAUNCH) + flick
    );

    this.sound?.whoosh();
    this.hud.setPower(0, false);
    this.game.launch(stone, this.dir.x * speed, this.dir.z * speed);
  }

  _cancelDrag() {
    if (!this.drag) return;
    this.drag = null;
    this.aimGroup.visible = false;
    this.dom.classList.remove('is-dragging');
    this.hud.setPower(0, false);
    this.game.cancelAim();
  }

  _pushSample(p) {
    this.samples.push({ t: performance.now(), x: p.x, z: p.z });
    if (this.samples.length > 14) this.samples.shift();
  }

  _pointerSpeed() {
    const s = this.samples;
    if (s.length < 2) return 0;
    const last = s[s.length - 1];
    let first = s[0];
    for (let i = s.length - 1; i >= 0; i--) {
      if (last.t - s[i].t > 110) break;
      first = s[i];
    }
    const dt = (last.t - first.t) / 1000;
    if (dt <= 0.004) return 0;
    return Math.hypot(last.x - first.x, last.z - first.z) / dt;
  }

  /* ── 瞄准计算 ─────────────────────────────────────── */

  _updateAim(p) {
    const stone = this.drag;
    if (!stone) return;

    let dx = stone.x - p.x;
    let dz = stone.z - p.z;
    const len = Math.hypot(dx, dz);

    if (len > 1e-4) {
      dx /= len;
      dz /= len;
      this.dir.x = dx;
      this.dir.z = dz;
    } else {
      dx = this.dir.x;
      dz = this.dir.z;
    }

    this.power = Math.min(1, len / MAX_DRAG);
    this.hud.setPower(this.power, true);

    // 向后拉的距离（视觉上限制在满力处）
    const bandLen = Math.min(len, MAX_DRAG * 1.06);
    this._setLine(
      this.band,
      stone.x - dx * bandLen,
      stone.z - dz * bandLen,
      stone.x,
      stone.z
    );

    // 预测：先撞到石子，还是先出台
    const tEdge = this._distanceToEdge(stone.x, stone.z, dx, dz);
    let tHit = Infinity;
    let hitStone = null;

    for (const s of this.world.stones) {
      if (s === stone || !s.alive || s.falling) continue;
      const r = s.radius + stone.radius;
      const fx = stone.x - s.x;
      const fz = stone.z - s.z;
      const b = fx * dx + fz * dz;
      const c = fx * fx + fz * fz - r * r;
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < tHit) {
        tHit = t;
        hitStone = s;
      }
    }

    const t = Math.min(tEdge, tHit);
    const startX = stone.x + dx * (stone.radius + 0.05);
    const startZ = stone.z + dz * (stone.radius + 0.05);
    const endX = stone.x + dx * t;
    const endZ = stone.z + dz * t;

    this._setLine(this.aimLine, startX, startZ, endX, endZ);

    // 落点环：只有真的会撞上对方石子时才显示
    if (hitStone && tHit <= tEdge) {
      const contact = stone.radius + hitStone.radius;
      const cx = hitStone.x - dx * (contact + 0.02);
      const cz = hitStone.z - dz * (contact + 0.02);
      this.ghost.position.set(cx, 0.02, cz);
      this.ghost.visible = true;
      this.ghost.material.opacity = 0.25 + this.power * 0.45;
    } else {
      this.ghost.visible = false;
    }
  }

  _distanceToEdge(x, z, dx, dz) {
    let t = Infinity;
    if (Math.abs(dx) > 1e-6) {
      const tx = ((dx > 0 ? TABLE_HALF : -TABLE_HALF) - x) / dx;
      if (tx > 0) t = Math.min(t, tx);
    }
    if (Math.abs(dz) > 1e-6) {
      const tz = ((dz > 0 ? TABLE_HALF : -TABLE_HALF) - z) / dz;
      if (tz > 0) t = Math.min(t, tz);
    }
    return Number.isFinite(t) ? t : 0;
  }

  /** 重开时清空交互状态 */
  reset() {
    this.drag = null;
    this.hover = null;
    this.samples.length = 0;
    this.aimGroup.visible = false;
    this.dom.classList.remove('is-dragging', 'is-grabbable');
  }
}
