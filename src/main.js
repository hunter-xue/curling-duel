import * as THREE from 'three';
import { World, TABLE_SIZE } from './game/physics.js';
import { createTable } from './game/table.js';
import { createStoneMesh } from './game/stones.js';
import { Game } from './game/rules.js';
import { InputController } from './game/input.js';
import { Hud } from './ui/hud.js';
import { Sound } from './game/audio.js';
import './style.css';

/* ── 渲染器 ──────────────────────────────────────────── */

const app = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

/* ── 场景 ────────────────────────────────────────────── */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x4a4844);

const camera = new THREE.PerspectiveCamera(22, 1, 5, 200);

// 主光：来自右上方，阴影落向左下
const key = new THREE.DirectionalLight(0xfff4e6, 2.5);
key.position.set(9.5, 24, -11);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -13;
key.shadow.camera.right = 13;
key.shadow.camera.top = 13;
key.shadow.camera.bottom = -13;
key.shadow.camera.near = 1;
key.shadow.camera.far = 70;
key.shadow.bias = -0.0006;
key.shadow.normalBias = 0.025;
scene.add(key);
scene.add(key.target);

// 补光 + 环境
scene.add(new THREE.HemisphereLight(0xe8f7ff, 0x3b3730, 1.05));
const fill = new THREE.DirectionalLight(0x9fd8ff, 0.55);
fill.position.set(-14, 9, 16);
scene.add(fill);

scene.add(createTable(renderer));

const stoneGroup = new THREE.Group();
scene.add(stoneGroup);

/* ── 游戏 ────────────────────────────────────────────── */

const world = new World();
const hud = new Hud();
const sound = new Sound();

/** @type {Map<any, THREE.Group>} */
const meshMap = new Map();

const game = new Game(world, hud, {
  onStone(stone) {
    const mesh = createStoneMesh(stone);
    stone.mesh = mesh;
    meshMap.set(stone, mesh);
    stoneGroup.add(mesh);
  },
  clearStones() {
    for (const [stone, mesh] of meshMap) {
      stoneGroup.remove(mesh);
      for (const mat of mesh.userData.materials ?? []) mat.dispose();
    }
    meshMap.clear();
  },
  onFall() {
    sound.thud();
  },
});

world.onCollide = (_a, _b, impact) => {
  if (impact > 0.55) sound.clack(impact);
};

const input = new InputController({
  dom: renderer.domElement,
  camera,
  scene,
  world,
  game,
  hud,
  sound,
});

hud.onRestart(() => {
  input.reset();
  game.start();
});

hud.onPanelToggle(() => layoutCamera());

/* ── 相机布局 ────────────────────────────────────────── */

const CAM_TILT = THREE.MathUtils.degToRad(21);
const camTarget = new THREE.Vector3(0, 0, 0.6);

function layoutCamera() {
  const W = window.innerWidth;
  const H = window.innerHeight;

  // 右侧说明面板占位时，把台面整体往左推一点
  const panelPx = W > 900 && hud.isPanelVisible() ? 360 : 0;
  const availW = Math.max(300, W - panelPx);
  const aspect = W / H;

  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  // 竖屏时收紧留白，让台面尽量占满宽度
  const FIT = TABLE_SIZE * (aspect < 0.85 ? 1.08 : 1.2);

  const distV = FIT / (2 * Math.tan(vFov / 2));
  const distH = (FIT * (W / availW)) / (2 * Math.tan(hFov / 2));
  const dist = Math.max(distV, distH);

  const visibleH = 2 * dist * Math.tan(vFov / 2);
  const worldPerPx = visibleH / H;

  camTarget.set((panelPx / 2) * worldPerPx, 0, 1.0);

  camera.aspect = aspect;
  camera.near = Math.max(0.5, dist * 0.15);
  camera.far = dist * 4;
  camera.position.set(
    camTarget.x,
    camTarget.y + dist * Math.cos(CAM_TILT),
    camTarget.z + dist * Math.sin(CAM_TILT)
  );
  camera.lookAt(camTarget);
  camera.updateProjectionMatrix();
}

function onResize() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  layoutCamera();
}

window.addEventListener('resize', onResize);
onResize();

/* ── 掉落动画 ────────────────────────────────────────── */

function updateStones(dt) {
  const hovered = input.hover;

  for (const stone of world.stones) {
    const mesh = stone.mesh;
    if (!mesh) continue;

    if (stone.falling) {
      stone.fallT += dt;
      if (mesh.userData.blob) mesh.userData.blob.visible = false;
      stone.vy -= 26 * dt;
      stone.y += stone.vy * dt;
      // 出界后仍保留一点惯性，看起来是"滑出去"
      stone.x += stone.vx * dt * 0.7;
      stone.z += stone.vz * dt * 0.7;
      const damp = 1 - Math.min(0.95, 2.2 * dt);
      stone.vx *= damp;
      stone.vz *= damp;
      stone.angle += stone.fallSpin * dt;

      // 翻出台沿
      mesh.rotation.x = Math.min(0.62, stone.fallT * 1.5);
      mesh.rotation.z = Math.sin(stone.fallT * 4.5) * 0.16;
      mesh.position.set(stone.x, stone.y, stone.z);

      const fade = Math.min(1, Math.max(0, (stone.fallT - 0.42) / 0.45));
      for (const mat of mesh.userData.materials ?? []) mat.opacity = 1 - fade;

      if (stone.fallT > 1.15) {
        stone.alive = false;
        stoneGroup.remove(mesh);
        meshMap.delete(stone);
        for (const mat of mesh.userData.materials ?? []) mat.dispose();
      }
      continue;
    }

    mesh.position.set(stone.x, stone.y, stone.z);
    mesh.rotation.y = stone.angle;

    const isHover =
      stone === hovered && !game.winner && game.state === 'idle' && game.turn === stone.team;
    const targetScale = isHover ? 1.075 : 1;
    const k = 1 - Math.pow(0.00005, dt);
    mesh.scale.setScalar(THREE.MathUtils.lerp(mesh.scale.x, targetScale, k));
  }
}

/* ── 主循环 ──────────────────────────────────────────── */

let prev = performance.now();

function frame(now) {
  const dt = Math.min(1 / 30, (now - prev) / 1000);
  prev = now;

  game.update(dt);
  updateStones(dt);
  renderer.render(scene, camera);

  requestAnimationFrame(frame);
}

game.start();
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  window.__cd = { game, world, camera, input, THREE, renderer, scene };
}
