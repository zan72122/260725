/**
 * index.js — 機械の一覧
 *
 * ここに並べた順番が、画面下（横画面では左）のカードの順番になる。
 * ならびは「まわす → かぜ → とき → おと → みず → ねつ」で、
 * わかりやすい因果から、じわじわ時間がかかるものへ進む。
 */

import { Flashlight } from './flashlight.js';
import { Fan } from './fan.js';
import { Clock } from './clock.js';
import { MusicBox } from './musicbox.js';
import { Pump } from './pump.js';
import { Toaster } from './toaster.js';

export const MACHINES = [Flashlight, Fan, Clock, MusicBox, Pump, Toaster];

export const MACHINE_BY_ID = new Map(MACHINES.map((M) => [M.meta.id, M]));
