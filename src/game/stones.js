import * as THREE from 'three';

const BEVEL = 0.05;
const DEPTH = 0.26;
/** 石子总高度（含倒角） */
export const STONE_HEIGHT = DEPTH + BEVEL * 2;

const TEAM_STYLE = {
  white: {
    top: 0xf8f5ec,
    ring: 0xd8d1c0,
  },
  black: {
    top: 0x413b36,
    ring: 0x161311,
  },
};

const geoCache = new Map();

/** 柔和接触阴影贴图（径向渐变），让石子在冰面上"坐实" */
let blobTexture = null;
function getBlobTexture() {
  if (blobTexture) return blobTexture;
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.06, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.42, 'rgba(0,0,0,0.42)');
  g.addColorStop(0.74, 'rgba(0,0,0,0.12)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  blobTexture = new THREE.CanvasTexture(canvas);
  blobTexture.colorSpace = THREE.SRGBColorSpace;
  return blobTexture;
}

function discGeometry(radius) {
  const key = radius.toFixed(3);
  const cached = geoCache.get(key);
  if (cached) return cached;

  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius - BEVEL, 0, Math.PI * 2, false);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: DEPTH,
    bevelEnabled: true,
    bevelSegments: 5,
    bevelSize: BEVEL,
    bevelThickness: BEVEL,
    curveSegments: 64,
    steps: 1,
  });

  // 挤出方向 +Z → 旋转成 +Y，并让底面贴在 y = 0
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, BEVEL, 0);
  geo.computeVertexNormals();

  geoCache.set(key, geo);
  return geo;
}

/**
 * 创建一颗石子的可视化节点。
 * 组原点在石子底面中心，方便直接放到 y = 0 的台面上。
 */
export function createStoneMesh(stone) {
  const style = TEAM_STYLE[stone.team] ?? TEAM_STYLE.white;

  const group = new THREE.Group();
  group.name = `stone-${stone.team}-${stone.id}`;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: style.top,
    roughness: 0.58,
    metalness: 0.04,
    transparent: true,
    opacity: 1,
  });

  const body = new THREE.Mesh(discGeometry(stone.radius), bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // 柔和接触阴影
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(stone.radius * 2.9, stone.radius * 2.9),
    new THREE.MeshBasicMaterial({
      map: getBlobTexture(),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      color: 0x08303f,
    })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.set(-0.09, 0.004, 0.11).applyAxisAngle(new THREE.Vector3(0, 1, 0), -stone.angle);
  blob.renderOrder = 1;
  group.add(blob);
  group.userData.blob = blob;

  // 顶部内嵌装饰环 —— 冰壶把手
  const ringMat = new THREE.MeshStandardMaterial({
    color: style.ring,
    roughness: 0.42,
    metalness: 0.18,
    transparent: true,
    opacity: 1,
  });
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(stone.radius * 0.55, 0.036, 6, 48),
    ringMat
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = STONE_HEIGHT - 0.008;
  group.add(ring);

  group.userData.stone = stone;
  group.userData.materials = [bodyMat, ringMat];
  group.position.set(stone.x, stone.y, stone.z);
  group.rotation.y = stone.angle;

  return group;
}

