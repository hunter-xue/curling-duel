# 冰壶对决 · Curling Duel

three.js 实现的双人轮流对战小游戏：在白方 / 黑方各自的半场里，把对方的石子**撞下台面**。

## 快速开始

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 产物在 dist/，可直接静态部署
```

## 玩法

- 白方先手，双方轮流。
- 点击**自己的**石子并向后拖拽，松手投出。
- 力度 = 拖拽距离（位置）+ 甩动速度（鼠标速度）。
- 石子有惯性，会滑行、碰撞、被反作用力带偏；**斜撞时自己也可能掉下去**。
- 把对方 5 颗石子全部撞下台面即获胜。

## 技术要点

| 模块 | 说明 |
| --- | --- |
| `src/game/physics.js` | 自写 2D 圆盘物理：恒定动摩擦、法向冲量碰撞（恢复系数 0.92）、越界掉落、动态子步进防穿透 |
| `src/game/table.js` | 程序化冰面：径向渐变 + 冰纹 Canvas 贴图、圆角挤出板 |
| `src/game/stones.js` | 倒角圆盘 `ExtrudeGeometry` + 顶部把手环 + 柔和接触阴影 |
| `src/game/input.js` | 拖拽蓄力、世界坐标拾取、首个碰撞点预测、虚线瞄准 |
| `src/game/rules.js` | 回合状态机、镜像随机布局、计分与胜负 |
| `src/ui/hud.js` | DOM 覆盖层：计分卡、说明面板、力度条、结算 |

**为什么不用 cannon-es / rapier？**
本作是平面上的圆-圆碰撞，自写 2D 物理约 200 行，完全可控、零 WASM 加载、易于调手感；
用 3D 物理引擎反而需要压成 2D 并调摩擦/休眠，收益为负。

## 可调参数

`src/game/physics.js`

```js
export const FRICTION = 3.3;   // 冰面减速，越大越"粘"
export const RESTITUTION = 0.92; // 碰撞弹性
```

`src/game/input.js`

```js
const MAX_DRAG = 2.75;   // 满力拖拽距离
const MIN_LAUNCH = 1.8;  // 最小初速度
const MAX_LAUNCH = 13.6; // 满力初速度
const FLICK_SCALE = 0.05; // 甩动加成系数
```
