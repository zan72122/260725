/* Temporary visual test harness for the UI layer (not shipped). */
import * as THREE from 'three';
import { UI } from './src/ui/ui.js';
import { State } from './src/game/state.js';

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight, false);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 60);
camera.position.set(0, 1.3, 3.2);
camera.lookAt(0, 1.0, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0xffd0e0, 2.2));
const key = new THREE.DirectionalLight(0xfff0e0, 2.0); key.position.set(2, 4, 3); scene.add(key);

const baby = new THREE.Group();
const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 32, 24), new THREE.MeshStandardMaterial({ color: 0xffd9c2, roughness: .7 }));
body.position.y = 0.85; baby.add(body);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 24), new THREE.MeshStandardMaterial({ color: 0xffe3ce, roughness: .6 }));
head.position.y = 1.22; baby.add(head);
scene.add(baby);
const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf7e6ef }));
scene.add(floor);

const state = new State({ autosave: false });

const app = {
  state, camera, renderer, scene, baby,
  audio: { unlock() {}, play() {}, setMuted() {} },
  cameraRig: { goTo() {} },
  async setActivity(name) { app.ui.setActivity(name); app.activityName = name; }
};

const ui = new UI({ app });
app.ui = ui;
await ui.init();
window.__UI__ = ui;
window.__APP__ = app;
window.__BABY__ = head;

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  ui.update(dt);
  renderer.render(scene, camera);
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
