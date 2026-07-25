/**
 * piano.js — ピアノ
 *
 * 「おした指から はなれて、ハンマーだけが とんでいく」しくみ
 * （エスケープメント）を見せる機械。
 *
 *   けんばん を おす
 *     → てこ の おしり が 上がる
 *     → ウィッペン が 持ち上がり、ジャック が ハンマーを つき上げる
 *     → 上まで 行くと ジャックの つま先が レールに あたって、すべって はずれる（← ここ）
 *     → ハンマーは そこから 自由に とんで 弦を たたき、はねかえる
 *     → 指を 押さえたままでも、ハンマーは 弦に くっついたままにならない
 *   同時に、けんばんの おしり が ダンパー（弦を おさえる フェルト）を もち上げる。
 *   指を はなすと ダンパーが 弦に もどり、音が ぴたっと 止まる。
 *
 * さわりどころ:
 *   - けんばんを おす。何本の指でも 同時に おせる
 *   - ペダルを ふむと ダンパーが 全部 上がったままになり、音が のこる
 *   - ハンマーを 指で なでると、なでた順に ぱらぱらと 鳴る
 *   - ふたを 回すと 開き ぐあいが 変わり、音の こもりかたが 変わる
 */

import * as THREE from 'three';
import { Machine, group, hitProxy, hitSphere, mesh, stretchBetween } from './base.js';
import * as G from '../lib/geometry.js';
import { setShellDissolve } from '../lib/xray.js';
import { clamp, clamp01, damp, lerp, TAU } from '../lib/math.js';

/** けんばん 7 まい（ド〜シ） */
const KEYS = 7;
const KEY_W = 0.0148;
const KEY_GAP = 0.0018;

/* --- 高さ（下から） --- */
const LEG_TOP = 0.0200;
const CASE_TOP = 0.0530;
const KEYBED_Y = 0.0295;
const WIPPEN_Y = 0.0372;
const HAMMER_Y = 0.0410;
const STRING_Y = 0.0602;

/* --- 前後（手前が +Z） --- */
const KEY_TIP_Z = 0.0560;
const CASE_FRONT_Z = 0.0300;
const BALANCE_Z = 0.0215;
const CAPSTAN_Z = -0.0040;
const WIPPEN_Z = 0.0010;
const HAMMER_Z = -0.0250;
const CASE_BACK_Z = -0.0490;
const STRING_FRONT_Z = 0.0120;
const STRING_BACK_Z = -0.0440;

/** ハンマーの 棒の長さ */
const SHANK = 0.0220;
/** ハンマーが 弦に とどく角度 */
const HIT_ANGLE = 1.06;
/** ジャックが はずれる角度（ここから先は 自由飛行） */
const LETOFF_ANGLE = 0.88;
/** けんばんが 沈む深さ */
const DIP = 0.0068;

/** ドレミファソラシ（C5 から） */
const FREQS = [523.25, 587.33, 659.25, 698.46, 783.99, 880.0, 987.77];
const KEY_NAMES = ['ド', 'レ', 'ミ', 'ファ', 'ソ', 'ラ', 'シ'];
/** 黒けんを はさむ すきま（ドレ / レミ の あいだ など） */
const BLACK_AT = [0, 1, 3, 4, 5];

export class Piano extends Machine {
  static meta = {
    id: 'piano',
    name: 'ピアノ',
    sub: 'ゆびから はなれて とぶ',
    accent: 0x8f6ad0,
    backdrop: {
      top: '#f8f3fc',
      middle: '#eae0f6',
      bottom: '#cbb8e2',
      glow: '#ecdcff',
      glowStrength: 0.15,
    },
    bloom: { strength: 0.28, radius: 0.5, threshold: 1.05 },
    icon: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M5 20h38v14a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V20Z" fill="#f7f2ea" stroke="#5c4a7a" stroke-width="2.4"/>
      <path d="M13 20v17M21 20v17M29 20v17M37 20v17" stroke="#5c4a7a" stroke-width="1.8"/>
      <rect x="10" y="20" width="5" height="10" rx="1.4" fill="#4a3a63"/>
      <rect x="18" y="20" width="5" height="10" rx="1.4" fill="#4a3a63"/>
      <rect x="33" y="20" width="5" height="10" rx="1.4" fill="#4a3a63"/>
      <path d="M6 20 12 9h28l3 11" fill="#8f6ad0" stroke="#5c4a7a" stroke-width="2.4" stroke-linejoin="round"/>
    </svg>`,
  };

  constructor(ctx) {
    super(ctx);

    /**
     * けんばん 1 本ぶんの状態。
     *   dip    : 沈み 0..1
     *   held   : 指が のっているか
     *   hAngle : ハンマーの角度（0 = 休み、HIT_ANGLE = 弦）
     *   hVel   : ハンマーの角速度
     *   free   : ジャックが はずれて 自由飛行中か
     *   ring   : 弦の 鳴っている量 0..1
     *   damper : ダンパーの もち上がり 0..1
     */
    this.keys = [];
    for (let i = 0; i < KEYS; i++) {
      this.keys.push({
        i, dip: 0, held: false, hAngle: 0, hVel: 0, free: false,
        ring: 0, phase: Math.random() * TAU, damper: 0, lastDip: 0, hitCool: 0,
      });
    }
    this.pedal = 0;
    this.pedalHeld = false;
    this.lidOpen = 0.62;

    this.radius = 0.096;
    this.center = new THREE.Vector3(0, 0.042, -0.002);
    this.footprint = { w: 0.135, d: 0.115, opacity: 0.30 };
  }

  /* ---------------------------------------------------------------- */

  build() {
    const M = this.M;
    setShellDissolve({
      dir: new THREE.Vector3(-0.14, -0.30, -1.0),
      center: this.center,
      span: 0.112,
      noiseScale: 13,
    });

    this.mats = {
      caseSide: M.shell('paint', { color: 0x7c5cb4, roughness: 0.20, clearcoat: 1.0 }),
      caseDeep: M.shell('paint', { color: 0x533f80, roughness: 0.26, clearcoat: 0.8 }),
      lid: M.shell('paint', { color: 0x8f6ad0, roughness: 0.18, clearcoat: 1.0 }),
      keySlip: M.shell('paint', { color: 0xf3ecff, roughness: 0.30 }),

      keyWhite: M.part('plastic', { color: 0xfff9ee, roughness: 0.26, clearcoat: 0.6 }),
      keyBlack: M.part('plastic', { color: 0x362c4e, roughness: 0.24, clearcoat: 0.7 }),
      lever: M.part('wood', { seed: 22, light: '#dcc08a', dark: '#a5814c' }),
      action: M.part('coated', { color: 0xc9bda3, roughness: 0.5 }),
      jack: M.part('coated', { color: 0xdc9a3e, roughness: 0.40 }),
      shank: M.part('coated', { color: 0xe3c893, roughness: 0.46 }),
      felt: M.part('fabric', { color: 0xc4737f }),
      feltDamp: M.part('fabric', { color: 0x7f9fc4 }),
      board: M.part('wood', { seed: 33, light: '#e5c48d', dark: '#b58a4e' }),
      string: M.part('steel', { color: 0xe2e9f0, roughness: 0.13 }),
      stringWound: M.part('copper', { color: 0xc9834f }),
      plate: M.part('brass', { color: 0xd7a93f }),
      pin: M.part('steel', { color: 0xc3ccd5, roughness: 0.2 }),
      pedal: M.part('brass', { color: 0xe2ba5c }),
      rod: M.part('steel', { color: 0xd2d9e0, roughness: 0.2 }),
      leg: M.part('paint', { color: 0x533f80, roughness: 0.26 }),
      rubber: M.plain('rubber'),
    };

    this._buildCase();
    this._buildSoundboard();
    this._buildKeys();
    this._buildAction();
    this._buildPedal();

    this.setXray(0);
  }

  _keyX(i) {
    return (i - (KEYS - 1) / 2) * (KEY_W + KEY_GAP);
  }

  /* --- 胴とふた --------------------------------------------------------- */

  _buildCase() {
    const g = group({ name: 'case' });

    const W = 0.1240;
    const D = CASE_FRONT_Z - CASE_BACK_Z;
    const CZ = (CASE_FRONT_Z + CASE_BACK_Z) / 2;
    const H = CASE_TOP - LEG_TOP;
    const CY = (CASE_TOP + LEG_TOP) / 2;
    const wall = 0.0060;

    // 左右のほお
    for (const sx of [-1, 1]) {
      mesh(new G.RoundedBoxGeometry(wall, H, D, 3, 0.0026), this.mats.caseSide, {
        parent: g, pos: [sx * (W / 2 - wall / 2), CY, CZ],
      });
    }
    // 奥
    mesh(new G.RoundedBoxGeometry(W, H, wall, 3, 0.0026), this.mats.caseSide, {
      parent: g, pos: [0, CY, CASE_BACK_Z + wall / 2],
    });
    // 手前（けんばんの 上をふさぐ 板 = ここが すけると アクションが見える）
    mesh(new G.RoundedBoxGeometry(W, CASE_TOP - KEYBED_Y - 0.0020, wall, 3, 0.0024), this.mats.caseSide, {
      parent: g, pos: [0, (CASE_TOP + KEYBED_Y) / 2 + 0.0010, CASE_FRONT_Z - wall / 2],
    });
    // けんばんの 下の 前板
    mesh(new G.RoundedBoxGeometry(W, KEYBED_Y - LEG_TOP, wall, 3, 0.0024), this.mats.caseDeep, {
      parent: g, pos: [0, (KEYBED_Y + LEG_TOP) / 2, CASE_FRONT_Z - wall / 2],
    });
    // 底（けんばんの 台）
    mesh(new G.RoundedBoxGeometry(W - 0.0020, 0.0044, D - 0.0020, 3, 0.0016), this.mats.caseDeep, {
      parent: g, pos: [0, LEG_TOP + 0.0022, CZ],
    });
    // けんばんの 前に 出る 台（けんばんが 乗る 棚）
    mesh(new G.RoundedBoxGeometry(W, 0.0044, KEY_TIP_Z - CASE_FRONT_Z + 0.0080, 3, 0.0016), this.mats.caseDeep, {
      parent: g, pos: [0, KEYBED_Y - 0.0034, (KEY_TIP_Z + CASE_FRONT_Z) / 2 + 0.0020],
    });
    // 前の ふち（けんばんより 少し 下。けんばんの 手前が 見えるように）
    mesh(new G.RoundedBoxGeometry(W, 0.0060, 0.0064, 3, 0.0022), this.mats.keySlip, {
      parent: g, pos: [0, KEYBED_Y - 0.0058, KEY_TIP_Z + 0.0046],
    });

    // 足（3本）
    for (const [lx, lz] of [[-0.050, 0.018], [0.050, 0.018], [0, -0.038]]) {
      mesh(
        G.lathe(
          [
            [0, 0], [0.0072, 0], [0.0070, 0.0022], [0.0044, 0.0040],
            [0.0038, 0.0130], [0.0052, 0.0164], [0.0050, LEG_TOP],
            [0, LEG_TOP],
          ],
          { segments: 20, center: false },
        ),
        this.mats.leg,
        { parent: g, pos: [lx, 0, lz] },
      );
    }

    // ふた（後ろの ふちで ちょうつがい）
    const lid = group({ parent: g, pos: [0, CASE_TOP, CASE_BACK_Z + wall] });
    this.lidGroup = lid;
    mesh(new G.RoundedBoxGeometry(W, 0.0058, D - 0.0020, 3, 0.0026), this.mats.lid, {
      parent: lid, pos: [0, 0.0029, (D - 0.0020) / 2],
    });
    lid.rotation.x = -this.lidOpen;

    // つっかえ棒（胴の ふちと ふたの 裏を つなぐ。長さは 毎フレーム 張り直す）
    this.propMesh = mesh(G.chamferedCylinder(0.0016, 1.0, 0.0003, 8), this.mats.plate, {
      parent: this.root, cast: false,
    });
    this.propFoot = new THREE.Vector3(W / 2 - 0.0150, CASE_TOP, CASE_BACK_Z + 0.0300);
    // ふたの 裏の 受け（ちょうつがいから この距離）
    this.propHead = new THREE.Vector3();
    this.propAt = 0.0420;


    hitProxy(lid, new THREE.BoxGeometry(0.10, 0.014, D * 0.7), { pos: [0, 0.003, D * 0.45] });
    this.handle({
      id: 'lid',
      label: 'ふた',
      type: 'rotate',
      object: lid,
      axisObject: this.root,
      axis: new THREE.Vector3(1, 0, 0),
      pivot: lid,
      gain: 0.6,
      onRotate: (d) => {
        this.lidOpen = clamp(this.lidOpen - d, 0.04, 1.30);
      },
    });

    this.addShell(g);
  }

  /* --- 響板・フレーム・弦 ----------------------------------------------- */

  _buildSoundboard() {
    const g = group({ name: 'soundboard' });
    this.root.add(g);

    const W = 0.1240;

    // 響板は 弦の 下 いっぱいには 張らない。
    // ハンマーが 下から 上がってくる 通り道を あけておく必要があるので、
    // 奥の いちばん端だけに 置く（本物も、ハンマーの ところは 開いている）。
    mesh(G.roundedPlate(W - 0.0180, 0.0130, 0.0024, 0.0040, { bevel: 0.0006 }),
      this.mats.board,
      { parent: g, pos: [0, STRING_Y - 0.0060, STRING_BACK_Z + 0.0020], rot: [Math.PI / 2, 0, 0], cast: false });

    // 鋳物フレーム（弦を 張る 前後の 台）
    for (const z of [STRING_FRONT_Z, STRING_BACK_Z]) {
      mesh(new G.RoundedBoxGeometry(W - 0.0140, 0.0064, 0.0090, 2, 0.0022), this.mats.plate, {
        parent: g, pos: [0, STRING_Y - 0.0044, z], cast: false,
      });
    }
    // フレームの すじかい（弦のあいだを 通る 2本）
    for (const sx of [-1, 1]) {
      mesh(new G.RoundedBoxGeometry(0.0044, 0.0040, STRING_FRONT_Z - STRING_BACK_Z, 2, 0.0014), this.mats.plate, {
        parent: g, pos: [sx * 0.0455, STRING_Y - 0.0032, (STRING_FRONT_Z + STRING_BACK_Z) / 2], cast: false,
      });
    }

    // 弦
    this.stringMeshes = [];
    const len = STRING_FRONT_Z - STRING_BACK_Z;
    for (let i = 0; i < KEYS; i++) {
      const x = this._keyX(i);
      const low = i < 2;
      const s = mesh(G.chamferedCylinder(low ? 0.0011 : 0.0008, len, 0.0002, 8),
        low ? this.mats.stringWound : this.mats.string,
        {
          parent: g,
          pos: [x, STRING_Y, (STRING_FRONT_Z + STRING_BACK_Z) / 2],
          rot: [Math.PI / 2, 0, 0], cast: false, receive: false,
        });
      this.stringMeshes.push(s);

      // チューニングピン（フレームに 低く 埋まっている）
      mesh(G.chamferedCylinder(0.0015, 0.0038, 0.0004, 10), this.mats.pin, {
        parent: g, pos: [x, STRING_Y + 0.0012, STRING_FRONT_Z], cast: false,
      });
    }

    /* ダンパー: ハンマーより 奥で 弦を おさえる。
       けんばんの しっぽが てこを 押し上げると、針金ごと 持ち上がる。 */
    this.damperGroups = [];
    this.damperLevers = [];
    const DAMP_Z = HAMMER_Z - 0.0105;
    for (let i = 0; i < KEYS; i++) {
      const x = this._keyX(i);

      const dg = group({ parent: g, pos: [x, STRING_Y + 0.0012, DAMP_Z] });
      this.damperGroups.push(dg);
      mesh(new G.RoundedBoxGeometry(0.0086, 0.0040, 0.0060, 2, 0.0013), this.mats.feltDamp, {
        parent: dg, pos: [0, 0.0020, 0], cast: false,
      });
      // 針金
      mesh(G.chamferedCylinder(0.0006, 0.0180, 0.0001, 6), this.mats.rod, {
        parent: dg, pos: [0, -0.0090, 0], cast: false,
      });

      // てこ（奥で 支えられ、手前の 先が けんばんの しっぽに のっている）
      const lv = group({ parent: this.root, pos: [x, 0.0352, DAMP_Z - 0.0040] });
      this.damperLevers.push(lv);
      const lvLen = DAMP_Z - 0.0040 - (CAPSTAN_Z - 0.0080);
      mesh(new G.RoundedBoxGeometry(KEY_W * 0.34, 0.0022, Math.abs(lvLen), 1, 0.0008), this.mats.action, {
        parent: lv, pos: [0, 0, Math.abs(lvLen) / 2], cast: false,
      });
    }
  }

  /* --- けんばん ---------------------------------------------------------- */

  _buildKeys() {
    const g = group({ name: 'keys' });
    this.root.add(g);

    // 支点の レール（バランスレール）
    mesh(new G.RoundedBoxGeometry(0.1160, 0.0044, 0.0064, 2, 0.0016), this.mats.action, {
      parent: g, pos: [0, KEYBED_Y - 0.0034, BALANCE_Z], cast: false,
    });

    const frontLen = KEY_TIP_Z - BALANCE_Z;
    const backLen = BALANCE_Z - (CAPSTAN_Z - 0.0090);

    this.keyGroups = [];
    for (let i = 0; i < KEYS; i++) {
      const x = this._keyX(i);
      const kg = group({ parent: g, pos: [x, KEYBED_Y, BALANCE_Z] });
      this.keyGroups.push(kg);

      // 手前（さわるところ）
      mesh(new G.RoundedBoxGeometry(KEY_W, 0.0068, frontLen, 3, 0.0020), this.mats.keyWhite, {
        parent: kg, pos: [0, 0, frontLen / 2],
      });
      // 奥（てこ の おしり）
      mesh(new G.RoundedBoxGeometry(KEY_W * 0.70, 0.0054, backLen, 2, 0.0016), this.mats.lever, {
        parent: kg, pos: [0, 0, -backLen / 2], cast: false,
      });
      // キャプスタン（ここが ウィッペンを おす）
      mesh(
        G.lathe([[0, 0], [0.0024, 0], [0.0026, 0.0016], [0.0013, 0.0026], [0, 0.0028]], { segments: 12, center: false }),
        this.mats.jack,
        { parent: kg, pos: [0, 0.0027, CAPSTAN_Z - BALANCE_Z], cast: false },
      );
      // 支点のピン
      mesh(G.chamferedCylinder(0.0009, KEY_W * 0.92, 0.0002, 8), this.mats.pin, {
        parent: kg, rot: [0, 0, Math.PI / 2], cast: false,
      });
      // ダンパーを もち上げる しっぽ
      mesh(new G.RoundedBoxGeometry(KEY_W * 0.5, 0.0026, 0.0080, 1, 0.0009), this.mats.action, {
        parent: kg, pos: [0, 0.0034, -backLen + 0.0040], cast: false,
      });

      hitProxy(kg, new THREE.BoxGeometry(KEY_W + KEY_GAP, 0.018, frontLen * 0.92), {
        pos: [0, 0.002, frontLen * 0.56],
      });
      const st = this.keys[i];
      this.handle({
        id: `key${i}`,
        label: KEY_NAMES[i],
        type: 'press',
        object: kg,
        primary: i === 2,
        hint: i === 2 ? { kind: 'push', offset: [0, 0.018, 0.020], size: 0.011 } : undefined,
        onPress: () => {
          st.held = true;
        },
        onRelease: () => {
          st.held = false;
        },
      });
    }

    // 黒けん（かざり。白けんの すきまの 上）
    for (const i of BLACK_AT) {
      const x = this._keyX(i) + (KEY_W + KEY_GAP) / 2;
      mesh(new G.RoundedBoxGeometry(KEY_W * 0.56, 0.0080, frontLen * 0.62, 2, 0.0016), this.mats.keyBlack, {
        parent: g, pos: [x, KEYBED_Y + 0.0068, BALANCE_Z + frontLen * 0.34], cast: false,
      });
    }
  }

  /* --- アクション（ウィッペン・ジャック・ハンマー） ---------------------- */

  _buildAction() {
    const g = group({ name: 'action' });
    this.root.add(g);

    // ハンマーの 支点レール
    mesh(new G.RoundedBoxGeometry(0.1160, 0.0056, 0.0068, 2, 0.0020), this.mats.action, {
      parent: g, pos: [0, HAMMER_Y, HAMMER_Z], cast: false,
    });
    // ウィッペンの 支点レール
    mesh(new G.RoundedBoxGeometry(0.1160, 0.0044, 0.0056, 2, 0.0016), this.mats.action, {
      parent: g, pos: [0, WIPPEN_Y, WIPPEN_Z], cast: false,
    });
    // レットオフ レール（ジャックの つま先が ここに あたって はずれる）
    mesh(new G.RoundedBoxGeometry(0.1160, 0.0036, 0.0040, 2, 0.0012), this.mats.jack, {
      parent: g, pos: [0, WIPPEN_Y + 0.0088, WIPPEN_Z - 0.0086], cast: false,
    });

    this.hammerGroups = [];
    this.jackGroups = [];
    this.wippenGroups = [];

    for (let i = 0; i < KEYS; i++) {
      const x = this._keyX(i);

      /* ウィッペン: キャプスタンに おされて 上がる てこ */
      const wg = group({ parent: g, pos: [x, WIPPEN_Y, WIPPEN_Z] });
      this.wippenGroups.push(wg);
      const wLen = WIPPEN_Z - CAPSTAN_Z;
      mesh(new G.RoundedBoxGeometry(KEY_W * 0.60, 0.0030, wLen + 0.0060, 2, 0.0011), this.mats.lever, {
        parent: wg, pos: [0, 0, (wLen + 0.0060) / 2 - 0.0030], cast: false,
      });
      mesh(G.chamferedCylinder(0.0008, KEY_W * 0.72, 0.0002, 8), this.mats.pin, {
        parent: wg, rot: [0, 0, Math.PI / 2], cast: false,
      });

      /* ジャック: L 字。長い腕が ハンマーを つき、つま先が レールに あたる */
      const jg = group({ parent: wg, pos: [0, 0.0016, -0.0026] });
      this.jackGroups.push(jg);
      mesh(new G.RoundedBoxGeometry(KEY_W * 0.40, 0.0110, 0.0028, 2, 0.0009), this.mats.jack, {
        parent: jg, pos: [0, 0.0055, 0], cast: false,
      });
      mesh(new G.RoundedBoxGeometry(KEY_W * 0.40, 0.0026, 0.0068, 2, 0.0009), this.mats.jack, {
        parent: jg, pos: [0, 0.0014, -0.0042], cast: false,
      });

      /* ハンマー: 支点から 前へ のびて、上へ ふり上がる */
      const hg = group({ parent: g, pos: [x, HAMMER_Y, HAMMER_Z] });
      this.hammerGroups.push(hg);
      mesh(G.chamferedCylinder(0.0010, KEY_W * 0.84, 0.0002, 8), this.mats.pin, {
        parent: hg, rot: [0, 0, Math.PI / 2], cast: false,
      });
      // バット（ジャックに つき上げられる ところ）
      mesh(new G.RoundedBoxGeometry(KEY_W * 0.44, 0.0064, 0.0080, 2, 0.0018), this.mats.shank, {
        parent: hg, pos: [0, 0, 0.0040], cast: false,
      });
      // シャンク（+Z へ のびる 棒）
      mesh(G.chamferedCylinder(0.0011, SHANK - 0.0040, 0.0002, 8), this.mats.shank, {
        parent: hg, pos: [0, 0, (SHANK - 0.0040) / 2 + 0.0030], rot: [Math.PI / 2, 0, 0], cast: false,
      });
      // ハンマーヘッド（フェルト。+Z の 先で 上を向く）
      const head = mesh(
        G.lathe(
          [
            [0, 0], [0.0031, 0.0004], [0.0040, 0.0028],
            [0.0036, 0.0068], [0.0019, 0.0086], [0, 0.0088],
          ],
          { segments: 18, center: false },
        ),
        this.mats.felt,
        { parent: hg, pos: [0, 0, SHANK], cast: false },
      );
      head.name = 'head';

      hitSphere(hg, 0.0092, [0, 0.0030, SHANK]);
      const st = this.keys[i];
      // 指で なでると 順に とんでいく
      this.handle({
        id: `hammer${i}`,
        label: 'ハンマー',
        type: 'pluck',
        object: hg,
        onPluck: () => {
          st.free = true;
          st.hVel = Math.max(st.hVel, 5.6);
        },
      });
    }
  }

  /* --- ペダル ------------------------------------------------------------ */

  _buildPedal() {
    const g = group({ name: 'pedal', pos: [0, 0.0090, 0.0180] });
    this.root.add(g);
    this.pedalGroup = g;

    mesh(
      G.extrudeOutline(
        [
          new THREE.Vector2(-0.0088, -0.0020),
          new THREE.Vector2(0.0088, -0.0020),
          new THREE.Vector2(0.0088, 0.0020),
          new THREE.Vector2(-0.0088, 0.0020),
        ],
        [],
        0.0038,
        { corner: 0.0019, bevel: 0.0006 },
      ),
      this.mats.pedal,
      { parent: g, rot: [Math.PI / 2, 0, 0], cast: false },
    );
    // ダンパーへ つながる ささえ棒
    mesh(G.chamferedCylinder(0.0013, 0.0180, 0.0002, 8), this.mats.rod, {
      parent: g, pos: [0, 0.0090, -0.0050], cast: false,
    });

    hitProxy(g, new THREE.BoxGeometry(0.026, 0.016, 0.016));
    this.handle({
      id: 'pedal',
      label: 'ペダル',
      type: 'press',
      object: g,
      hint: { kind: 'push', offset: [0, 0.014, 0.012], size: 0.010 },
      onPress: () => {
        this.pedalHeld = true;
        this.audio.click({ gain: 0.24, bright: 620 });
      },
      onRelease: () => {
        this.pedalHeld = false;
        this.audio.click({ gain: 0.18, bright: 460 });
      },
    });
  }

  /* ---------------------------------------------------------------- */
  /* シミュレーション                                                  */
  /* ---------------------------------------------------------------- */

  step(dt) {
    this.pedal = damp(this.pedal, this.pedalHeld ? 1 : 0, 18, dt);

    for (const k of this.keys) {
      k.hitCool = Math.max(0, k.hitCool - dt);

      /* --- けんばんの 沈み ------------------------------------------ */
      if (k.held) k.dip = Math.min(1, k.dip + 7.0 * dt);
      else k.dip = damp(k.dip, 0, 20, dt);
      const dipRate = (k.dip - k.lastDip) / Math.max(dt, 1e-5);
      k.lastDip = k.dip;

      /* --- ジャックが ハンマーを つき上げる -------------------------- */
      // ジャックに 乗っているあいだは、けんばんの 沈みが そのまま 角度になる
      const driven = k.dip * (LETOFF_ANGLE + 0.05);

      if (!k.free) {
        if (driven >= LETOFF_ANGLE) {
          // ここで ジャックの つま先が レールに あたり、すべって はずれる
          // = エスケープメント。指の力は もう ハンマーに 伝わらない。
          k.free = true;
          k.hVel = clamp(2.4 + Math.abs(dipRate) * 1.3, 2.4, 9.5);
        } else {
          const prev = k.hAngle;
          k.hAngle = driven;
          k.hVel = (k.hAngle - prev) / Math.max(dt, 1e-5);
        }
      }

      if (k.free) {
        // 自由飛行: 重力で もどってくる
        k.hVel -= 26 * dt;
        k.hAngle += k.hVel * dt;

        if (k.hAngle >= HIT_ANGLE && k.hVel > 0 && k.hitCool <= 0) {
          this._strike(k, clamp01(k.hVel / 9));
          k.hAngle = HIT_ANGLE;
          k.hVel = -k.hVel * 0.42; // 弦で はねかえる
          k.hitCool = 0.030;
        }
        // ジャックに 受け止められる高さ まで もどったら 終わり
        const rest = Math.min(driven, LETOFF_ANGLE);
        if (k.hAngle <= rest) {
          k.hAngle = rest;
          k.hVel = 0;
          if (k.dip < 0.55) k.free = false; // けんばんが 戻ると ジャックも 元へ
        }
      }
      k.hAngle = clamp(k.hAngle, 0, HIT_ANGLE);

      /* --- ダンパー -------------------------------------------------- */
      const lift = Math.max(this.pedal, clamp01((k.dip - 0.20) / 0.28));
      k.damper = damp(k.damper, lift, 24, dt);

      /* --- 弦の 鳴り -------------------------------------------------- */
      // ダンパーが 下りていると 一瞬で止まる。上がっていると ながく のこる。
      const decay = lerp(11.0, 0.85, k.damper);
      k.ring = Math.max(0, k.ring - k.ring * decay * dt - 0.02 * dt);
      k.phase += dt * 26;
    }
  }

  _strike(k, v) {
    const open = Math.max(this.pedal, k.damper);
    this.audio.musicNote(FREQS[k.i], {
      gain: 0.10 + v * 0.26,
      decay: lerp(0.30, 3.0, open) * lerp(0.55, 1.0, clamp01(this.lidOpen / 1.1)),
      brightness: (0.7 + v * 0.9) * lerp(0.6, 1.0, clamp01(this.lidOpen / 1.1)),
    });
    k.ring = Math.min(1, k.ring + 0.45 + v * 0.55);
    this.onPop?.();
  }

  lateUpdate(dt) {
    for (let i = 0; i < KEYS; i++) {
      const k = this.keys[i];

      // けんばんは 支点で シーソー（手前が 沈むと 奥が 上がる）
      this.keyGroups[i].rotation.x = (k.dip * DIP) / (KEY_TIP_Z - BALANCE_Z);

      // ウィッペンは キャプスタンに つき上げられる
      this.wippenGroups[i].rotation.x = k.dip * 0.34;
      // ジャックは はずれると 後ろへ にげる
      this.jackGroups[i].rotation.x = damp(this.jackGroups[i].rotation.x, k.free ? 0.44 : 0, 40, dt);

      // ハンマー（+Z の 棒を 上へ ふり上げる）
      this.hammerGroups[i].rotation.x = -k.hAngle;

      // ダンパー（てこ ごと 持ち上がる）
      this.damperGroups[i].position.y = STRING_Y + 0.0012 + k.damper * 0.0058;
      this.damperLevers[i].rotation.x = -k.damper * 0.16;

      // 弦の ゆれ
      const amp = k.ring * 0.0012;
      this.stringMeshes[i].position.y = STRING_Y + Math.sin(k.phase) * amp;
      this.stringMeshes[i].scale.x = 1 + k.ring * 0.6;
    }

    this.lidGroup.rotation.x = damp(this.lidGroup.rotation.x, -this.lidOpen, 12, dt);
    // つっかえ棒: ふたの 裏の 一点と、胴の ふちを つなぐ
    this.propHead.set(this.propFoot.x, 0, this.propAt);
    this.lidGroup.localToWorld(this.propHead);
    this.root.worldToLocal(this.propHead);
    stretchBetween(this.propMesh, this.propFoot, this.propHead);
    this.pedalGroup.rotation.x = damp(this.pedalGroup.rotation.x, this.pedal * 0.28, 20, dt);
  }

  /* ---------------------------------------------------------------- */

  meters() {
    let ring = 0;
    for (const k of this.keys) ring = Math.max(ring, k.ring);
    return [
      { id: 'sound', icon: 'note', label: 'おと', value: ring, color: '#8f6ad0' },
      { id: 'damper', icon: 'spring', label: 'ひびき', value: this.pedal, color: '#d45a72' },
    ];
  }

  reset() {
    for (const k of this.keys) {
      k.dip = 0; k.held = false; k.hAngle = 0; k.hVel = 0;
      k.free = false; k.ring = 0; k.damper = 0; k.lastDip = 0;
    }
    this.pedal = 0;
    this.pedalHeld = false;
    this.lidOpen = 0.62;
  }
}
