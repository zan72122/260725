/* ============================================================================
 * activities/index.js — activity registry
 * ----------------------------------------------------------------------------
 * Single source of truth for which activities exist, and the mood + camera
 * each one opens with. Owned centrally so the five activity modules can be
 * developed independently without fighting over this file.
 * ========================================================================== */

import { FeedActivity } from './feed.js';
import { BathActivity } from './bath.js';
import { DressActivity } from './dress.js';
import { PlayActivity } from './play.js';
import { SleepActivity } from './sleep.js';

export const ACTIVITIES = {
  feed: {
    Class: FeedActivity,
    mood: 'golden',
    camera: 'table',
    label: 'ごはん',
    icon: 'bottle',
    meter: 'food'
  },
  bath: {
    Class: BathActivity,
    mood: 'evening',
    camera: 'tub',
    label: 'おふろ',
    icon: 'tub',
    meter: 'clean'
  },
  dress: {
    Class: DressActivity,
    mood: 'day',
    camera: 'closeup',
    label: 'きせかえ',
    icon: 'onesie',
    meter: null
  },
  play: {
    Class: PlayActivity,
    mood: 'golden',
    camera: 'floor',
    label: 'あそぶ',
    icon: 'balloon',
    meter: 'happy'
  },
  sleep: {
    Class: SleepActivity,
    mood: 'night',
    camera: 'crib',
    label: 'ねんね',
    icon: 'moon',
    meter: 'energy'
  }
};

export const ACTIVITY_ORDER = ['feed', 'bath', 'dress', 'play', 'sleep'];
