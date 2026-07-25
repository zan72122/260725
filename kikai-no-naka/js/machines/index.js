/**
 * index.js — 機械の一覧
 *
 * ここに並べた順番が、画面下（横画面では左）のカードの順番になる。
 * まずは因果が一目で分かるものから、だんだん「しくみが隠れている」ものへ進む。
 *
 *   まわす → かぜ → とき → おと → みず → ねつ
 *   → けずる → ぬう → はかる → あげる → あける → ころがる
 *   → たたく → はしる → こぐ → うつす → まぜる → のぼる
 */

import { Flashlight } from './flashlight.js';
import { Fan } from './fan.js';
import { Clock } from './clock.js';
import { MusicBox } from './musicbox.js';
import { Pump } from './pump.js';
import { Toaster } from './toaster.js';
import { Sharpener } from './sharpener.js';
import { Sewing } from './sewing.js';
import { Scale } from './scale.js';
import { Lift } from './lift.js';
import { Lock } from './lock.js';
import { Gacha } from './gacha.js';
import { Piano } from './piano.js';
import { Train } from './train.js';
import { Bicycle } from './bicycle.js';
import { Camera } from './camera.js';
import { Beater } from './beater.js';
import { Escalator } from './escalator.js';

export const MACHINES = [
  Flashlight,
  Fan,
  Clock,
  MusicBox,
  Pump,
  Toaster,
  Sharpener,
  Sewing,
  Scale,
  Lift,
  Lock,
  Gacha,
  Piano,
  Train,
  Bicycle,
  Camera,
  Beater,
  Escalator,
];

export const MACHINE_BY_ID = new Map(MACHINES.map((M) => [M.meta.id, M]));
