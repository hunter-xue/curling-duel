import * as THREE from 'three';
import { TABLE_SIZE } from './physics.js';

/** 台面圆角半径 */
const CORNER = 0.55;
/** 台板厚度 */
const THICK = 0.55;

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** 程序化生成冰面渐变 + 冰纹，无外部贴图依赖 */
function makeIceTexture() {
  const S = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(
    S * 0.5,
    S * 0.58,
    S * 0.02,
    S * 0.5,
    S * 0.5,
    S * 0.76
  );
  grad.addColorStop(0, '#93e6f8');
  grad.addColorStop(0.32, '#5fd0ec');
  grad.addColorStop(0.68, '#31b4d8');
  grad.addColorStop(1, '#1b93b8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);

  // 冰面细纹：极低透明度的斜向长条，避免死板的纯色
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const len = 40 + Math.random() * 320;
    const ang = -0.5 + Math.random() * 0.28;
    const w = 1 + Math.random() * 2.6;
    ctx.strokeStyle = `rgba(255,255,255,${0.015 + Math.random() * 0.035})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
  ctx.restore();

  // 中心高光
  const sheen = ctx.createRadialGradient(S * 0.42, S * 0.36, 0, S * 0.42, S * 0.36, S * 0.5);
  sheen.addColorStop(0, 'rgba(255,255,255,0.16)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, S, S);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  // ShapeGeometry 的 uv 等于世界坐标，重映射到 [0,1]
  tex.repeat.set(1 / TABLE_SIZE, 1 / TABLE_SIZE);
  tex.offset.set(0.5, 0.5);
  return tex;
}

export function createTable(renderer) {
  const group = new THREE.Group();
  group.name = 'table';

  const shape = roundedRect(TABLE_SIZE, TABLE_SIZE, CORNER);

  // 台板（侧面）
  const slabGeo = new THREE.ExtrudeGeometry(shape, {
    depth: THICK,
    bevelEnabled: true,
    bevelSize: 0.05,
    bevelThickness: 0.05,
    bevelSegments: 3,
    curveSegments: 14,
    steps: 1,
  });
  slabGeo.rotateX(-Math.PI / 2);
  slabGeo.translate(0, -(THICK + 0.05), 0); // 台面顶部对齐 y = 0

  const slabMat = new THREE.MeshStandardMaterial({
    color: 0x1a8cae,
    roughness: 0.55,
    metalness: 0.1,
  });
  const slab = new THREE.Mesh(slabGeo, slabMat);
  slab.position.y = -0.001;
  slab.receiveShadow = true;
  group.add(slab);

  // 冰面
  const iceTex = makeIceTexture();
  iceTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const iceGeo = new THREE.ShapeGeometry(shape, 14);
  iceGeo.rotateX(-Math.PI / 2);

  const iceMat = new THREE.MeshStandardMaterial({
    map: iceTex,
    roughness: 0.38,
    metalness: 0.02,
  });
  const ice = new THREE.Mesh(iceGeo, iceMat);
  ice.position.y = 0.0015;
  ice.receiveShadow = true;
  group.add(ice);

  return group;
}
