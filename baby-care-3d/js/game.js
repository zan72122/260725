const canvas = document.querySelector('#scene');
const speech = document.querySelector('#speech');
const cards = document.querySelector('#cards');
const happyFill = document.querySelector('#happyFill');
const stars = document.querySelector('#stars');
const magic = document.querySelector('#magic');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xfff5fb, 9, 25);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
const clock = new THREE.Clock();

const care = [
  { id:'milk', emoji:'🍼', label:'ミルク', color:0xfff0aa, line:'ごくごく！おなかぽんぽんだよ', props:['bottle'], effect:'hearts' },
  { id:'bath', emoji:'🛁', label:'あわあわ', color:0x93e5ff, line:'ぷくぷくバスタイム！', props:['tub','bubbles'], effect:'bubbles' },
  { id:'diaper', emoji:'🧷', label:'おむつ', color:0xdcc8ff, line:'さらさらおむつでごきげん！', props:['diaper'], effect:'sparkles' },
  { id:'dress', emoji:'👒', label:'おきがえ', color:0xffaad6, line:'くまさんぼうし、にあうね！', props:['hat','bib'], effect:'rainbow' },
  { id:'play', emoji:'🧸', label:'あそぶ', color:0xffc36b, line:'ころころボールをタッチ！', props:['toys'], effect:'confetti' },
  { id:'sleep', emoji:'🌙', label:'ねんね', color:0x9fb7ff, line:'ゆらゆら、いいゆめみてね', props:['moon','blanket'], effect:'stars' }
];
let score = 0, active = care[0], particles = [], bob = 0;
const mat = (color, rough=0.65) => new THREE.MeshStandardMaterial({ color, roughness:rough, metalness:0.03 });
const group = new THREE.Group(); scene.add(group);

function mesh(geo, material, pos, scale=[1,1,1]) { const m = new THREE.Mesh(geo, material); m.position.set(...pos); m.scale.set(...scale); m.castShadow = m.receiveShadow = true; group.add(m); return m; }
const skin = mat(0xffd1b8), blush = mat(0xff8aa8), white = mat(0xffffff), dark = mat(0x4a3149);
const baby = new THREE.Group(); group.add(baby);
function addToBaby(geo, material, pos, scale=[1,1,1]){const m=new THREE.Mesh(geo,material);m.position.set(...pos);m.scale.set(...scale);m.castShadow=m.receiveShadow=true;baby.add(m);return m;}
addToBaby(new THREE.SphereGeometry(1.05,48,32), skin, [0,1.65,0]);
addToBaby(new THREE.SphereGeometry(.43,32,20), skin, [-.84,1.73,0]); addToBaby(new THREE.SphereGeometry(.43,32,20), skin, [.84,1.73,0]);
addToBaby(new THREE.SphereGeometry(.11,24,12), dark, [-.33,1.83,.92]); addToBaby(new THREE.SphereGeometry(.11,24,12), dark, [.33,1.83,.92]);
addToBaby(new THREE.SphereGeometry(.13,24,12), blush, [-.53,1.58,.87]); addToBaby(new THREE.SphereGeometry(.13,24,12), blush, [.53,1.58,.87]);
const mouth = addToBaby(new THREE.TorusGeometry(.22,.035,12,32,Math.PI), dark, [0,1.49,.96]); mouth.rotation.z = Math.PI;
addToBaby(new THREE.SphereGeometry(.72,40,24), mat(0xfff6fa), [0,.45,0], [1.1,1.25,.82]);
addToBaby(new THREE.SphereGeometry(.2,24,16), skin, [-.95,.55,.15]); addToBaby(new THREE.SphereGeometry(.2,24,16), skin, [.95,.55,.15]);
addToBaby(new THREE.SphereGeometry(.23,24,16), skin, [-.42,-.45,.25]); addToBaby(new THREE.SphereGeometry(.23,24,16), skin, [.42,-.45,.25]);
const propGroup = new THREE.Group(); baby.add(propGroup);

mesh(new THREE.CylinderGeometry(5.7,6.4,.35,64), mat(0xf7d7ef), [0,-.78,0]);
for(let i=0;i<18;i++){ const a=i/18*Math.PI*2; mesh(new THREE.SphereGeometry(.22,16,10), mat(i%2?0xfff0aa:0xa9f4df), [Math.cos(a)*5.2,-.42,Math.sin(a)*5.2]); }
scene.add(new THREE.HemisphereLight(0xffffff,0xffbadd,1.8)); const sun=new THREE.DirectionalLight(0xffffff,1.9); sun.position.set(4,8,5); sun.castShadow=true; scene.add(sun);

care.forEach(item=>{ const b=document.createElement('button'); b.className='card'; b.innerHTML=`<span class="emoji">${item.emoji}</span><small>${item.label}</small>`; b.onclick=()=>select(item,b); cards.appendChild(b); });
function select(item, btn){ active=item; [...cards.children].forEach(x=>x.classList.toggle('active',x===btn)); speech.textContent=item.line; score=Math.min(100,score+9); happyFill.style.width=score+'%'; stars.textContent='⭐'.repeat(Math.floor(score/20)); showProps(item.props); burst(item.effect); playTone(item.id); }
function showProps(list){ propGroup.clear(); const add=(g,m,p,s=[1,1,1])=>{const x=new THREE.Mesh(g,m);x.position.set(...p);x.scale.set(...s);x.castShadow=true;propGroup.add(x);return x}; if(list.includes('hat')) add(new THREE.ConeGeometry(.85,.75,32),mat(0xff78bd),[0,1.18,.02]); if(list.includes('bib')) add(new THREE.TorusGeometry(.48,.1,16,40),mat(0x79e3d0),[0,.98,.62],[1,.55,1]); if(list.includes('blanket')) add(new THREE.BoxGeometry(1.8,.18,1.15),mat(0x90a8ff),[0,.1,.28]); if(list.includes('bottle')){add(new THREE.CylinderGeometry(.16,.2,.75,24),mat(0xffffff),[.85,.55,.55]);add(new THREE.CylinderGeometry(.11,.11,.2,24),mat(0xffd56a),[.85,1.03,.55]);} if(list.includes('diaper')) add(new THREE.BoxGeometry(1.15,.44,.72),mat(0xffffff),[0,.08,.35]); if(list.includes('tub')) add(new THREE.TorusGeometry(1.2,.16,16,64),mat(0x80ddff),[0,.08,.05],[1,.35,.65]); if(list.includes('moon')) add(new THREE.TorusGeometry(.45,.11,20,48),mat(0xfff0aa),[1.25,2.38,.15]); if(list.includes('toys')) for(let i=0;i<4;i++) add(new THREE.SphereGeometry(.18,20,12),mat([0xff7474,0xffd56a,0x7ee6cf,0x8bd7ff][i]),[-1.1+i*.72,-.32,.55]); }
function burst(type){ const emojis={hearts:'💗',bubbles:'🫧',sparkles:'✨',rainbow:'🌈',confetti:'🎉',stars:'⭐'}; for(let i=0;i<14;i++){const e=document.createElement('div'); e.className='pop'; e.textContent=emojis[type]||'✨'; e.style.left=(20+Math.random()*60)+'vw'; e.style.top=(28+Math.random()*38)+'vh'; document.body.appendChild(e); setTimeout(()=>e.remove(),1100); particles.push({mesh:mesh(new THREE.SphereGeometry(.06,8,8),mat(Math.random()*0xffffff),[(Math.random()-.5)*3,1+Math.random()*2,1.1+Math.random()], [1,1,1]),life:1});}}
let audio; function playTone(id){ audio ||= new (window.AudioContext||window.webkitAudioContext)(); const notes={milk:523,bath:659,diaper:587,dress:784,play:880,sleep:392}; [0,1,2].forEach((n,i)=>{const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=(notes[id]||523)*(1+i*.25);g.gain.setValueAtTime(.0001,audio.currentTime+i*.08);g.gain.exponentialRampToValueAtTime(.08,audio.currentTime+i*.08+.02);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+i*.08+.22);o.connect(g).connect(audio.destination);o.start(audio.currentTime+i*.08);o.stop(audio.currentTime+i*.08+.24);});}
function resize(){ const w=innerWidth,h=innerHeight; renderer.setSize(w,h,false); camera.aspect=w/h; camera.position.set(0,2.2,w<h?8.2:6.4); camera.lookAt(0,.75,0); camera.updateProjectionMatrix(); }
addEventListener('resize',resize); resize(); showProps(['bottle']); cards.firstElementChild.classList.add('active');
magic.onclick=()=>{speech.textContent='やさしいおせわ、ぜんぶ大成功！'; score=100; happyFill.style.width='100%'; stars.textContent='⭐⭐⭐⭐⭐'; ['hearts','bubbles','rainbow','confetti','stars'].forEach((x,i)=>setTimeout(()=>burst(x),i*170));};
addEventListener('pointerdown',e=>{ if(e.target.closest('button')) return; burst(['hearts','bubbles','sparkles','confetti'][Math.floor(Math.random()*4)]); });
function animate(){ requestAnimationFrame(animate); const t=clock.getElapsedTime(); bob += .025; baby.position.y=Math.sin(t*2.2)*.06; baby.rotation.y=Math.sin(t*.7)*.18; group.rotation.y=Math.sin(t*.18)*.08; particles=particles.filter(p=>{p.life-=.018;p.mesh.position.y+=.035;p.mesh.material.opacity=p.life;p.mesh.material.transparent=true;if(p.life<=0){group.remove(p.mesh);return false}return true}); renderer.render(scene,camera); } animate();
