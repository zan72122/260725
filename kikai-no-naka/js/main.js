/**
 * main.js — 入口
 *
 * 起動画面を描き、最初のタップで音を解禁してからアプリを立ち上げる。
 * （iOS Safari は、ユーザー操作の中でしか AudioContext を作れない）
 */

import { App } from './core/app.js';

const canvas = document.getElementById('stage');
const uiRoot = document.getElementById('ui');
const boot = document.getElementById('boot');
const bootBtn = document.getElementById('boot-btn');
const bootLoading = document.getElementById('boot-loading');

drawBootGears(document.getElementById('boot-gears'));

let app = null;
let ready = false;

async function prepare() {
  try {
    app = new App({ canvas, uiRoot, boot });
    // 開発時にコンソールから触れるようにしておく
    window.__kikai = app;
    await app.boot();
    ready = true;
    bootLoading.textContent = 'じゅんび できました';
    bootLoading.classList.add('is-done');
    bootBtn.removeAttribute('disabled');
  } catch (err) {
    console.error(err);
    bootLoading.textContent = 'うまく はじめられませんでした';
    showFatal(err);
  }
}

bootBtn.setAttribute('disabled', '');
requestAnimationFrame(() => requestAnimationFrame(prepare));

bootBtn.addEventListener('click', () => {
  if (!ready || !app) return;
  app.audio.unlock();
  app.audio.setEnabled(app.prefs.sound !== false);
  boot.classList.add('is-hidden');
  setTimeout(() => {
    boot.style.display = 'none';
    app.resize();
  }, 520);
  setTimeout(() => app.audio.chime(660, { gain: 0.14 }), 260);
});

/* ------------------------------------------------------------------ */

/** 起動画面のかみ合う歯車を、SVG で組み立てる */
function drawBootGears(svg) {
  if (!svg) return;
  const NS = 'http://www.w3.org/2000/svg';

  const gear = (teeth, r, tooth, color, cls) => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', cls);
    const body = document.createElementNS(NS, 'circle');
    body.setAttribute('r', String(r));
    body.setAttribute('fill', color);
    g.appendChild(body);
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * 360;
      const t = document.createElementNS(NS, 'rect');
      t.setAttribute('x', String(-tooth * 0.42));
      t.setAttribute('y', String(-r - tooth * 0.72));
      t.setAttribute('width', String(tooth * 0.84));
      t.setAttribute('height', String(tooth * 1.1));
      t.setAttribute('rx', String(tooth * 0.28));
      t.setAttribute('fill', color);
      t.setAttribute('transform', `rotate(${a})`);
      g.appendChild(t);
    }
    const hole = document.createElementNS(NS, 'circle');
    hole.setAttribute('r', String(r * 0.30));
    hole.setAttribute('fill', '#f7e8d0');
    g.appendChild(hole);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const sp = document.createElementNS(NS, 'circle');
      sp.setAttribute('cx', String(Math.cos(a) * r * 0.60));
      sp.setAttribute('cy', String(Math.sin(a) * r * 0.60));
      sp.setAttribute('r', String(r * 0.155));
      sp.setAttribute('fill', '#f7e8d0');
      g.appendChild(sp);
    }
    return g;
  };

  const big = gear(18, 52, 13, '#e8a33f', 'cog-a');
  big.setAttribute('transform', 'translate(-26 -14)');
  const small = gear(12, 34, 13, '#57bfae', 'cog-b');
  small.setAttribute('transform', 'translate(48 34)');
  svg.appendChild(big);
  svg.appendChild(small);
}

function showFatal(err) {
  const box = document.createElement('pre');
  box.style.cssText =
    'position:fixed;left:12px;right:12px;bottom:12px;max-height:42vh;overflow:auto;' +
    'background:rgba(255,255,255,.94);color:#8a3b2a;padding:12px 14px;border-radius:14px;' +
    'font:12px/1.5 ui-monospace,monospace;z-index:100;white-space:pre-wrap;';
  box.textContent = String(err && err.stack ? err.stack : err);
  document.body.appendChild(box);
}

// オフラインでも遊べるようにキャッシュしておく（file:// では登録できないので無視）
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* 登録できなくても、オンラインなら普通に遊べる */
    });
  });
}

window.addEventListener('error', (e) => {
  if (!ready) showFatal(e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  if (!ready) showFatal(e.reason);
});
