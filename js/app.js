import * as THREE from 'three';
import { Game, botChoose, face, bestColor, isWildValue, ELIMINATE_AT } from './uno.js';
import * as Profile from './profile.js';
import * as Net from './net.js';
import { makeView } from './view.js';

// ═══════════════════════════════════════════════════════════
//  PALETTE
// ═══════════════════════════════════════════════════════════
const HEX = {
  red: '#e02216', yellow: '#f5c400', green: '#1e8c45', blue: '#1a5dc8',
  pink: '#d81b7a', teal: '#0d9c9c', orange: '#e06c00', purple: '#6f38c9',
  wild: '#17171f',
};
const DOT = { ...HEX, wild: '#888' };
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
let unoTex = null;

// live profile (wallet + equipped cosmetics)
let profile = Profile.load();
let activeSkin = profile.activeSkin;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
const SYMBOL = {
  skip: '⊘', reverse: '⇄', flip: '⇅',
  draw1: '+1', draw2: '+2', draw5: '+5', draw6: '+6', draw10: '+10',
  skipall: '⊘ALL', revdraw4: '⇄+4', discardall: 'DUMP',
  wild: 'W', wild2: '+2', wild4: '+4', wild6: '+6', wild10: '+10', wildcolor: 'W?',
};
const symbolFor = v => SYMBOL[v] ?? v;
// long labels need to shrink or they overflow the card
const symFont = len => (len <= 1 ? 184 : len === 2 ? 116 : len === 3 ? 84 : 62);

function makeFaceTexture(color, value, side = 'light') {
  const key = color + ':' + value + ':' + side;
  if (faceCache.has(key)) return faceCache.get(key);
  const W = 300, H = 444;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  ctx.fillStyle = '#fdfdfd'; roundRect(ctx, 0, 0, W, H, 30); ctx.fill();

  const pad = 15;
  if (color === 'wild') {
    roundRect(ctx, pad, pad, W - 2 * pad, H - 2 * pad, 22); ctx.save(); ctx.clip();
    const q = side === 'dark'
      ? [['pink',0,0],['teal',1,0],['orange',0,1],['purple',1,1]]
      : [['red',0,0],['blue',1,0],['yellow',0,1],['green',1,1]];
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
  ctx.font = `900 ${symFont(sym.length)}px 'Segoe UI', system-ui, sans-serif`;
  ctx.fillText(sym, W/2, H/2 + 4);

  ctx.fillStyle = '#fff';
  ctx.font = `900 ${sym.length > 2 ? 32 : sym.length > 1 ? 44 : 54}px 'Segoe UI', system-ui, sans-serif`;
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

const backCache = new Map();
function makeBackTexture(skin = activeSkin) {
  if (backCache.has(skin)) return backCache.get(skin);
  const W = 300, H = 444;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  const border = skin === 'gold' ? '#e8c86a' : skin === 'neon' ? '#dcdcf5' : '#efefef';
  ctx.fillStyle = border; roundRect(ctx, 0, 0, W, H, 26); ctx.fill();
  ctx.fillStyle = skin === 'carbon' ? '#15151a' : '#0c0c10';
  roundRect(ctx, 10, 10, W-20, H-20, 19); ctx.fill();

  ctx.save();
  roundRect(ctx, 10, 10, W-20, H-20, 19); ctx.clip();
  if (skin === 'carbon') {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 3;
    for (let i = -H; i < W + H; i += 12) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i + H, 0); ctx.lineTo(i, H); ctx.stroke();
    }
  } else if (skin === 'neon') {
    ctx.strokeStyle = 'rgba(0,220,255,0.16)'; ctx.lineWidth = 2;
    for (let x = 10; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, H-10); ctx.stroke(); }
    for (let y = 10; y < H; y += 24) { ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(W-10, y); ctx.stroke(); }
  } else if (skin === 'gold') {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, 'rgba(232,200,106,0.20)');
    g.addColorStop(0.5, 'rgba(232,200,106,0.04)');
    g.addColorStop(1, 'rgba(232,200,106,0.22)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  const sheen = ctx.createLinearGradient(0, 0, 0, H);
  sheen.addColorStop(0, 'rgba(255,255,255,0.07)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen; ctx.fillRect(0, 0, W, H);
  ctx.restore();

  if (skin === 'neon') {
    ctx.strokeStyle = '#22e0ff'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(W/2, H/2, 58, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = '#ff3ac0'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(W/2, H/2, 44, 0, Math.PI*2); ctx.stroke();
  } else if (skin === 'gold') {
    ctx.strokeStyle = '#e8c86a'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(W/2, H/2, 60, 0, Math.PI*2); ctx.stroke();
    colourWheel(ctx, W/2, H/2, 42);
  } else {
    colourWheel(ctx, W/2, H/2, 54);
  }
  colourWheel(ctx, 48, 46, 19);

  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  backCache.set(skin, t);
  return t;
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

const feltCache = new Map();
function makeFeltTexture(base = '#24242f') {
  if (feltCache.has(base)) return feltCache.get(base);
  const S = 512;
  const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0,0,S,S);
  const img = ctx.getImageData(0,0,S,S); const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    d[i] += n; d[i+1] += n; d[i+2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 3);
  feltCache.set(base, t);
  return t;
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

function makeLabelSprite(text, glyph = '') {
  const cv = document.createElement('canvas'); cv.width = 300; cv.height = 68;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(14,14,18,0.78)'; roundRect(ctx, 0, 0, 300, 68, 20); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, 298, 66, 20); ctx.stroke();
  ctx.fillStyle = '#f0eef8'; ctx.font = "800 30px 'Segoe UI', system-ui, sans-serif";
  ctx.textBaseline = 'middle';
  if (glyph) {
    ctx.textAlign = 'left';
    ctx.font = "30px 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
    ctx.fillText(glyph, 18, 36);
    ctx.fillStyle = '#f0eef8'; ctx.font = "800 28px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(text, 58, 36);
  } else {
    ctx.textAlign = 'center';
    ctx.fillText(text, 150, 36);
  }
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
scene.background = new THREE.Color('#0d0d15');
scene.fog = new THREE.Fog(0x0d0d15, 28, 56);

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
scene.add(new THREE.HemisphereLight(0x8ea4ff, 0x241c2c, 0.3));

const key = new THREE.DirectionalLight(0xfff3e0, 1.05);
key.position.set(1.5, 15, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -11; key.shadow.camera.right = 11;
key.shadow.camera.top = 11;   key.shadow.camera.bottom = -11;
key.shadow.camera.near = 1;   key.shadow.camera.far = 40;
key.shadow.bias = -0.0006;
key.shadow.radius = 3;
scene.add(key);

const fill = new THREE.DirectionalLight(0x93a8ff, 0.38); fill.position.set(-8, 6, -7); scene.add(fill);

// overhead lamp: warm pool on the felt that falls off across the rail
const lamp = new THREE.SpotLight(0xffe7c0, 34, 22, 0.5, 0.95, 1.5);
lamp.position.set(0.3, 10.5, 2.2);
lamp.target.position.set(0, 0, 0.4);
scene.add(lamp, lamp.target);

const glowRed = new THREE.PointLight(0xff3020, 1.4, 16); glowRed.position.set(0, 1.1, -5.0); scene.add(glowRed);
const glowGrn = new THREE.PointLight(0x2bd94b, 1.4, 16); glowGrn.position.set(0, 1.1, 5.0); scene.add(glowGrn);
const glowBlu = new THREE.PointLight(0x2b7bff, 1.0, 16); glowBlu.position.set(-6.6, 1.1, 0); scene.add(glowBlu);
const glowYel = new THREE.PointLight(0xffc400, 1.0, 16); glowYel.position.set( 6.6, 1.1, 0); scene.add(glowYel);

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

// chip wells, punched clean through the rail + frame so the chips sit in a pocket.
// RAIL_Y is the visible rail surface: the frame's bevelled top (depth + bevelThickness),
// which sits above the `rail` plane.
const RAIL_Y = 0.105;
const WELL_R = 0.6, WELL_DEPTH = 0.22;
// two wells per corner, spaced along the rail's corner arc so both clear its edge
const wellAt = deg => {
  const a = THREE.MathUtils.degToRad(deg), d = 1.68;
  return [RAIL_W/2 - RAIL_R + Math.cos(a) * d, RAIL_D/2 - RAIL_R + Math.sin(a) * d];
};
const [WA_X, WA_Z] = wellAt(21), [WB_X, WB_Z] = wellAt(69);
const CHIP_WELLS = [
  [-WA_X, -WA_Z, 0xe02216], [-WB_X, -WB_Z, 0xe02216],
  [ WA_X, -WA_Z, 0xf5c400], [ WB_X, -WB_Z, 0xf5c400],
  [-WA_X,  WA_Z, 0x1a5dc8], [-WB_X,  WB_Z, 0x1a5dc8],
  [ WA_X,  WA_Z, 0xf5c400], [ WB_X,  WB_Z, 0xf5c400],
];
function punchWells(shape) {
  for (const [x, z] of CHIP_WELLS) {
    const p = new THREE.Path();
    p.absarc(x, -z, WELL_R, 0, Math.PI * 2, true);
    shape.holes.push(p);
  }
  return shape;
}

const tableGroup = new THREE.Group(); scene.add(tableGroup);
const themed = {};   // frame / rail / wood / bezel / felt materials
const neonBars = {}, seatArrows = {}, seatRacks = {};

function buildTable() {
  // ── outer frame: wide gunmetal rail, bevelled ──
  const frameGeo = new THREE.ExtrudeGeometry(punchWells(
    holedShape(FRAME_W, FRAME_D, FRAME_R, FELT_W + 0.2, FELT_D + 0.2, FELT_R + 0.1)), {
    depth: 0.72, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.1, bevelSegments: 4, curveSegments: 28,
  });
  themed.frame = new THREE.MeshStandardMaterial({ color: 0x3f3f4b, roughness: 0.46, metalness: 0.6 });
  const frame = new THREE.Mesh(frameGeo, themed.frame);
  frame.rotation.x = -Math.PI/2; frame.position.y = -0.72;
  frame.receiveShadow = true; tableGroup.add(frame);

  // rail top surface (lighter, catches the light)
  const rail = new THREE.Mesh(
    new THREE.ShapeGeometry(punchWells(
      holedShape(RAIL_W, RAIL_D, RAIL_R, FELT_W + 0.2, FELT_D + 0.2, FELT_R + 0.1)), 28),
    (themed.rail = new THREE.MeshStandardMaterial({ color: 0x50505f, roughness: 0.38, metalness: 0.66 }))
  );
  rail.rotation.x = -Math.PI/2; rail.position.y = RAIL_Y;
  rail.receiveShadow = true; tableGroup.add(rail);

  // thin wooden trim just inside the rail
  const woodGeo = new THREE.ExtrudeGeometry(
    holedShape(FELT_W + 3.0, FELT_D + 3.0, FELT_R + 1.5, FELT_W + 2.1, FELT_D + 2.1, FELT_R + 1.05),
    { depth: 0.1, bevelEnabled: false, curveSegments: 28 });
  themed.wood = new THREE.MeshStandardMaterial({ color: 0x7a4820, roughness: 0.42, metalness: 0.25 });
  const wood = new THREE.Mesh(woodGeo, themed.wood);
  wood.rotation.x = -Math.PI/2; wood.position.y = 0.03; tableGroup.add(wood);

  // dark bezel ringing the felt
  const bezelGeo = new THREE.ExtrudeGeometry(
    holedShape(FELT_W + 0.6, FELT_D + 0.6, FELT_R + 0.3, FELT_W, FELT_D, FELT_R),
    { depth: 0.16, bevelEnabled: false, curveSegments: 28 });
  themed.bezel = new THREE.MeshStandardMaterial({ color: 0x23232e, roughness: 0.55, metalness: 0.5 });
  const bezel = new THREE.Mesh(bezelGeo, themed.bezel);
  bezel.rotation.x = -Math.PI/2; bezel.position.y = 0.02; tableGroup.add(bezel);

  // black felt
  const felt = new THREE.Mesh(
    new THREE.ShapeGeometry(roundedShape(FELT_W, FELT_D, FELT_R), 28),
    (themed.felt = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, metalness: 0.0, map: makeFeltTexture() }))
  );
  felt.rotation.x = -Math.PI/2; felt.position.y = 0.008;
  felt.receiveShadow = true; tableGroup.add(felt);

  // soft pool of lamp light across the middle of the felt
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(FELT_W * 1.05, FELT_D * 1.25),
    new THREE.MeshBasicMaterial({ map: makeGlowTexture(), color: 0xffe2b0, transparent: true,
      opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  pool.rotation.x = -Math.PI/2; pool.position.set(0, 0.014, 0.25); tableGroup.add(pool);

  // ── neon strips, inset into the rail ──
  const strip = (seat, len, horizontal, x, z) => {
    const g = new THREE.Group();
    const w = horizontal ? len : 0.2, d = horizontal ? 0.2 : len;
    const core = new THREE.Mesh(new THREE.BoxGeometry(w, 0.09, d),
      new THREE.MeshBasicMaterial({ color: NEON[seat] }));
    g.add(core);
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(horizontal ? len * 1.25 : 2.4, horizontal ? 2.4 : len * 1.25),
      new THREE.MeshBasicMaterial({ map: makeGlowTexture(), color: NEON[seat], transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false })
    );
    halo.rotation.x = -Math.PI/2; halo.position.y = -0.02; g.add(halo);
    g.position.set(x, RAIL_Y + 0.025, z);
    g.userData = { core, halo };
    tableGroup.add(g); neonBars[seat] = g;
  };
  strip('bottom', 8.8, true, 0,  FELT_D/2 + 0.6);
  strip('top',    8.8, true, 0, -FELT_D/2 - 0.6);
  strip('left',   4.8, false, -FELT_W/2 - 0.6, 0);
  strip('right',  4.8, false,  FELT_W/2 + 0.6, 0);

  // ── angled card racks + turn arrows ──
  const rackMat = new THREE.MeshStandardMaterial({ color: 0x2c2c38, roughness: 0.5, metalness: 0.5 });
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

  // ── segment seams: joints splitting the rail into 4 panels + 4 corner pads ──
  const seamMat = new THREE.MeshStandardMaterial({ color: 0x121218, roughness: 0.85, metalness: 0.35 });
  const seam = (x, z, alongX, len) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(alongX ? len : 0.07, 0.02, alongX ? 0.07 : len), seamMat);
    m.position.set(x, RAIL_Y + 0.002, z); tableGroup.add(m);
  };
  for (const sx of [-5.2, 5.2]) { seam(sx, 4.85, false, 2.1); seam(sx, -4.85, false, 2.1); }
  for (const sz of [-3.0, 3.0]) { seam(7.22, sz, true, 2.35); seam(-7.22, sz, true, 2.35); }

  // ── chip wells: pockets sunk through the rail, chips resting on the floor ──
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 0.9, metalness: 0.25 });
  const chipStack = (x, z, col) => {
    const floor = new THREE.Mesh(new THREE.CircleGeometry(WELL_R + 0.01, 26), floorMat);
    floor.rotation.x = -Math.PI/2;
    floor.position.set(x, RAIL_Y - WELL_DEPTH, z);
    floor.receiveShadow = true; tableGroup.add(floor);
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(
        new THREE.CylinderGeometry(0.33, 0.33, 0.065, 24),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.55 })
      );
      c.position.set(x, RAIL_Y - WELL_DEPTH + 0.04 + i * 0.066, z);
      c.castShadow = true; tableGroup.add(c);
    }
  };
  CHIP_WELLS.forEach(([x, z, col]) => chipStack(x, z, col));
}
buildTable();

// UNO button on the felt
const unoBtn = new THREE.Mesh(
  new THREE.PlaneGeometry(1.05, 1.42),
  new THREE.MeshBasicMaterial({ map: makeUnoButtonTexture(), transparent: true })
);
unoBtn.rotation.x = -Math.PI/2;
unoBtn.position.set(FELT_W/2 - 1.0, 0.06, FELT_D/2 - 1.15);
unoBtn.userData = { type: 'uno' };
scene.add(unoBtn);
const unoGlow = new THREE.Mesh(
  new THREE.PlaneGeometry(1.9, 2.3),
  new THREE.MeshBasicMaterial({ color: 0xe02216, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
);
unoGlow.rotation.x = -Math.PI/2;
unoGlow.position.copy(unoBtn.position).setY(0.04);
scene.add(unoGlow);

// wash under the discard pile, tinted with the colour in play
const discGlow = new THREE.Mesh(
  new THREE.PlaneGeometry(3.6, 3.6),
  new THREE.MeshBasicMaterial({ map: makeGlowTexture(), color: 0xffffff, transparent: true,
    opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })
);
discGlow.rotation.x = -Math.PI/2;
discGlow.position.set(DISC_POS.x, 0.026, DISC_POS.z);
scene.add(discGlow);

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
  const side = game ? game.side : 'light';
  const f = face(card, side);
  const frontMap = card.hidden ? makeBackTexture() : makeFaceTexture(f.color, f.value, side);
  const front = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: frontMap }));
  front.position.z = 0.006;
  const back = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: makeBackTexture() }));
  back.rotation.y = Math.PI; back.position.z = -0.006;
  front.castShadow = true; back.castShadow = true;
  g.add(front, back);
  g.userData = { cardId: card.id, card, front, back };
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
//  POWER-CARD EFFECTS
// ═══════════════════════════════════════════════════════════
const SEAT_POS = {
  bottom: [0, FELT_D/2 + 1.25],
  top:    [0, -FELT_D/2 - 1.25],
  left:   [-FELT_W/2 - 1.1, 0],
  right:  [ FELT_W/2 + 1.1, 0],
};
const GLOW_INT = { red: 0xff4a30, yellow: 0xffd42a, green: 0x2fd85f, blue: 0x3b86ff,
                   pink: 0xff4aa8, teal: 0x24d6d6, orange: 0xff8a1e, purple: 0x9b5cff, wild: 0xf2f2ff };
const GLOW_CSS = { red: '#ff6a52', yellow: '#ffdc4a', green: '#4ee07a', blue: '#5c9bff',
                   pink: '#ff6bbb', teal: '#48e6e6', orange: '#ffa347', purple: '#b184ff', wild: '#ffffff' };
const POWER_VALUES = new Set(['skip', 'reverse', 'draw2', 'wild', 'wild4',
  'draw1', 'draw5', 'draw6', 'draw10', 'wild2', 'wild6', 'wild10', 'wildcolor',
  'skipall', 'revdraw4', 'discardall', 'flip']);

const fx = [];
function spawnFx(mesh, dur, update, disposeMap = false) {
  if (mesh) scene.add(mesh);
  fx.push({ mesh, dur, t: 0, update, disposeMap });
}
function stepFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.t += dt;
    const k = Math.min(1, f.t / f.dur);
    f.update(k, f.mesh);
    if (k < 1) continue;
    if (f.mesh) {
      scene.remove(f.mesh);
      if (f.disposeMap) f.mesh.material.map.dispose();
      f.mesh.material.dispose();
    }
    fx.splice(i, 1);
  }
}

function makeFxSprite(text, css) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 168;
  const ctx = cv.getContext('2d');
  ctx.font = "900 104px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = 18;
  ctx.strokeStyle = 'rgba(8,8,12,0.9)'; ctx.strokeText(text, 256, 88);
  ctx.fillStyle = css; ctx.fillText(text, 256, 88);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map: t, transparent: true, depthTest: false, depthWrite: false }));
}

// Shout a word above a seat, rising and fading.
function popText(text, x, z, css) {
  const sp = makeFxSprite(text, css);
  sp.position.set(x, 1.4, z);
  spawnFx(sp, 1.05, (k, o) => {
    const pop = easeOutCubic(Math.min(1, k * 4));
    o.scale.set(2.8 * (0.55 + 0.45 * pop), 0.92 * (0.55 + 0.45 * pop), 1);
    o.position.y = 1.4 + k * 0.8;
    o.material.opacity = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
  }, true);
}

// Expanding ring plus a soft flash, flat on the table.
function ringBurst(x, z, colour, { r1 = 3.0, dur = 0.7, y = 0.3, soft = 0.7 } = {}) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1.0, 48),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  ring.rotation.x = -Math.PI/2; ring.position.set(x, y, z);
  spawnFx(ring, dur, (k, o) => {
    const sc = 0.35 + (r1 - 0.35) * easeOutCubic(k);
    o.scale.set(sc, sc, 1);
    o.material.opacity = 0.9 * Math.pow(1 - k, 1.4);
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: makeGlowTexture(), color: colour, transparent: true, opacity: soft,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  flash.rotation.x = -Math.PI/2; flash.position.set(x, y - 0.03, z);
  spawnFx(flash, dur * 0.85, (k, o) => {
    const sc = 1.4 + r1 * easeOutCubic(k);
    o.scale.set(sc, sc, 1);
    o.material.opacity = soft * (1 - k);
  });
}

// Rattle a seat's card rack.
function shakeSeat(seat) {
  const m = seatRacks[seat];
  if (!m || !m.visible) return;
  const bx = m.position.x, bz = m.position.z;
  const alongX = seat === 'top' || seat === 'bottom';
  spawnFx(null, 0.5, k => {
    const d = Math.sin(k * Math.PI * 7) * 0.085 * (1 - k);
    if (alongX) m.position.x = bx + d; else m.position.z = bz + d;
    if (k >= 1) m.position.set(bx, m.position.y, bz);
  });
}

// Sweeping arc that spins the way play now flows.
function reverseSwirl(colour) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.06, 8, 72, Math.PI * 1.4),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  ring.rotation.x = -Math.PI/2; ring.position.set(0, 0.34, 0.2);
  spawnFx(ring, 0.95, (k, o) => {
    o.rotation.z = -game.dir * k * Math.PI * 2.4;
    const sc = 0.65 + 0.5 * easeOutCubic(k);
    o.scale.set(sc, sc, sc);
    o.material.opacity = 0.95 * Math.pow(1 - k, 1.2);
  });
  for (const seat of Object.keys(seatArrows)) {
    const a = seatArrows[seat];
    if (a && a.visible) animate3(a, { rz: a.rotation.z + Math.PI * 2 }, { dur: 0.8, ease: easeInOutCubic });
  }
}

// Rainbow pulse out of the pile, one ring per colour.
function colourFan() {
  const order = [0xff4a30, 0xffd42a, 0x2fd85f, 0x3b86ff];
  order.forEach((c, i) => setTimeout(
    () => ringBurst(DISC_POS.x, DISC_POS.z, c, { r1: 2.4 + i * 0.4, dur: 0.7, soft: 0.3 }), i * 95));
}

// Riffle the discard wash through the four colours, then settle on the chosen one.
function colourCycle(finalInt) {
  const order = [0xff4a30, 0xffd42a, 0x2fd85f, 0x3b86ff];
  spawnFx(null, 1.0, k => {
    discGlow.material.color.setHex(k < 0.72 ? order[Math.floor(k * 14) % 4] : finalInt);
    discGlow.material.opacity = 0.4 + 0.45 * Math.pow(1 - k, 1.5);
  });
}

// Fire the effect that matches the card just played.
function powerFx(effect) {
  const c = effect.face;
  const int = GLOW_INT[c.color], css = GLOW_CSS[c.color];
  const at = p => SEAT_POS[relSeatOf(p)];
  switch (c.value) {
    case 'skip': {
      if (effect.skipped == null) break;
      const [x, z] = at(effect.skipped);
      popText('Skipped!', x, z, css);
      ringBurst(x, z, int, { r1: 2.6 });
      shakeSeat(relSeatOf(effect.skipped));
      break;
    }
    case 'reverse':
      popText('Reverse!', 0, 1.6, css);
      reverseSwirl(int);
      break;
    case 'draw2':
    case 'wild4': {
      if (effect.drew == null) break;
      const [x, z] = at(effect.drew);
      popText(c.value === 'draw2' ? '+2' : '+4', x, z, css);
      ringBurst(x, z, int, { r1: 3.0, soft: 0.85 });
      shakeSeat(relSeatOf(effect.drew));
      if (c.value === 'wild4') { colourCycle(GLOW_INT[game.activeColor]); colourFan(); }
      break;
    }
    case 'wild':
      popText('Wild', DISC_POS.x, DISC_POS.z + 1.2, '#ffffff');
      colourCycle(GLOW_INT[game.activeColor]);
      colourFan();
      break;
    case 'flip':
      popText(game.side === 'dark' ? 'DARK SIDE!' : 'LIGHT SIDE!', 0, 1.6,
              game.side === 'dark' ? '#ff6bbb' : '#ffdc4a');
      colourCycle(GLOW_INT[game.activeColor]);
      reverseSwirl(GLOW_INT[game.activeColor]);
      break;
    case 'skipall':
      popText('Skip Everyone!', 0, 1.6, css);
      reverseSwirl(int);
      break;
    case 'discardall':
      popText(`Dumped ${effect.discarded}!`, 0, 1.6, css);
      ringBurst(DISC_POS.x, DISC_POS.z, int, { r1: 3.0 });
      break;
    case 'draw1': case 'draw5': case 'draw6': case 'draw10':
    case 'wild2': case 'wild6': case 'wild10': case 'wildcolor':
    case 'revdraw4': {
      if (effect.drew == null) break;
      const [dx, dz] = at(effect.drew);
      popText(`+${effect.drewCount}`, dx, dz, css);
      ringBurst(dx, dz, int, { r1: 3.2, soft: 0.9 });
      shakeSeat(relSeatOf(effect.drew));
      if (c.color === 'wild') { colourCycle(GLOW_INT[game.activeColor]); colourFan(); }
      break;
    }
  }
}

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

const isOnline = () => !!(game && game.online);
const humanControlled = p =>
  game.online ? p === game.you : game.mode === 'hotseat' ? true : p === 0;
const viewPlayer = () => game.online ? game.you : (game.mode === 'hotseat' ? game.current : 0);

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
  collectOrphans();
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
    if (game.canPlay(card)) {
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

const DISC_LAYERS = 8, DISC_STEP = 0.014;
const discardY = i => 0.085 + i * DISC_STEP;

function placeDiscard(mesh, { fromHand = true, spins = 0, onLand = null } = {}) {
  const spin = (discardMeshes.length % 4) * 0.16 - 0.24;
  discardMeshes.push(mesh);
  // Trim first, then lay the pile out by index. Keying height off the array
  // length instead meant every card past the cap landed at the same y, so a
  // coplanar older card could win the depth test and keep showing on top.
  // Cards still in flight are retargeted rather than moved, or their tween
  // would drag them straight back to the old height.
  while (discardMeshes.length > DISC_LAYERS) disposeCard(discardMeshes.shift());
  discardMeshes.forEach((m, i) => {
    if (m === mesh) return;
    const flight = anims.find(a => a.obj === m);
    if (flight) flight.to.py = discardY(i); else m.position.y = discardY(i);
  });
  animate3(mesh, {
    px: DISC_POS.x, py: discardY(discardMeshes.length - 1), pz: DISC_POS.z,
    rx: -Math.PI/2, ry: spin + spins * Math.PI * 2, s: 1,
  }, { dur: fromHand ? 0.46 : 0.4, arc: 1.15, ease: easeInOutCubic, onDone: onLand });
}

function refreshLabels() {
  while (labelsGroup.children.length) {
    const c = labelsGroup.children[0]; labelsGroup.remove(c);
    c.material.map.dispose(); c.material.dispose();
  }
  if (!game) return;
  for (let p = 0; p < game.numPlayers; p++) {
    const [x, z] = SEAT_POS[relSeatOf(p)];
    const out = game.eliminated.has(p);
    const n = game.hands[p].length;
    // No Mercy knocks you out at ELIMINATE_AT cards — warn before it happens
    const risk = game.variant === 'nomercy' && !out && n >= ELIMINATE_AT - 6;
    const txt = out ? `${game.playerName(p)}  ·  OUT`
              : risk ? `${game.playerName(p)}  ·  ${n}/${ELIMINATE_AT} ⚠`
              : `${game.playerName(p)}  ·  ${n}`;
    const glyph = (p === viewPlayer() && !out) ? avatarGlyph() : '';
    const sp = makeLabelSprite(txt, glyph);
    sp.position.set(x, 0.5, z);
    labelsGroup.add(sp);
  }
}

function avatarGlyph() {
  const a = Profile.AVATARS.find(x => x.id === profile.activeAvatar);
  return a ? a.glyph : '';
}

/** Push the equipped theme onto the table materials. */
function applyTheme() {
  const t = Profile.THEMES.find(x => x.id === profile.activeTheme) || Profile.THEMES[0];
  if (!themed.felt) return;
  themed.frame.color.setHex(t.frame);
  themed.rail.color.setHex(t.rail);
  themed.wood.color.setHex(t.wood);
  themed.bezel.color.setHex(t.bezel);
  themed.felt.map = makeFeltTexture(t.felt);
  themed.felt.needsUpdate = true;
}

/** Repoint every card back at the equipped skin. */
function applySkin() {
  activeSkin = profile.activeSkin;
  const tex = makeBackTexture(activeSkin);
  cardMeshes.forEach(m => { m.userData.back.material.map = tex; m.userData.back.material.needsUpdate = true; });
  discardMeshes.forEach(m => { if (m.userData.back) { m.userData.back.material.map = tex; m.userData.back.material.needsUpdate = true; } });
  drawPileMeshes.forEach(m => { m.material.map = tex; m.material.needsUpdate = true; });
}

function applyCosmetics() { applyTheme(); applySkin(); }

/** After a Flip card, every card in play shows its other face. */
function retextureAll() {
  const side = game.side;
  const paint = m => {
    const c = m.userData.card;
    if (!c || c.hidden) return;
    const f = face(c, side);
    m.userData.front.material.map = makeFaceTexture(f.color, f.value, side);
    m.userData.front.material.needsUpdate = true;
  };
  cardMeshes.forEach(paint);
  discardMeshes.forEach(paint);
}

/** Drop meshes for cards that left every hand (elimination, Discard All). */
function collectOrphans() {
  const live = new Set();
  for (const hand of game.hands) for (const c of hand) live.add(c.id);
  const inDiscard = new Set(discardMeshes.map(m => m.userData.cardId));
  for (const [id, mesh] of [...cardMeshes]) {
    if (live.has(id) || inDiscard.has(id)) continue;
    for (let i = anims.length - 1; i >= 0; i--) if (anims[i].obj === mesh) anims.splice(i, 1);
    cardMeshes.delete(id);
    disposeCard(mesh);
  }
}

/** Rebuild the wild-colour swatches for whichever side is up. */
function buildColorSwatches() {
  const grid = colorPick.querySelector('.grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const c of game.palette()) {
    const d = document.createElement('div');
    d.className = 'swatch';
    d.dataset.color = c;
    d.style.background = HEX[c];
    d.addEventListener('click', async () => {
      colorPick.style.display = 'none';
      const id = pendingWild; pendingWild = null;
      if (id != null) await applyPlay(id, c);
    });
    grid.appendChild(d);
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
    g.userData.halo.material.opacity = on ? 0.62 : 0.26;
    g.userData.core.material.color.setHex(NEON[seat]);
    g.userData.core.scale.y = on ? 1.5 : 1;
    if (seatArrows[seat]) seatArrows[seat].visible = on;
  }
  glowRed.intensity = active === 'top' ? 2.4 : 0.9;
  glowGrn.intensity = active === 'bottom' ? 2.4 : 0.9;
  glowBlu.intensity = active === 'left' ? 2.0 : 0.7;
  glowYel.intensity = active === 'right' ? 2.0 : 0.7;
  discGlow.material.color.setHex(GLOW_INT[game.activeColor] || 0xffffff);
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
  } else if (isOnline()) {
    inputLocked = true; markPlayable(); updateHUD();   // server drives the others
  } else {
    inputLocked = true; markPlayable(); updateHUD();
    await sleep(700);
    botTurn();
  }
}

async function applyPlay(cardId, color) {
  if (isOnline()) {
    busy = true; inputLocked = true; clickable = [];
    Net.playCard(cardId, color);
    return;                                   // resolves when the server replies
  }
  busy = true; inputLocked = true; clickable = [];
  const mesh = cardMeshes.get(cardId);
  const before = game.current;
  const effect = game.playCard(cardId, color);
  if (!effect) { busy = false; inputLocked = false; markPlayable(); return; }

  await animateMove(effect, mesh);
}

/** Animate one resolved move. Shared by local play and server echoes. */
async function animateMove(effect, mesh) {
  const power = POWER_VALUES.has(effect.face.value);
  if (mesh) {
    cardMeshes.delete(effect.card.id);
    placeDiscard(mesh, {
      spins: power ? 2 : 0,
      onLand: () => {
        ringBurst(DISC_POS.x, DISC_POS.z, GLOW_INT[effect.face.color],
          power ? { r1: 2.2, dur: 0.7 } : { r1: 1.3, dur: 0.45, soft: 0.35 });
        if (power) powerFx(effect);
      },
    });
  }
  if (effect.flipped) retextureAll();
  refreshLabels(); updateHUD();
  await sleep(power ? 460 : 300);
  syncHands({ stagger: 0.09 });          // penalty draws fly in
  await sleep(effect.drewCount ? 620 : power ? 420 : 260);
  await afterMove();
}

async function applyDraw() {
  if (drawnThisTurn || busy) return;
  if (isOnline()) {
    busy = true; inputLocked = true; clickable = [];
    Net.drawCard();
    return;
  }
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



async function botTurn() {
  if (!game || game.winner != null) return;
  const choice = botChoose(game);
  if (choice.action === 'draw') {
    busy = true;
    const r = game.drawTurn();
    syncHands({ stagger: 0.06 });
    refreshLabels(); updateHUD();
    await sleep(560);
    if (r.playable) {
      const wild = isWildValue(game.faceOf(r.drew).value);
      await applyPlay(r.drew.id, wild ? bestColor(game, game.hands[game.current]) : null);
    }
    else { await afterMove(); }
  } else {
    await applyPlay(choice.cardId, choice.color);
  }
}

async function humanPlay(cardId) {
  const card = game.hands[game.current].find(c => c.id === cardId);
  if (!card || !game.canPlay(card)) return;
  if (isWildValue(game.faceOf(card).value)) {
    buildColorSwatches();
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

// wild-colour swatches are built per side by buildColorSwatches()

el('drawBtn').addEventListener('click', () => applyDraw());
el('passBtn').addEventListener('click', async () => {
  if (busy) return;
  if (isOnline()) { busy = true; inputLocked = true; Net.passTurn(); return; }
  drawnThisTurn = false; game.passTurn(); await afterMove();
});
el('menuBtn').addEventListener('click', backToMenu);
el('againBtn').addEventListener('click', () => {
  winScreen.style.display = 'none';
  if (isOnline()) { if (isHost) Net.startRoom(); else showLobby('room'); return; }
  startGame();
});

// ── menu selection ──
let selMode = 'ai', selCount = 3, selVariant = 'classic';

function refreshCoinHud() {
  const txt = Profile.fmt(profile.coins);
  for (const id of ['coinCount', 'coinCount2']) {
    const c = el(id);
    if (c) c.textContent = txt;
  }
}

/** Paint the variant buttons, locking anything not yet bought. */
function refreshVariantRow() {
  const row = el('variantRow');
  if (!row) return;
  row.innerHTML = '';
  for (const m of Profile.MODES) {
    const owned = Profile.owns(profile, 'mode', m.id);
    const b = document.createElement('button');
    b.className = (m.id === selVariant ? 'sel' : '') + (owned ? '' : ' locked');
    b.title = owned ? m.desc : `${m.desc}  —  ${Profile.fmt(m.price)} coins`;
    b.textContent = owned ? m.name : `🔒 ${m.name}`;
    b.addEventListener('click', () => {
      if (!owned) { window.location.href = 'store.html'; return; }
      selVariant = m.id;
      refreshVariantRow();
    });
    row.appendChild(b);
  }
}
el('modeRow').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.mode === 'online') { openRoomFlow(); return; }
  el('modeRow').querySelectorAll('button').forEach(x => x.classList.remove('sel'));
  b.classList.add('sel'); selMode = b.dataset.mode;
}));
el('countRow').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
  el('countRow').querySelectorAll('button').forEach(x => x.classList.remove('sel'));
  b.classList.add('sel'); selCount = parseInt(b.dataset.count, 10);
}));
el('startBtn').addEventListener('click', startGame);
refreshCoinHud();
refreshVariantRow();
applyTheme();

// arriving from a shared link: prefill the code and join once a name is set
const invite = new URLSearchParams(location.search).get('room');
if (invite) {
  openRoomFlow(invite.toUpperCase().slice(0, 4)).then(() => {
    if (savedName()) el('joinBtn').click();     // returning player, just join
  });
}

// ═══════════════════════════════════════════════════════════
//  ONLINE ROOMS
// ═══════════════════════════════════════════════════════════
const lobby = el('lobby');
let roomCode = null, isHost = false, mySeat = 0;
let lobbySeats = 2, lobbyVariant = 'classic';

const lobbyError = msg => { el('lobbyErr').textContent = msg || ''; };

function showLobby(step) {
  menu.style.display = 'none';
  lobby.style.display = 'flex';
  el('lobbyStart').style.display = step === 'start' ? 'block' : 'none';
  el('lobbyRoom').style.display  = step === 'room'  ? 'block' : 'none';
}

function hideLobby() { lobby.style.display = 'none'; }

function savedName() {
  return localStorage.getItem('uno.name') || '';
}

async function openRoomFlow(prefillCode = '') {
  lobbyError('');
  el('playerName').value = savedName();
  el('joinCode').value = prefillCode;
  showLobby('start');
  try { await Net.connect(); }
  catch { lobbyError('Room server unreachable — start it with: npm start'); }
}

function myName() {
  const n = el('playerName').value.trim().slice(0, 14) || 'Player';
  localStorage.setItem('uno.name', n);
  return n;
}

function renderLobbyRoom(m) {
  roomCode = m.code; isHost = m.isHost; mySeat = m.you;
  el('roomCode').textContent = m.code;
  const link = `${location.origin}${location.pathname}?room=${m.code}`;
  el('roomLink').value = link;

  const list = el('seatList');
  list.innerHTML = '';
  const total = Math.max(m.seats.length, lobbySeats);
  for (let i = 0; i < total; i++) {
    const s = m.seats[i];
    const row = document.createElement('div');
    if (!s) {
      row.className = 'seatrow empty';
      row.innerHTML = `<span class="seatdot"></span><span>Open seat</span><span class="tag">bot if empty</span>`;
    } else {
      row.className = 'seatrow' + (i === 0 ? ' host' : '') + (s.bot ? ' botseat' : '');
      const tag = i === 0 ? 'Host' : s.bot ? 'Bot' : (i === m.you ? 'You' : 'Ready');
      row.innerHTML = `<span class="seatdot"></span><span>${s.name}</span><span class="tag">${tag}</span>`;
    }
    list.appendChild(row);
  }

  el('hostControls').style.display  = m.isHost ? 'block' : 'none';
  el('guestWaiting').style.display  = m.isHost ? 'none'  : 'block';
  if (m.isHost) { lobbyVariant = m.variant; renderLobbyPickers(); }
}

function renderLobbyPickers() {
  const vr = el('lobbyVariantRow');
  vr.innerHTML = '';
  for (const mode of Profile.MODES) {
    const owned = Profile.owns(profile, 'mode', mode.id);
    const b = document.createElement('button');
    b.className = (mode.id === lobbyVariant ? 'sel' : '') + (owned ? '' : ' locked');
    b.textContent = owned ? mode.name : `🔒 ${mode.name}`;
    b.style.fontSize = '0.82rem'; b.style.padding = '9px 14px';
    b.onclick = () => {
      if (!owned) { window.location.href = 'store.html'; return; }
      lobbyVariant = mode.id; Net.setVariant(mode.id); renderLobbyPickers();
    };
    vr.appendChild(b);
  }
  const sr = el('lobbySeatsRow');
  sr.innerHTML = '';
  for (const n of [2, 3, 4]) {
    const b = document.createElement('button');
    b.className = n === lobbySeats ? 'sel' : '';
    b.textContent = n; b.style.minWidth = '52px';
    b.onclick = () => { lobbySeats = n; Net.setSeats(n); renderLobbyPickers(); };
    sr.appendChild(b);
  }
}

/** Swap the local game for a fresh server snapshot. */
function adoptSnapshot(snap) {
  game = makeView(snap);
  return game;
}

async function beginOnlineGame(snap) {
  hideLobby();
  clearBoard();
  profile = Profile.load();
  adoptSnapshot(snap);
  turnOwner = game.current; drawnThisTurn = false; pendingWild = null;
  menu.style.display = 'none'; winScreen.style.display = 'none';
  hud.style.display = 'flex'; controls.classList.remove('hidden');
  const hl = el('homeLink'); if (hl) hl.style.display = 'block';
  const gw = el('gameWallet'); if (gw) gw.style.display = 'inline-flex';
  buildDrawPile();
  applyCosmetics();
  applySeatVisibility();
  refreshCoinHud();
  refreshLabels(); refreshSeatGlow(); updateHUD();
  await dealAnimation();
  await afterMove();
}

// ── server events ──
Net.on('lobby', m => { lobbySeats = Math.max(lobbySeats, m.seats.length); renderLobbyRoom(m); showLobby('room'); });
Net.on('error', m => lobbyError(m.msg));
Net.on('close', () => { if (isOnline()) el('hint').textContent = 'Disconnected from the room server.'; });

Net.on('started', async m => { await beginOnlineGame(m.snapshot); });

Net.on('moved', async m => {
  if (!isOnline()) return;
  const effect = m.effect;
  if (!effect) { adoptSnapshot(m.snapshot); refreshLabels(); updateHUD(); return; }
  const mesh = cardMeshes.get(effect.card.id);
  adoptSnapshot(m.snapshot);
  if (mesh) {
    // an opponent's card arrives face-down and opaque; give it its real face
    // it arrived face-down and opaque, so give it its real face before it flies
    mesh.userData.card = effect.card;
    const f = face(effect.card, game.side);
    mesh.userData.front.material.map = makeFaceTexture(f.color, f.value, game.side);
    mesh.userData.front.material.needsUpdate = true;
    cardMeshes.delete(effect.card.id);
  }
  await animateMove(effect, mesh);
});

Net.on('drew', async m => {
  if (!isOnline()) return;
  adoptSnapshot(m.snapshot);
  drawnThisTurn = game.current === game.you && !!(m.effect && m.effect.playable);
  syncHands({ stagger: 0.06 });
  refreshLabels(); updateHUD();
  await sleep(520);
  if (m.effect && m.effect.playable && game.current === game.you) {
    busy = false; inputLocked = false; markPlayable(); updateHUD();
  } else {
    await afterMove();
  }
});

Net.on('passed', async m => { if (!isOnline()) return; adoptSnapshot(m.snapshot); drawnThisTurn = false; await afterMove(); });
Net.on('ended', async m => { if (!isOnline()) return; adoptSnapshot(m.snapshot); await afterMove(); });

// ── lobby controls ──
el('createBtn').addEventListener('click', async () => {
  lobbyError('');
  try { await Net.connect(); } catch { return lobbyError('Room server unreachable — start it with: npm start'); }
  Net.createRoom(myName(), lobbyVariant, lobbySeats);
});
el('joinBtn').addEventListener('click', async () => {
  const code = el('joinCode').value.trim().toUpperCase();
  if (code.length !== 4) return lobbyError('Enter the 4-character room code');
  lobbyError('');
  try { await Net.connect(); } catch { return lobbyError('Room server unreachable — start it with: npm start'); }
  Net.joinRoom(code, myName());
});
el('startRoomBtn').addEventListener('click', () => Net.startRoom());
el('copyBtn').addEventListener('click', async () => {
  const link = el('roomLink').value;
  try { await navigator.clipboard.writeText(link); el('copyBtn').textContent = 'Copied!'; }
  catch { el('roomLink').select(); el('copyBtn').textContent = 'Select + copy'; }
  setTimeout(() => { el('copyBtn').textContent = 'Copy'; }, 1600);
});
el('lobbyBack').addEventListener('click', () => { hideLobby(); Net.close(); menu.style.display = 'flex'; });
el('leaveBtn').addEventListener('click', () => {
  Net.close(); roomCode = null; hideLobby();
  history.replaceState(null, '', location.pathname);
  menu.style.display = 'flex';
});

function clearBoard() {
  cardMeshes.forEach(m => disposeCard(m)); cardMeshes.clear();
  discardMeshes.forEach(m => disposeCard(m)); discardMeshes = [];
  anims.length = 0;
  fx.forEach(f => { if (f.mesh) { scene.remove(f.mesh); f.mesh.material.dispose(); } });
  fx.length = 0;
  while (labelsGroup.children.length) {
    const c = labelsGroup.children[0]; labelsGroup.remove(c);
    c.material.map.dispose(); c.material.dispose();
  }
}

async function startGame() {
  if (selMode === 'online') { openRoomFlow(); return; }
  clearBoard();
  profile = Profile.load();            // pick up anything bought in the store
  if (!Profile.owns(profile, 'mode', selVariant)) selVariant = 'classic';
  game = new Game(selCount, selMode, selVariant);
  turnOwner = game.current; drawnThisTurn = false; pendingWild = null;
  menu.style.display = 'none'; winScreen.style.display = 'none';
  hud.style.display = 'flex'; controls.classList.remove('hidden');
  const hl = el('homeLink'); if (hl) hl.style.display = 'block';
  const gw = el('gameWallet'); if (gw) gw.style.display = 'inline-flex';
  buildDrawPile();
  applyCosmetics();
  applySeatVisibility();
  refreshCoinHud();
  refreshLabels(); refreshSeatGlow(); updateHUD();
  await dealAnimation();
  await afterMove();
}

function backToMenu() {
  if (isOnline()) { Net.close(); roomCode = null; history.replaceState(null, '', location.pathname); }
  game = null; inputLocked = true; busy = false; clickable = [];
  hud.style.display = 'none'; controls.classList.add('hidden'); winScreen.style.display = 'none';
  const hl = el('homeLink'); if (hl) hl.style.display = 'none';
  const gw = el('gameWallet'); if (gw) gw.style.display = 'none';
  clearBoard();
  profile = Profile.load();
  refreshCoinHud(); refreshVariantRow();
  menu.style.display = 'flex';
}

function showWin() {
  inputLocked = true; clickable = [];
  const me = viewPlayer();
  const won = game.online ? game.winner === game.you
            : game.mode === 'hotseat' ? true
            : game.winner === 0;
  const cardsLeft = (game.hands[me] || []).length;
  const reward = Profile.awardForResult(profile, {
    won, numPlayers: game.numPlayers, variant: game.variant, cardsLeft,
  });
  const wn = game.playerName(game.winner);
  el('winText').textContent = wn === 'You' ? 'You win!' : `${wn} wins!`;
  const r = el('winReward');
  if (r) r.innerHTML = `<span class="coin">🪙</span> +${Profile.fmt(reward)} coins` +
    `<span class="sub">Balance ${Profile.fmt(profile.coins)}</span>`;
  refreshCoinHud();
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
  stepFx(dt);

  // gentle neon breathing on the active seat
  if (game) {
    const active = relSeatOf(game.current);
    if (neonBars[active]) neonBars[active].userData.halo.material.opacity = 0.5 + Math.sin(now / 380) * 0.12;
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
