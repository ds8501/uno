import * as THREE from 'three';
import { Game, botChoose, canPlay, COLORS } from './uno.js';

// ═══════════════════════════════════════════════════════════
//  PALETTE
// ═══════════════════════════════════════════════════════════
const HEX = { red: '#e02216', yellow: '#f5c400', green: '#1e8c45', blue: '#1a5dc8', wild: '#17171f' };
const DOT = { red: '#e02216', yellow: '#f5c400', green: '#1e8c45', blue: '#1a5dc8', wild: '#888' };
const NEON = { bottom: 0x2bd94b, top: 0xff2a1a, left: 0x2b7bff, right: 0xffc400 };

// table metrics
const FELT_W = 11.8, FELT_D = 7.2, FELT_R = 1.45;
const RAIL_W = 16.8, RAIL_D = 11.8, RAIL_R = 2.4;
const FRAME_W = 17.2, FRAME_D = 12.2, FRAME_R = 2.6;
const RACK_TILT = 0.92;      // how far opponent cards lean out of the rack
const HAND_TILT = 0.42;      // slight lean on your own fan

const CARD_W = 1.0, CARD_H = 1.48;
const DRAW_POS = new THREE.Vector3(-0.82, 0.16, 0);
const DISC_POS = new THREE.Vector3(0.82, 0.16, 0);

// ═══════════════════════════════════════════════════════════
//  CANVAS TEXTURES
// ═══════════════════════════════════════════════════════════
const faceCache = new Map();
let backTex = null, unoTex = null, feltTex = null;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
const symbolFor = v => v === 'skip' ? '⊘' : v === 'reverse' ? '⇄'
  : v === 'draw2' ? '+2' : v === 'wild' ? 'W' : v === 'wild4' ? '+4' : v;

function makeFaceTexture(color, value) {
  const key = color + ':' + value;
  if (faceCache.has(key)) return faceCache.get(key);
  const W = 300, H = 444;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  ctx.fillStyle = '#fdfdfd'; roundRect(ctx, 0, 0, W, H, 30); ctx.fill();

  const pad = 15;
  if (color === 'wild') {
    roundRect(ctx, pad, pad, W - 2 * pad, H - 2 * pad, 22); ctx.save(); ctx.clip();
    const q = [['red',0,0],['blue',1,0],['yellow',0,1],['green',1,1]];
    for (const [c, cx, cy] of q) { ctx.fillStyle = HEX[c]; ctx.fillRect(cx*W/2, cy*H/2, W/2, H/2); }
    ctx.restore();
  } else {
    ctx.fillStyle = HEX[color]; roundRect(ctx, pad, pad, W - 2*pad, H - 2*pad, 22); ctx.fill();
  }

  // white oval
  ctx.save(); ctx.translate(W/2, H/2); ctx.rotate(-0.46);
  ctx.fillStyle = '#fdfdfd'; ctx.beginPath(); ctx.ellipse(0, 0, 80, 126, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  const sym = symbolFor(value);
  ctx.fillStyle = color === 'wild' ? '#1c1c1c' : HEX[color];
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 ${sym.length > 1 ? 116 : 184}px 'Segoe UI', system-ui, sans-serif`;
  ctx.fillText(sym, W/2, H/2 + 4);

  ctx.fillStyle = '#fff';
  ctx.font = `900 ${sym.length > 1 ? 44 : 54}px 'Segoe UI', system-ui, sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(sym, 26, 20);
  ctx.save(); ctx.translate(W - 26, H - 20); ctx.rotate(Math.PI);
  ctx.fillText(sym, 0, 0); ctx.restore();

  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  faceCache.set(key, t); return t;
}

function colourWheel(ctx, cx, cy, r) {
  const quads = [['#e02216', -Math.PI/2, 0], ['#1a5dc8', 0, Math.PI/2],
                 ['#1e8c45', Math.PI/2, Math.PI], ['#f5c400', Math.PI, Math.PI*1.5]];
  for (const [c, a0, a1] of quads) {
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, a0, a1); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = Math.max(2, r * 0.09);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
}

function makeBackTexture() {
  if (backTex) return backTex;
  const W = 300, H = 444;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#efefef'; roundRect(ctx, 0, 0, W, H, 26); ctx.fill();
  ctx.fillStyle = '#0c0c10'; roundRect(ctx, 10, 10, W-20, H-20, 19); ctx.fill();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,0.07)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; roundRect(ctx, 10, 10, W-20, H-20, 19); ctx.fill();
  colourWheel(ctx, W/2, H/2, 54);
  colourWheel(ctx, 48, 46, 19);
  backTex = new THREE.CanvasTexture(cv);
  backTex.colorSpace = THREE.SRGBColorSpace; backTex.anisotropy = 8;
  return backTex;
}

function makeUnoButtonTexture() {
  if (unoTex) return unoTex;
  const W = 256, H = 344;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#e02216'; roundRect(ctx, 4, 4, W-8, H-8, 26); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 4;
  roundRect(ctx, 14, 14, W-28, H-28, 20); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = "900 58px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('UNO', W/2, H/2);
  unoTex = new THREE.CanvasTexture(cv);
  unoTex.colorSpace = THREE.SRGBColorSpace; unoTex.anisotropy = 8;
  return unoTex;
}

function makeFeltTexture() {
  if (feltTex) return feltTex;
  const S = 512;
  const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#111116'; ctx.fillRect(0,0,S,S);
  const img = ctx.getImageData(0,0,S,S); const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 16;
    d[i] += n; d[i+1] += n; d[i+2] += n;
  }
  ctx.putImageData(img, 0, 0);
  feltTex = new THREE.CanvasTexture(cv);
  feltTex.wrapS = feltTex.wrapT = THREE.RepeatWrapping;
  feltTex.repeat.set(4, 3);
  return feltTex;
}

let glowTex = null;
function makeGlowTexture() {
  if (glowTex) return glowTex;
  const S = 256;
  const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  glowTex = new THREE.CanvasTexture(cv);
  return glowTex;
}

function makeLabelSprite(text) {
  const cv = document.createElement('canvas'); cv.width = 300; cv.height = 68;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(14,14,18,0.78)'; roundRect(ctx, 0, 0, 300, 68, 20); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, 298, 66, 20); ctx.stroke();
  ctx.fillStyle = '#f0eef8'; ctx.font = "800 30px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(text, 150, 36);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  sp.scale.set(2.5, 0.57, 1);
  return sp;
}

// ═══════════════════════════════════════════════════════════
//  RENDERER / SCENE
// ═══════════════════════════════════════════════════════════
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#07070a');
scene.fog = new THREE.Fog(0x07070a, 26, 52);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 4, 60);
const CAM_TARGET = new THREE.Vector3(0, 0, 0.3);
const CAM_DIR = new THREE.Vector3(0, 0.93, 0.37).normalize();
function fitCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
  const needD = (FRAME_D * 1.04) / (2 * Math.tan(halfFov));
  const needW = (FRAME_W * 1.05) / (2 * Math.tan(halfFov) * aspect);
  const dist = Math.max(needD, needW);
  camera.position.copy(CAM_TARGET).addScaledVector(CAM_DIR, dist);
  camera.lookAt(CAM_TARGET);
  camera.updateProjectionMatrix();
}
fitCamera();

scene.add(new THREE.AmbientLight(0xffffff, 0.34));

const key = new THREE.DirectionalLight(0xffffff, 0.95);
key.position.set(1.5, 15, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -11; key.shadow.camera.right = 11;
key.shadow.camera.top = 11;   key.shadow.camera.bottom = -11;
key.shadow.camera.near = 1;   key.shadow.camera.far = 40;
key.shadow.bias = -0.0006;
key.shadow.radius = 3;
scene.add(key);

const fill = new THREE.DirectionalLight(0x93a8ff, 0.2); fill.position.set(-8, 6, -7); scene.add(fill);
const glowRed = new THREE.PointLight(0xff3020, 0.5, 16); glowRed.position.set(0, 1.1, -5.0); scene.add(glowRed);
const glowGrn = new THREE.PointLight(0x2bd94b, 0.5, 16); glowGrn.position.set(0, 1.1, 5.0); scene.add(glowGrn);

// coloured spill on the dark surround, like the reference render
function addSpill(colour, x, z, size, opacity) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: makeGlowTexture(), color: colour, transparent: true,
      opacity, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  m.rotation.x = -Math.PI/2; m.position.set(x, -0.72, z); scene.add(m);
}
addSpill(0xff3a1e, -10.5, -6.5, 13, 0.26);
addSpill(0xf5c400,  11.0, -6.0, 12, 0.22);
addSpill(0x2b7bff, -11.5,  6.0, 12, 0.20);
addSpill(0xf5c400,  11.5,  6.5, 11, 0.16);

// ═══════════════════════════════════════════════════════════
//  TABLE GEOMETRY
// ═══════════════════════════════════════════════════════════
function roundedShape(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w/2 + r, -h/2);
  s.lineTo(w/2 - r, -h/2);  s.quadraticCurveTo(w/2, -h/2, w/2, -h/2 + r);
  s.lineTo(w/2, h/2 - r);   s.quadraticCurveTo(w/2, h/2, w/2 - r, h/2);
  s.lineTo(-w/2 + r, h/2);  s.quadraticCurveTo(-w/2, h/2, -w/2, h/2 - r);
  s.lineTo(-w/2, -h/2 + r); s.quadraticCurveTo(-w/2, -h/2, -w/2 + r, -h/2);
  return s;
}
function holedShape(ow, oh, or_, iw, ih, ir) {
  const s = roundedShape(ow, oh, or_);
  const hole = roundedShape(iw, ih, ir);
  s.holes.push(new THREE.Path(hole.getPoints(48).reverse()));
  return s;
}

const tableGroup = new THREE.Group(); scene.add(tableGroup);
const neonBars = {}, seatArrows = {}, seatRacks = {};

function buildTable() {
  // ── outer frame: wide gunmetal rail, bevelled ──
  const frameGeo = new THREE.ExtrudeGeometry(roundedShape(FRAME_W, FRAME_D, FRAME_R), {
    depth: 0.72, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.1, bevelSegments: 4, curveSegments: 28,
  });
  const frame = new THREE.Mesh(frameGeo, new THREE.MeshStandardMaterial({
    color: 0x3c3c45, roughness: 0.52, metalness: 0.55 }));
  frame.rotation.x = -Math.PI/2; frame.position.y = -0.72;
  frame.receiveShadow = true; tableGroup.add(frame);

  // rail top surface (lighter, catches the light)
  const rail = new THREE.Mesh(
    new THREE.ShapeGeometry(roundedShape(RAIL_W, RAIL_D, RAIL_R), 28),
    new THREE.MeshStandardMaterial({ color: 0x4a4a55, roughness: 0.45, metalness: 0.6 })
  );
  rail.rotation.x = -Math.PI/2; rail.position.y = 0.012;
  rail.receiveShadow = true; tableGroup.add(rail);

  // thin wooden trim just inside the rail
  const woodGeo = new THREE.ExtrudeGeometry(
    holedShape(FELT_W + 3.0, FELT_D + 3.0, FELT_R + 1.5, FELT_W + 2.1, FELT_D + 2.1, FELT_R + 1.05),
    { depth: 0.1, bevelEnabled: false, curveSegments: 28 });
  const wood = new THREE.Mesh(woodGeo, new THREE.MeshStandardMaterial({
    color: 0x5c3418, roughness: 0.5, metalness: 0.2 }));
  wood.rotation.x = -Math.PI/2; wood.position.y = 0.03; tableGroup.add(wood);

  // dark bezel ringing the felt
  const bezelGeo = new THREE.ExtrudeGeometry(
    holedShape(FELT_W + 0.6, FELT_D + 0.6, FELT_R + 0.3, FELT_W, FELT_D, FELT_R),
    { depth: 0.16, bevelEnabled: false, curveSegments: 28 });
  const bezel = new THREE.Mesh(bezelGeo, new THREE.MeshStandardMaterial({
    color: 0x15151a, roughness: 0.7, metalness: 0.4 }));
  bezel.rotation.x = -Math.PI/2; bezel.position.y = 0.052; tableGroup.add(bezel);

  // black felt
  const felt = new THREE.Mesh(
    new THREE.ShapeGeometry(roundedShape(FELT_W, FELT_D, FELT_R), 28),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, metalness: 0.0, map: makeFeltTexture() })
  );
  felt.rotation.x = -Math.PI/2; felt.position.y = 0.008;
  felt.receiveShadow = true; tableGroup.add(felt);

  // ── neon strips, inset into the rail ──
  const strip = (seat, len, horizontal, x, z) => {
    const g = new THREE.Group();
    const w = horizontal ? len : 0.2, d = horizontal ? 0.2 : len;
    const core = new THREE.Mesh(new THREE.BoxGeometry(w, 0.09, d),
      new THREE.MeshBasicMaterial({ color: NEON[seat] }));
    g.add(core);
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(horizontal ? len * 1.05 : 1.5, horizontal ? 1.5 : len * 1.05),
      new THREE.MeshBasicMaterial({ color: NEON[seat], transparent: true, opacity: 0.24,
        blending: THREE.AdditiveBlending, depthWrite: false })
    );
    halo.rotation.x = -Math.PI/2; halo.position.y = -0.02; g.add(halo);
    g.position.set(x, 0.075, z);
    g.userData = { core, halo };
    tableGroup.add(g); neonBars[seat] = g;
  };
  strip('bottom', 8.8, true, 0,  FELT_D/2 + 0.6);
  strip('top',    8.8, true, 0, -FELT_D/2 - 0.6);
  strip('left',   4.8, false, -FELT_W/2 - 0.6, 0);
  strip('right',  4.8, false,  FELT_W/2 + 0.6, 0);

  // ── angled card racks + turn arrows ──
  const rackMat = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.6, metalness: 0.45 });
  const rack = (seat, len, horizontal, x, z, tiltAxis, tiltSign) => {
    const w = horizontal ? len : 0.8, d = horizontal ? 0.8 : len;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), rackMat);
    m.position.set(x, 0.14, z);
    if (tiltAxis === 'x') m.rotation.x = tiltSign * 0.34;
    else                  m.rotation.z = tiltSign * 0.34;
    m.castShadow = true; m.receiveShadow = true;
    tableGroup.add(m); seatRacks[seat] = m;

    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.4, 3),
      new THREE.MeshBasicMaterial({ color: NEON[seat] }));
    tri.rotation.x = -Math.PI/2;
    tri.rotation.z = seat === 'bottom' ? Math.PI : seat === 'top' ? 0 : seat === 'left' ? -Math.PI/2 : Math.PI/2;
    const inset = 0.95;
    tri.position.set(
      seat === 'left' ? x + inset : seat === 'right' ? x - inset : x, 0.2,
      seat === 'bottom' ? z - inset : seat === 'top' ? z + inset : z
    );
    tableGroup.add(tri); seatArrows[seat] = tri;
  };
  rack('top',    5.2, true,  0, -FELT_D/2 + 0.34, 'x', -1);
  rack('left',   4.4, false, -FELT_W/2 + 0.34, 0, 'z',  1);
  rack('right',  4.4, false,  FELT_W/2 - 0.34, 0, 'z', -1);

  // ── recessed chip wells with stacked chips ──
  const chipStack = (x, z, col) => {
    const well = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.46, 0.08, 26),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1f, roughness: 0.8, metalness: 0.3 })
    );
    well.position.set(x, 0.03, z); tableGroup.add(well);
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(
        new THREE.CylinderGeometry(0.33, 0.33, 0.065, 24),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.55 })
      );
      c.position.set(x, 0.08 + i * 0.066, z);
      c.castShadow = true; tableGroup.add(c);
    }
  };
  const cx = FELT_W/2 + 1.78, cz = FELT_D/2 + 1.72;
  chipStack(-cx, -cz, 0xe02216); chipStack(-cx + 0.78, -cz, 0xe02216);
  chipStack( cx, -cz, 0xf5c400); chipStack( cx - 0.78, -cz, 0xf5c400);
  chipStack(-cx,  cz, 0x1a5dc8); chipStack(-cx + 0.78,  cz, 0x1a5dc8);
  chipStack( cx,  cz, 0xf5c400); chipStack( cx - 0.78,  cz, 0xf5c400);
}
buildTable();

// UNO button on the felt
const unoBtn = new THREE.Mesh(
  new THREE.PlaneGeometry(1.05, 1.42),
  new THREE.MeshBasicMaterial({ map: makeUnoButtonTexture(), transparent: true })
);
unoBtn.rotation.x = -Math.PI/2;
unoBtn.position.set(FELT_W/2 - 1.0, 0.2, FELT_D/2 - 1.15);
unoBtn.userData = { type: 'uno' };
scene.add(unoBtn);
const unoGlow = new THREE.Mesh(
  new THREE.PlaneGeometry(1.9, 2.3),
  new THREE.MeshBasicMaterial({ color: 0xe02216, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
);
unoGlow.rotation.x = -Math.PI/2;
unoGlow.position.copy(unoBtn.position).setY(0.17);
scene.add(unoGlow);

// ═══════════════════════════════════════════════════════════
//  CARD MESHES
// ═══════════════════════════════════════════════════════════
const cardGeo = new THREE.PlaneGeometry(CARD_W, CARD_H);
const cardsGroup = new THREE.Group(); scene.add(cardsGroup);
const labelsGroup = new THREE.Group(); scene.add(labelsGroup);
const cardMeshes = new Map();   // cardId -> group
let discardMeshes = [];
let drawPileMeshes = [];

function makeCard(card) {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const front = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: makeFaceTexture(card.color, card.value) }));
  front.position.z = 0.006;
  const back = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: makeBackTexture() }));
  back.rotation.y = Math.PI; back.position.z = -0.006;
  front.castShadow = true; back.castShadow = true;
  g.add(front, back);
  g.userData = { cardId: card.id };
  cardsGroup.add(g);
  return g;
}
function disposeCard(g) {
  cardsGroup.remove(g);
  g.traverse(o => { if (o.isMesh) o.material.dispose(); });
}

function buildDrawPile() {
  drawPileMeshes.forEach(m => { scene.remove(m); m.material.dispose(); });
  drawPileMeshes = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: makeBackTexture() }));
    m.rotation.x = -Math.PI/2;   // face up so the printed back is the visible side
    m.position.set(DRAW_POS.x, 0.05 + i * 0.021, DRAW_POS.z);
    m.userData = { type: 'draw' };
    scene.add(m); drawPileMeshes.push(m);
  }
}
buildDrawPile();

// ═══════════════════════════════════════════════════════════
//  TWEEN ENGINE
// ═══════════════════════════════════════════════════════════
const anims = [];
const easeOutCubic  = k => 1 - Math.pow(1 - k, 3);
const easeInOutCubic = k => k < 0.5 ? 4*k*k*k : 1 - Math.pow(-2*k + 2, 3) / 2;

function animate3(obj, to, { dur = 0.4, delay = 0, arc = 0, ease = easeOutCubic, onDone = null } = {}) {
  for (let i = anims.length - 1; i >= 0; i--) if (anims[i].obj === obj) anims.splice(i, 1);
  anims.push({
    obj, to, dur, arc, ease, onDone, t: -delay,
    from: {
      px: obj.position.x, py: obj.position.y, pz: obj.position.z,
      rx: obj.rotation.x, ry: obj.rotation.y, rz: obj.rotation.z, s: obj.scale.x,
    },
  });
}
function stepAnims(dt) {
  for (let i = anims.length - 1; i >= 0; i--) {
    const a = anims[i];
    a.t += dt;
    if (a.t < 0) continue;
    const k = Math.min(1, a.t / a.dur), e = a.ease(k);
    const f = a.from, to = a.to, o = a.obj;
    if (to.px !== undefined) o.position.x = f.px + (to.px - f.px) * e;
    if (to.pz !== undefined) o.position.z = f.pz + (to.pz - f.pz) * e;
    const baseY = to.py !== undefined ? f.py + (to.py - f.py) * e : o.position.y;
    o.position.y = baseY + (a.arc ? Math.sin(Math.PI * k) * a.arc : 0);
    if (to.rx !== undefined) o.rotation.x = f.rx + (to.rx - f.rx) * e;
    if (to.ry !== undefined) o.rotation.y = f.ry + (to.ry - f.ry) * e;
    if (to.rz !== undefined) o.rotation.z = f.rz + (to.rz - f.rz) * e;
    if (to.s  !== undefined) { const s = f.s + (to.s - f.s) * e; o.scale.set(s, s, s); }
    if (k >= 1) { anims.splice(i, 1); if (a.onDone) a.onDone(); }
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════
//  GAME STATE
// ═══════════════════════════════════════════════════════════
let game = null;
let clickable = [];
let inputLocked = true;
let busy = false;
let drawnThisTurn = false;
let turnOwner = -1;
let pendingWild = null;

const el = id => document.getElementById(id);
const menu = el('menu'), hud = el('hud'), controls = el('controls');
const winScreen = el('winScreen'), colorPick = el('colorPick');

const humanControlled = p => game.mode === 'hotseat' ? true : p === 0;
const viewPlayer = () => game.mode === 'hotseat' ? game.current : 0;

const SEAT_ORDER = { 2: ['bottom','top'], 3: ['bottom','left','right'], 4: ['bottom','left','top','right'] };
function relSeatOf(p) {
  const n = game.numPlayers;
  return SEAT_ORDER[n][(p - viewPlayer() + n) % n];
}

function handTargets(p) {
  const seat = relSeatOf(p);
  const n = game.hands[p].length;
  const isView = p === viewPlayer();
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) - 0.5 : 0;
    let px, pz, py, ry, rx;
    if (seat === 'bottom') {
      // your fan: wide arc, leaning back toward you, sitting over the rail
      const step = Math.min(0.78, 7.0 / Math.max(n, 1));
      px = (i - (n-1)/2) * step;
      pz = FELT_D/2 - 0.5 + Math.abs(t) * 0.46;
      py = 0.42 + i * 0.008;
      ry = -t * 0.58;
      rx = -Math.PI/2 + HAND_TILT;
    } else {
      // opponents: card backs standing up in the rack, tightly overlapped
      const step = Math.min(0.44, (seat === 'top' ? 5.0 : 4.2) / Math.max(n, 1));
      const off = (i - (n-1)/2) * step;
      py = 0.5 + i * 0.006;
      if (seat === 'top')       { px = -off; pz = -FELT_D/2 + 0.42; ry = Math.PI;    rx = Math.PI/2 - RACK_TILT; }
      else if (seat === 'left') { pz = off;  px = -FELT_W/2 + 0.42; ry = Math.PI/2;  rx = Math.PI/2 + RACK_TILT; }
      else                      { pz = -off; px =  FELT_W/2 - 0.42; ry = -Math.PI/2; rx = Math.PI/2 + RACK_TILT; }
    }
    out.push({ px, pz, py, ry, rx, s: isView ? 1 : 0.8 });
  }
  return out;
}

// Move every card in every hand to its slot; spawn newcomers from the draw pile.
function syncHands({ dur = 0.34, stagger = 0 } = {}) {
  let newIdx = 0;
  for (let p = 0; p < game.numPlayers; p++) {
    const targets = handTargets(p);
    game.hands[p].forEach((card, i) => {
      let mesh = cardMeshes.get(card.id);
      const tg = targets[i];
      if (!mesh) {
        mesh = makeCard(card);
        mesh.position.set(DRAW_POS.x, 0.2, DRAW_POS.z);
        mesh.rotation.set(Math.PI/2, 0, 0);
        mesh.scale.set(0.8, 0.8, 0.8);
        cardMeshes.set(card.id, mesh);
        animate3(mesh, tg, { dur: 0.46, delay: stagger * newIdx++, arc: 0.85, ease: easeInOutCubic });
      } else {
        animate3(mesh, tg, { dur });
      }
    });
  }
}

// Lift the human's playable cards so they read as clickable.
function markPlayable() {
  clickable = [];
  if (!game || game.winner != null) return;
  const p = game.current;
  drawPileMeshes.forEach(m => { if (!inputLocked && humanControlled(p)) clickable.push(m); });
  clickable.push(unoBtn);
  if (inputLocked || !humanControlled(p) || p !== viewPlayer()) return;
  const targets = handTargets(p);
  game.hands[p].forEach((card, i) => {
    const mesh = cardMeshes.get(card.id);
    if (!mesh) return;
    if (canPlay(card, game.top, game.activeColor)) {
      const tg = { ...targets[i] };
      tg.py += 0.4; tg.pz += 0.34;
      animate3(mesh, tg, { dur: 0.22 });
      mesh.userData.playable = true;
      clickable.push(mesh);
    } else {
      mesh.userData.playable = false;
    }
  });
}

function placeDiscard(mesh, { fromHand = true } = {}) {
  const spin = (discardMeshes.length % 4) * 0.16 - 0.24;
  discardMeshes.push(mesh);
  animate3(mesh, {
    px: DISC_POS.x, py: 0.085 + discardMeshes.length * 0.014, pz: DISC_POS.z,
    rx: -Math.PI/2, ry: spin, s: 1,
  }, { dur: fromHand ? 0.46 : 0.4, arc: 1.15, ease: easeInOutCubic });
  while (discardMeshes.length > 8) disposeCard(discardMeshes.shift());
}

function refreshLabels() {
  while (labelsGroup.children.length) {
    const c = labelsGroup.children[0]; labelsGroup.remove(c);
    c.material.map.dispose(); c.material.dispose();
  }
  if (!game) return;
  const LBL = {
    bottom: [0, 0.5, FELT_D/2 + 1.25],
    top:    [0, 0.5, -FELT_D/2 - 1.25],
    left:   [-FELT_W/2 - 1.1, 0.5, 0],
    right:  [ FELT_W/2 + 1.1, 0.5, 0],
  };
  for (let p = 0; p < game.numPlayers; p++) {
    const seat = relSeatOf(p);
    const sp = makeLabelSprite(`${game.playerName(p)}  ·  ${game.hands[p].length}`);
    sp.position.set(...LBL[seat]);
    labelsGroup.add(sp);
  }
}

function applySeatVisibility() {
  const used = SEAT_ORDER[game.numPlayers];
  for (const seat of ['bottom', 'top', 'left', 'right']) {
    const on = used.includes(seat);
    if (seatRacks[seat]) seatRacks[seat].visible = on;
    if (neonBars[seat]) neonBars[seat].visible = on;
    if (seatArrows[seat]) seatArrows[seat].visible = false;
  }
}

function refreshSeatGlow() {
  if (!game) return;
  const active = relSeatOf(game.current);
  for (const seat of Object.keys(neonBars)) {
    const on = seat === active;
    const g = neonBars[seat];
    if (!g) continue;
    g.userData.halo.material.opacity = on ? 0.5 : 0.2;
    g.userData.core.material.color.setHex(NEON[seat]);
    g.userData.core.scale.y = on ? 1.5 : 1;
    if (seatArrows[seat]) seatArrows[seat].visible = on;
  }
  glowRed.intensity = active === 'top' ? 1.0 : 0.35;
  glowGrn.intensity = active === 'bottom' ? 1.0 : 0.35;
  // UNO button glows when the viewing player is down to one card
  const one = game.hands[viewPlayer()].length === 1;
  unoGlow.material.opacity = one ? 0.4 : 0;
}

// ═══════════════════════════════════════════════════════════
//  HUD
// ═══════════════════════════════════════════════════════════
function updateHUD() {
  if (!game) return;
  const c = game.activeColor;
  const nm = game.playerName(game.current);
  el('turnBanner').innerHTML =
    `<span class="dot" style="background:${DOT[c] || '#888'};color:${DOT[c] || '#888'}"></span>` +
    (nm === 'You' ? 'Your turn' : `${nm}'s turn`);
  el('log').innerHTML = game.log.map(l => `<div>${l}</div>`).join('');
  const hint = el('hint');
  if (game.winner != null) { hint.textContent = ''; }
  else if (humanControlled(game.current) && !inputLocked) {
    hint.textContent = game.hasLegalMove(game.current)
      ? 'Click a raised card to play, or draw from the pile.'
      : 'No legal move — draw from the pile.';
  } else hint.textContent = '';
  el('drawBtn').disabled = drawnThisTurn || inputLocked;
  el('passBtn').style.display = drawnThisTurn ? 'inline-block' : 'none';
  refreshSeatGlow();   // keep the lit seat in step with the banner
}

// ═══════════════════════════════════════════════════════════
//  TURN FLOW
// ═══════════════════════════════════════════════════════════
async function afterMove() {
  refreshLabels(); refreshSeatGlow(); updateHUD();
  if (game.winner != null) { showWin(); return; }
  if (game.current !== turnOwner) { turnOwner = game.current; drawnThisTurn = false; }
  busy = false;
  if (humanControlled(game.current)) {
    inputLocked = false; markPlayable(); updateHUD();
  } else {
    inputLocked = true; markPlayable(); updateHUD();
    await sleep(700);
    botTurn();
  }
}

async function applyPlay(cardId, color) {
  busy = true; inputLocked = true; clickable = [];
  const mesh = cardMeshes.get(cardId);
  const before = game.current;
  const effect = game.playCard(cardId, color);
  if (!effect) { busy = false; inputLocked = false; markPlayable(); return; }

  if (mesh) { cardMeshes.delete(cardId); placeDiscard(mesh); }
  refreshLabels(); updateHUD();
  await sleep(300);
  syncHands({ stagger: 0.09 });          // penalty draws fly in
  await sleep(effect.drewCount ? 520 : 260);
  await afterMove();
}

async function applyDraw() {
  if (drawnThisTurn || busy) return;
  busy = true; inputLocked = true; clickable = [];
  const r = game.drawTurn();
  drawnThisTurn = true;
  syncHands({ stagger: 0.06 });
  refreshLabels(); updateHUD();
  await sleep(520);
  if (r.playable) {
    busy = false; inputLocked = false;
    markPlayable(); updateHUD();
  } else {
    await afterMove();
  }
}

function botColorChoice(hand) {
  const cnt = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const c of hand) if (cnt[c.color] != null) cnt[c.color]++;
  return COLORS.reduce((a, b) => (cnt[a] >= cnt[b] ? a : b));
}

async function botTurn() {
  if (!game || game.winner != null) return;
  const choice = botChoose(game);
  if (choice.action === 'draw') {
    busy = true;
    const r = game.drawTurn();
    syncHands({ stagger: 0.06 });
    refreshLabels(); updateHUD();
    await sleep(560);
    if (r.playable) { await applyPlay(r.drew.id, r.drew.color === 'wild' ? botColorChoice(game.hands[game.current]) : null); }
    else { await afterMove(); }
  } else {
    await applyPlay(choice.cardId, choice.color);
  }
}

async function humanPlay(cardId) {
  const card = game.hands[game.current].find(c => c.id === cardId);
  if (!card || !canPlay(card, game.top, game.activeColor)) return;
  if (card.color === 'wild') {
    pendingWild = cardId; inputLocked = true; clickable = [];
    colorPick.style.display = 'flex';
    return;
  }
  await applyPlay(cardId, null);
}

// ═══════════════════════════════════════════════════════════
//  DEAL ANIMATION
// ═══════════════════════════════════════════════════════════
async function dealAnimation() {
  inputLocked = true; busy = true;
  const n = game.numPlayers;
  const targets = [];
  for (let p = 0; p < n; p++) targets.push(handTargets(p));
  // round-robin deal order
  const order = [];
  for (let r = 0; r < 7; r++) for (let p = 0; p < n; p++) order.push([p, r]);
  order.forEach(([p, r], k) => {
    const card = game.hands[p][r];
    if (!card) return;
    const mesh = makeCard(card);
    mesh.position.set(DRAW_POS.x, 0.22, DRAW_POS.z);
    mesh.rotation.set(Math.PI/2, 0, 0);
    mesh.scale.set(0.72, 0.72, 0.72);
    cardMeshes.set(card.id, mesh);
    animate3(mesh, targets[p][r], { dur: 0.44, delay: k * 0.055, arc: 0.95, ease: easeInOutCubic });
  });
  // starting discard card flips onto the pile
  const top = game.top;
  const tm = makeCard(top);
  tm.position.set(DRAW_POS.x, 0.22, DRAW_POS.z);
  tm.rotation.set(Math.PI/2, 0, 0);
  cardMeshes.set(top.id, tm);
  await sleep(order.length * 55 + 320);
  cardMeshes.delete(top.id);
  placeDiscard(tm, { fromHand: false });
  await sleep(480);
  busy = false;
}

// ═══════════════════════════════════════════════════════════
//  INPUT
// ═══════════════════════════════════════════════════════════
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered = null;

function pick(e) {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(clickable, true);
  if (!hits.length) return null;
  let o = hits[0].object;
  while (o && o.userData.cardId === undefined && o.userData.type === undefined) o = o.parent;
  return o;
}

renderer.domElement.addEventListener('pointermove', e => {
  if (inputLocked || busy || !game) { document.body.style.cursor = 'default'; return; }
  const o = pick(e);
  document.body.style.cursor = o ? 'pointer' : 'default';
  if (hovered && hovered !== o) { hovered.scale.setScalar(hovered.userData._s || 1); hovered = null; }
  if (o && o.userData.playable) {
    o.userData._s = 1; o.scale.setScalar(1.09); hovered = o;
  }
});

renderer.domElement.addEventListener('pointerdown', async e => {
  if (inputLocked || busy || !game || game.winner != null) return;
  const o = pick(e);
  if (!o) return;
  if (o.userData.type === 'draw') { await applyDraw(); }
  else if (o.userData.type === 'uno') { flashUno(); }
  else if (o.userData.playable) {
    if (hovered === o) { hovered.scale.setScalar(1); hovered = null; }
    await humanPlay(o.userData.cardId);
  }
});

let unoFlash = 0;
function flashUno() { unoFlash = 1; }

colorPick.querySelectorAll('.swatch').forEach(sw => {
  sw.addEventListener('click', async () => {
    colorPick.style.display = 'none';
    const id = pendingWild; pendingWild = null;
    await applyPlay(id, sw.dataset.color);
  });
});

el('drawBtn').addEventListener('click', () => applyDraw());
el('passBtn').addEventListener('click', async () => {
  if (busy) return;
  drawnThisTurn = false; game.passTurn(); await afterMove();
});
el('menuBtn').addEventListener('click', backToMenu);
el('againBtn').addEventListener('click', () => { winScreen.style.display = 'none'; startGame(); });

// ── menu selection ──
let selMode = 'ai', selCount = 3;
el('modeRow').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
  el('modeRow').querySelectorAll('button').forEach(x => x.classList.remove('sel'));
  b.classList.add('sel'); selMode = b.dataset.mode;
}));
el('countRow').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
  el('countRow').querySelectorAll('button').forEach(x => x.classList.remove('sel'));
  b.classList.add('sel'); selCount = parseInt(b.dataset.count, 10);
}));
el('startBtn').addEventListener('click', startGame);

function clearBoard() {
  cardMeshes.forEach(m => disposeCard(m)); cardMeshes.clear();
  discardMeshes.forEach(m => disposeCard(m)); discardMeshes = [];
  anims.length = 0;
  while (labelsGroup.children.length) {
    const c = labelsGroup.children[0]; labelsGroup.remove(c);
    c.material.map.dispose(); c.material.dispose();
  }
}

async function startGame() {
  clearBoard();
  game = new Game(selCount, selMode);
  turnOwner = game.current; drawnThisTurn = false; pendingWild = null;
  menu.style.display = 'none'; winScreen.style.display = 'none';
  hud.style.display = 'flex'; controls.classList.remove('hidden');
  const hl = el('homeLink'); if (hl) hl.style.display = 'block';
  buildDrawPile();
  applySeatVisibility();
  refreshLabels(); refreshSeatGlow(); updateHUD();
  await dealAnimation();
  await afterMove();
}

function backToMenu() {
  game = null; inputLocked = true; busy = false; clickable = [];
  hud.style.display = 'none'; controls.classList.add('hidden'); winScreen.style.display = 'none';
  const hl = el('homeLink'); if (hl) hl.style.display = 'none';
  clearBoard();
  menu.style.display = 'flex';
}

function showWin() {
  inputLocked = true; clickable = [];
  el('winText').textContent = game.playerName(game.winner) + ' wins!';
  winScreen.style.display = 'flex';
}

// ═══════════════════════════════════════════════════════════
//  RENDER LOOP
// ═══════════════════════════════════════════════════════════
let lastTick = performance.now();

function tick() {
  const now = performance.now();
  const dt = Math.min((now - lastTick) / 1000, 0.05);
  lastTick = now;
  stepAnims(dt);

  // gentle neon breathing on the active seat
  if (game) {
    const active = relSeatOf(game.current);
    if (neonBars[active]) neonBars[active].userData.halo.material.opacity = 0.34 + Math.sin(now / 380) * 0.09;
    const arrow = seatArrows[active];
    if (arrow) arrow.position.y = 0.2 + Math.sin(now / 300) * 0.05;
  }
  if (unoFlash > 0) {
    unoFlash = Math.max(0, unoFlash - dt * 1.6);
    unoGlow.material.opacity = unoFlash * 0.85;
    unoBtn.scale.setScalar(1 + unoFlash * 0.12);
  }

  renderer.render(scene, camera);
}

function rafLoop() { tick(); requestAnimationFrame(rafLoop); }
requestAnimationFrame(rafLoop);

// Browsers pause rAF in hidden/throttled tabs. Keep stepping on a timer so a
// game left mid-animation still converges instead of freezing half-dealt.
setInterval(() => { if (performance.now() - lastTick > 90) tick(); }, 50);

// Hidden tabs also clamp timers, so on refocus finish anything still in flight
// rather than letting the board crawl to catch up.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  for (const a of anims) a.t = a.dur;
  lastTick = performance.now();
  tick();
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  fitCamera();
});
