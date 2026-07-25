/**
 * sw.js — オフラインで遊べるようにするサービスワーカー
 *
 * ぜんぶのファイルを最初にキャッシュしておき、以後はキャッシュから返す。
 * 外部から取ってくるものが 1 つも無いので、いちど開けば機内モードでも動く。
 *
 * 更新のしかた: CACHE の版番号を上げる。古いキャッシュは activate で消える。
 */

const CACHE = 'kikai-no-naka-v3';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',

  './js/main.js',
  './js/core/app.js',
  './js/core/audio.js',
  './js/core/camera.js',
  './js/core/input.js',
  './js/core/quality.js',
  './js/core/stage.js',
  './js/core/ui.js',
  './js/core/view.js',
  './js/lib/geometry.js',
  './js/lib/hints.js',
  './js/lib/materials.js',
  './js/lib/math.js',
  './js/lib/particles.js',
  './js/lib/textures.js',
  './js/lib/xray.js',
  './js/machines/base.js',
  './js/machines/beater.js',
  './js/machines/bicycle.js',
  './js/machines/camera.js',
  './js/machines/clock.js',
  './js/machines/escalator.js',
  './js/machines/fan.js',
  './js/machines/flashlight.js',
  './js/machines/gacha.js',
  './js/machines/index.js',
  './js/machines/lift.js',
  './js/machines/lock.js',
  './js/machines/musicbox.js',
  './js/machines/piano.js',
  './js/machines/pump.js',
  './js/machines/scale.js',
  './js/machines/sewing.js',
  './js/machines/sharpener.js',
  './js/machines/toaster.js',
  './js/machines/train.js',

  './vendor/three/three.module.js',
  './vendor/three/addons/geometries/RoundedBoxGeometry.js',
  './vendor/three/addons/postprocessing/EffectComposer.js',
  './vendor/three/addons/postprocessing/MaskPass.js',
  './vendor/three/addons/postprocessing/OutputPass.js',
  './vendor/three/addons/postprocessing/Pass.js',
  './vendor/three/addons/postprocessing/RenderPass.js',
  './vendor/three/addons/postprocessing/ShaderPass.js',
  './vendor/three/addons/postprocessing/UnrealBloomPass.js',
  './vendor/three/addons/shaders/CopyShader.js',
  './vendor/three/addons/shaders/FXAAShader.js',
  './vendor/three/addons/shaders/LuminosityHighPassShader.js',
  './vendor/three/addons/shaders/OutputShader.js',
  './vendor/three/addons/utils/BufferGeometryUtils.js',

  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // 1 つでも失敗するとインストール全体が止まるので、個別に入れる
      await Promise.all(
        ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn('[sw] キャッシュ失敗', url, err)),
        ),
      );
      await self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.ok && res.type === 'basic') {
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch (err) {
        // オフラインで未キャッシュのものを求められたら、入口を返す
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
        throw err;
      }
    })(),
  );
});
