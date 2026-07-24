/**
 * ui.js — 画面まわり（DOM）
 *
 * 4歳児が迷わないための決まりごと:
 *   - 文字は最小限。読めなくても分かる絵と色で伝える。
 *   - ボタンは指より大きく（最低 64px）、間隔もたっぷり取る。
 *   - 失敗できる操作を置かない。全部いつでも押せる。
 *   - 縦持ちでも横持ちでも、機械が UI に隠れない位置に来るようにする。
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/* ------------------------------------------------------------------ */
/* アイコン                                                            */
/* ------------------------------------------------------------------ */

export const ICONS = {
  bolt: `<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill="currentColor"/>`,
  bulb: `<path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4.9 1 .9 1.7V17h5.2v-1.4c0-.7.3-1.3.9-1.7A6 6 0 0 0 12 3Z" fill="currentColor"/><rect x="9.4" y="18.4" width="5.2" height="1.8" rx=".9" fill="currentColor"/><rect x="10" y="21" width="4" height="1.6" rx=".8" fill="currentColor"/>`,
  fan: `<path d="M12 12c0-4 1-8 4-8s3 5 0 6.6C13.5 11.8 12 12 12 12Zm0 0c4 0 8 1 8 4s-5 3-6.6 0C12.2 13.5 12 12 12 12Zm0 0c0 4-1 8-4 8s-3-5 0-6.6C10.5 12.2 12 12 12 12Zm0 0c-4 0-8-1-8-4s5-3 6.6 0C11.8 10.5 12 12 12 12Z" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/>`,
  heat: `<path d="M12 2c1.6 3 .4 4.4-.6 5.7C10.2 9.2 9 10.6 9 13a3 3 0 0 0 6 0c0-1.4-.6-2.3-1-3.2.9.5 1.8 1.6 2.3 2.6.4-.9.7-1.9.7-2.9 0-3.4-2.4-6-5-7.5Z" fill="currentColor"/>`,
  drop: `<path d="M12 3c3.6 4.3 6 7.3 6 10a6 6 0 0 1-12 0c0-2.7 2.4-5.7 6-10Z" fill="currentColor"/>`,
  note: `<path d="M9 18.2a2.6 2.6 0 1 1-1.8-2.5V6.6l10-2.4v9.6a2.6 2.6 0 1 1-1.8-2.5V6.5l-6.4 1.6v10.1Z" fill="currentColor"/>`,
  spring: `<path d="M6 5h12M7.5 9h9M6 13h12M7.5 17h9M6 21h12" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" fill="none"/>`,
  clockFace: `<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5.4l3.4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  toast: `<path d="M6 10a3.6 3.6 0 0 1 1.4-2.9C8.6 6.1 10.2 5.5 12 5.5s3.4.6 4.6 1.6A3.6 3.6 0 0 1 18 10v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-8Z" fill="currentColor"/>`,
  gauge: `<path d="M4 17a8 8 0 1 1 16 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="m12 16 4-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`,
  reset: `<path d="M12 5.5A6.5 6.5 0 1 0 18.5 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M12 2.6 12 8.4 7 5.5Z" fill="currentColor"/>`,
  soundOn: `<path d="M5 9.5h3.2L13 5.4v13.2L8.2 14.5H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z" fill="currentColor"/><path d="M16 9a4.4 4.4 0 0 1 0 6M18.6 6.4a8 8 0 0 1 0 11.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  soundOff: `<path d="M5 9.5h3.2L13 5.4v13.2L8.2 14.5H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z" fill="currentColor"/><path d="m16.5 9.5 5 5m0-5-5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/>`,
  gear: `<path d="M12 8.6A3.4 3.4 0 1 0 12 15.4 3.4 3.4 0 0 0 12 8.6Zm9 4.8v-2.8l-2.4-.4a6.9 6.9 0 0 0-.8-1.9l1.4-2-2-2-2 1.4a6.9 6.9 0 0 0-1.9-.8L13 2.8h-2.8l-.4 2.4a6.9 6.9 0 0 0-1.9.8l-2-1.4-2 2 1.4 2a6.9 6.9 0 0 0-.8 1.9l-2.4.4V14l2.4.4c.2.7.5 1.3.8 1.9l-1.4 2 2 2 2-1.4c.6.4 1.2.6 1.9.8l.4 2.4H13l.4-2.4c.7-.2 1.3-.5 1.9-.8l2 1.4 2-2-1.4-2c.4-.6.6-1.2.8-1.9l2.3-.5Z" fill="currentColor"/>`,
  eye: `<path d="M12 5.5c-5 0-8.6 4-9.7 5.7a1.4 1.4 0 0 0 0 1.6C3.4 14.5 7 18.5 12 18.5s8.6-4 9.7-5.7a1.4 1.4 0 0 0 0-1.6C20.6 9.5 17 5.5 12 5.5Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/>`,
  ghost: `<path d="M12 5.5c-5 0-8.6 4-9.7 5.7a1.4 1.4 0 0 0 0 1.6C3.4 14.5 7 18.5 12 18.5s8.6-4 9.7-5.7a1.4 1.4 0 0 0 0-1.6C20.6 9.5 17 5.5 12 5.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3.4 3"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/>`,
  speak: `<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.4 3.6a.6.6 0 0 1-1-.5V16h-.1A2.5 2.5 0 0 1 4 13.5v-7Z" fill="currentColor"/>`,
  close: `<path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none"/>`,
  question: `<circle cx="12" cy="12" r="9.4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.3 2.4c-.7.3-1 .9-1 1.6v.4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/><circle cx="12" cy="17.2" r="1.3" fill="currentColor"/>`,
};

function icon(name, size = 24) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/* ------------------------------------------------------------------ */

export class UI {
  /**
   * @param {HTMLElement} root
   * @param {object} handlers
   */
  constructor(root, handlers = {}) {
    this.root = root;
    this.on = handlers;
    this.orientation = null;
    this._meterEls = new Map();
    this._machines = [];
    this._xray = 0;
    this._build();
  }

  /* ---------------------------------------------------------------- */

  _build() {
    this.root.innerHTML = `
      <div class="hud" id="hud">
        <div class="hud-top">
          <div class="meters" id="meters"></div>
          <div class="top-actions">
            <button class="round-btn" id="btn-help" aria-label="あそびかた">${icon('question', 26)}</button>
            <button class="round-btn" id="btn-settings" aria-label="せってい">${icon('gear', 26)}</button>
          </div>
        </div>

        <div class="hud-side">
          <div class="xray" id="xray">
            <div class="xray-cap xray-cap-a">${icon('eye', 26)}</div>
            <div class="xray-track" id="xray-track">
              <div class="xray-fill" id="xray-fill"></div>
              <div class="xray-knob" id="xray-knob">
                <div class="xray-knob-face">
                  <svg viewBox="0 0 48 26" width="36" height="20" aria-hidden="true">
                    <rect x="1.6" y="4" width="19" height="18" rx="6" fill="none" stroke="currentColor" stroke-width="3"/>
                    <rect x="27.4" y="4" width="19" height="18" rx="6" fill="none" stroke="currentColor" stroke-width="3"/>
                    <path d="M20.6 11h6.8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
                  </svg>
                </div>
              </div>
            </div>
            <div class="xray-cap xray-cap-b">${icon('ghost', 26)}</div>
            <div class="xray-label" id="xray-label">すけすけ</div>
          </div>
        </div>

        <div class="hud-bottom">
          <div class="tools">
            <button class="round-btn tool" id="btn-reset" aria-label="さいしょから">${icon('reset', 26)}</button>
            <button class="round-btn tool is-on" id="btn-sound" aria-label="おと">${icon('soundOn', 26)}</button>
          </div>
          <div class="picker" id="picker" role="tablist"></div>
        </div>
      </div>

      <div class="sheet" id="sheet" hidden>
        <div class="sheet-panel" role="dialog" aria-label="せってい">
          <button class="round-btn sheet-close" id="btn-sheet-close" aria-label="とじる">${icon('close', 26)}</button>
          <h2 class="sheet-title">せってい</h2>
          <label class="switch-row">
            <span class="switch-label">${icon('soundOn', 22)}<span>おと</span></span>
            <input type="checkbox" id="opt-sound" checked><span class="switch-ui"></span>
          </label>
          <label class="switch-row">
            <span class="switch-label">${icon('speak', 22)}<span>なまえを よむ</span></span>
            <input type="checkbox" id="opt-speech" checked><span class="switch-ui"></span>
          </label>
          <label class="switch-row">
            <span class="switch-label">${icon('question', 22)}<span>さわるところを おしえる</span></span>
            <input type="checkbox" id="opt-hints" checked><span class="switch-ui"></span>
          </label>
          <label class="switch-row">
            <span class="switch-label">${icon('gauge', 22)}<span>きれいさ ゆうせん</span></span>
            <input type="checkbox" id="opt-quality" checked><span class="switch-ui"></span>
          </label>
          <p class="sheet-note" id="sheet-note"></p>
        </div>
      </div>

      <div class="sheet" id="help" hidden>
        <div class="sheet-panel help-panel" role="dialog" aria-label="あそびかた">
          <button class="round-btn sheet-close" id="btn-help-close" aria-label="とじる">${icon('close', 26)}</button>
          <h2 class="sheet-title">あそびかた</h2>
          <ul class="help-list">
            <li><span class="help-fig">${icon('ghost', 30)}</span><b>すけすけ</b>を うごかすと、なかが みえるよ</li>
            <li><span class="help-fig">${icon('gear', 30)}</span>ひかっている ぶひんを ゆびで さわってみよう</li>
            <li><span class="help-fig">${icon('reset', 30)}</span>ゆびで おさえると、とまるよ</li>
            <li><span class="help-fig">${icon('eye', 30)}</span>なにも ないところを なぞると、ぐるっと まわせるよ</li>
          </ul>
        </div>
      </div>
    `;

    this.hud = this.root.querySelector('#hud');
    this.metersEl = this.root.querySelector('#meters');
    this.pickerEl = this.root.querySelector('#picker');
    this.xrayEl = this.root.querySelector('#xray');
    this.xrayTrack = this.root.querySelector('#xray-track');
    this.xrayFill = this.root.querySelector('#xray-fill');
    this.xrayKnob = this.root.querySelector('#xray-knob');
    this.xrayLabel = this.root.querySelector('#xray-label');
    this.sheet = this.root.querySelector('#sheet');
    this.helpSheet = this.root.querySelector('#help');

    this._bindXray();
    this._bindButtons();
  }

  /* ---------------------------------------------------------------- */
  /* すけすけスライダー                                                */
  /* ---------------------------------------------------------------- */

  _bindXray() {
    const track = this.xrayTrack;
    let dragging = false;

    const valueFromEvent = (e) => {
      const r = track.getBoundingClientRect();
      if (this.orientation === 'landscape') {
        return 1 - (e.clientY - r.top) / r.height;
      }
      return (e.clientX - r.left) / r.width;
    };

    const onDown = (e) => {
      e.preventDefault();
      dragging = true;
      track.setPointerCapture?.(e.pointerId);
      this.xrayKnob.classList.add('is-grabbed');
      this.setXray(valueFromEvent(e), true);
    };
    const onMove = (e) => {
      if (!dragging) return;
      e.preventDefault();
      this.setXray(valueFromEvent(e), true);
    };
    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      track.releasePointerCapture?.(e.pointerId);
      this.xrayKnob.classList.remove('is-grabbed');
      this.on.xrayEnd?.(this._xray);
    };

    track.addEventListener('pointerdown', onDown, { passive: false });
    track.addEventListener('pointermove', onMove, { passive: false });
    track.addEventListener('pointerup', onUp);
    track.addEventListener('pointercancel', onUp);
  }

  /**
   * @param {number} v 0..1
   * @param {boolean} fromUser
   */
  setXray(v, fromUser = false) {
    const value = Math.max(0, Math.min(1, v));
    this._xray = value;
    const pct = value * 100;
    const knob = this.xrayKnob.style;
    if (this.orientation === 'landscape') {
      knob.left = '50%';
      knob.top = '';
      knob.bottom = `${pct}%`;
      knob.transform = 'translate(-50%, 50%)';
      this.xrayFill.style.height = `${pct}%`;
      this.xrayFill.style.width = '';
    } else {
      knob.left = `${pct}%`;
      knob.top = '50%';
      knob.bottom = '';
      knob.transform = 'translate(-50%, -50%)';
      this.xrayFill.style.width = `${pct}%`;
      this.xrayFill.style.height = '';
    }
    this.xrayEl.style.setProperty('--xray', value.toFixed(3));
    this.xrayLabel.textContent = value < 0.04 ? 'そのまま' : value > 0.96 ? 'ぜんぶ すけすけ' : 'すけすけ';
    if (fromUser) this.on.xray?.(value);
  }

  get xray() {
    return this._xray;
  }

  /* ---------------------------------------------------------------- */

  _bindButtons() {
    const q = (s) => this.root.querySelector(s);
    q('#btn-reset').addEventListener('click', () => this.on.reset?.());
    const soundBtn = q('#btn-sound');
    soundBtn.addEventListener('click', () => {
      const on = !soundBtn.classList.contains('is-on');
      this.setSound(on);
      this.on.sound?.(on);
    });
    this.soundBtn = soundBtn;

    q('#btn-settings').addEventListener('click', () => this.openSheet('sheet'));
    q('#btn-sheet-close').addEventListener('click', () => this.closeSheets());
    q('#btn-help').addEventListener('click', () => this.openSheet('help'));
    q('#btn-help-close').addEventListener('click', () => this.closeSheets());
    for (const s of [this.sheet, this.helpSheet]) {
      s.addEventListener('pointerdown', (e) => {
        if (e.target === s) this.closeSheets();
      });
    }

    q('#opt-sound').addEventListener('change', (e) => {
      this.setSound(e.target.checked);
      this.on.sound?.(e.target.checked);
    });
    q('#opt-speech').addEventListener('change', (e) => this.on.speech?.(e.target.checked));
    q('#opt-hints').addEventListener('change', (e) => this.on.hints?.(e.target.checked));
    q('#opt-quality').addEventListener('change', (e) => this.on.quality?.(e.target.checked));
    this.optSound = q('#opt-sound');
    this.optSpeech = q('#opt-speech');
    this.optHints = q('#opt-hints');
    this.optQuality = q('#opt-quality');
    this.sheetNote = q('#sheet-note');
  }

  setSound(on) {
    this.soundBtn.classList.toggle('is-on', on);
    this.soundBtn.innerHTML = icon(on ? 'soundOn' : 'soundOff', 26);
    if (this.optSound) this.optSound.checked = on;
  }

  openSheet(which) {
    this.closeSheets();
    const el = which === 'help' ? this.helpSheet : this.sheet;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('is-open'));
  }

  closeSheets() {
    for (const s of [this.sheet, this.helpSheet]) {
      if (s.hidden) continue;
      s.classList.remove('is-open');
      setTimeout(() => {
        s.hidden = true;
      }, 220);
    }
  }

  setNote(text) {
    if (this.sheetNote) this.sheetNote.textContent = text;
  }

  /* ---------------------------------------------------------------- */
  /* 機械えらび                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * @param {{id:string,name:string,sub:string,accent:number,icon:string}[]} machines
   */
  setMachines(machines) {
    this._machines = machines;
    this.pickerEl.innerHTML = machines
      .map(
        (m, i) => `
      <button class="card" role="tab" data-id="${m.id}" style="--accent:${hex(m.accent)}" aria-label="${m.name}">
        <span class="card-art">${m.icon}</span>
        <span class="card-name">${m.name}</span>
        <span class="card-index">${i + 1}</span>
      </button>`,
      )
      .join('');
    this.pickerEl.querySelectorAll('.card').forEach((el) => {
      el.addEventListener('click', () => this.on.select?.(el.dataset.id));
    });
  }

  setActiveMachine(id) {
    const cards = this.pickerEl.querySelectorAll('.card');
    let active = null;
    cards.forEach((el) => {
      const on = el.dataset.id === id;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) active = el;
    });
    const meta = this._machines.find((m) => m.id === id);
    if (meta) this.hud.style.setProperty('--accent', hex(meta.accent));
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  /* ---------------------------------------------------------------- */
  /* メーター                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * @param {{id:string,icon:string,label:string,value:number,color:string}[]} list
   */
  setMeters(list) {
    const ids = new Set(list.map((m) => m.id));
    for (const [id, el] of this._meterEls) {
      if (!ids.has(id)) {
        el.remove();
        this._meterEls.delete(id);
      }
    }
    for (const m of list) {
      let el = this._meterEls.get(m.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'meter';
        el.innerHTML = `
          <span class="meter-icon">${icon(m.icon, 22)}</span>
          <span class="meter-bar"><i></i></span>
          <span class="meter-name">${m.label}</span>`;
        this.metersEl.appendChild(el);
        this._meterEls.set(m.id, el);
      }
      el.style.setProperty('--c', m.color);
      const bar = el.querySelector('.meter-bar i');
      bar.style.transform = `scaleX(${Math.max(0.02, Math.min(1, m.value)).toFixed(3)})`;
      el.classList.toggle('is-hot', m.value > 0.92);
    }
  }

  updateMeterValues(list) {
    for (const m of list) {
      const el = this._meterEls.get(m.id);
      if (!el) continue;
      const bar = el.querySelector('.meter-bar i');
      bar.style.transform = `scaleX(${Math.max(0.02, Math.min(1, m.value)).toFixed(3)})`;
      if (m.color) el.style.setProperty('--c', m.color);
      el.classList.toggle('is-hot', m.value > 0.92);
    }
  }

  /* ---------------------------------------------------------------- */
  /* レイアウト                                                        */
  /* ---------------------------------------------------------------- */

  /** 画面の向きを判定して、クラスを切り替える */
  layout(width, height) {
    const o = width > height * 1.05 ? 'landscape' : 'portrait';
    const changed = o !== this.orientation;
    this.orientation = o;
    this.hud.classList.toggle('is-landscape', o === 'landscape');
    this.hud.classList.toggle('is-portrait', o === 'portrait');
    // 幅も高さも狭い端末（iPhone など）は、部品をひとまわり小さくする
    this.hud.classList.toggle('is-compact', Math.min(width, height) < 400);
    // 縦横でスライダーの向きが変わるので、つまみの位置を計算し直す
    if (changed) this.setXray(this._xray);
  }

  /**
   * 3D の機械を置いてよい領域（UI に隠れないところ）を返す。
   * DOM の実測値から求めるので、セーフエリアやフォントサイズの差にも追従する。
   */
  contentRect(width, height) {
    const top = this.root.querySelector('.hud-top');
    const bottom = this.root.querySelector('.hud-bottom');
    const side = this.root.querySelector('.hud-side');
    const tb = top.getBoundingClientRect();
    const bb = bottom.getBoundingClientRect();
    const sb = side.getBoundingClientRect();

    if (this.orientation === 'landscape') {
      // 左のカードレールと、右のスライダーに挟まれた帯を使う
      const left = Math.max(bb.right, 8) + 6;
      const right = Math.min(sb.left, width) - 6;
      const top = Math.max(tb.bottom * 0.55, 6);
      return {
        x: left,
        y: top,
        width: Math.max(80, right - left),
        height: Math.max(80, height - top - 8),
      };
    }

    // 縦画面: 上のメーターと、下のスライダー＋カードの間を使う
    const topPad = Math.max(tb.bottom, 8) * 0.72;
    const bottomEdge = Math.min(bb.top, sb.top || bb.top);
    const bottomPad = Math.max(0, height - bottomEdge);
    return {
      x: 6,
      y: topPad,
      width: width - 12,
      height: Math.max(140, height - topPad - bottomPad + 16),
    };
  }
}

function hex(n) {
  return `#${(n >>> 0).toString(16).padStart(6, '0')}`;
}
