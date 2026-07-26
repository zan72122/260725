/* ============================================================
 * convex.js — 凸多面体カットエンジン
 *
 * 宝石を「半空間の交わり」として持つ。
 *   立体 = { x | n_i・x <= d_i }  (i = 0..面数)
 * なぞるたびに平面を1枚足して切り落とすだけなので、
 * どこをどう削っても立体が壊れない＝失敗しない。
 * ============================================================ */
(function () {
  'use strict';

  var EPS = 1e-6;
  var MERGE_EPS = 1e-4;

  /* 面: 平面(n, d) と その上の凸多角形 pts（外から見て反時計回り） */
  function Face(n, d, pts, tag) {
    this.n = n;
    this.d = d;
    this.pts = pts;
    this.tag = tag;   // { kind:'rock'|'facet', id, hue }
  }

  Face.prototype.clone = function () {
    var pts = [];
    for (var i = 0; i < this.pts.length; i++) pts.push(this.pts[i].clone());
    return new Face(this.n.clone(), this.d, pts, this.tag);
  };

  Face.prototype.centroid = function () {
    var c = new THREE.Vector3();
    for (var i = 0; i < this.pts.length; i++) c.add(this.pts[i]);
    return c.multiplyScalar(1 / Math.max(1, this.pts.length));
  };

  /* 三角形分割したときの面積（凸なので扇形分割でよい） */
  Face.prototype.area = function () {
    var a = 0, p0 = this.pts[0];
    var e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), cr = new THREE.Vector3();
    for (var i = 1; i < this.pts.length - 1; i++) {
      e1.subVectors(this.pts[i], p0);
      e2.subVectors(this.pts[i + 1], p0);
      cr.crossVectors(e1, e2);
      a += cr.length() * 0.5;
    }
    return a;
  };

  /* ---------------- 立体本体 ---------------- */

  function ConvexSolid() {
    this.faces = [];
  }

  /* 出発点となる立方体（この後たくさんの平面で削って丸石にする） */
  ConvexSolid.prototype.setBox = function (r, tag) {
    var axes = [
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)
    ];
    this.faces = [];
    for (var i = 0; i < axes.length; i++) {
      var n = axes[i];
      /* 面上の正方形を作る */
      var u = Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      u = u.clone().sub(n.clone().multiplyScalar(u.dot(n))).normalize();
      var v = new THREE.Vector3().crossVectors(n, u);   // u × v = n になるよう後で確認
      v.normalize();
      /* u × v が n と同じ向きになるように調整（外から見て反時計回り） */
      if (new THREE.Vector3().crossVectors(u, v).dot(n) < 0) v.negate();
      var c = n.clone().multiplyScalar(r);
      var pts = [
        c.clone().addScaledVector(u, -r).addScaledVector(v, -r),
        c.clone().addScaledVector(u, r).addScaledVector(v, -r),
        c.clone().addScaledVector(u, r).addScaledVector(v, r),
        c.clone().addScaledVector(u, -r).addScaledVector(v, r)
      ];
      this.faces.push(new Face(n.clone(), r, pts, tag));
    }
    return this;
  };

  ConvexSolid.prototype.clone = function () {
    var s = new ConvexSolid();
    for (var i = 0; i < this.faces.length; i++) s.faces.push(this.faces[i].clone());
    return s;
  };

  /* dir 方向の一番外側の点までの距離（= その方向の表面までの深さ） */
  ConvexSolid.prototype.support = function (dir) {
    var best = -Infinity;
    for (var i = 0; i < this.faces.length; i++) {
      var pts = this.faces[i].pts;
      for (var j = 0; j < pts.length; j++) {
        var v = dir.dot(pts[j]);
        if (v > best) best = v;
      }
    }
    return best === -Infinity ? 0 : best;
  };

  ConvexSolid.prototype.maxRadius = function () {
    var best = 0;
    for (var i = 0; i < this.faces.length; i++) {
      var pts = this.faces[i].pts;
      for (var j = 0; j < pts.length; j++) {
        var l = pts[j].lengthSq();
        if (l > best) best = l;
      }
    }
    return Math.sqrt(best);
  };

  /* 原点が内部にある凸体の体積 = Σ (d * 面積) / 3 */
  ConvexSolid.prototype.volume = function () {
    var v = 0;
    for (var i = 0; i < this.faces.length; i++) v += this.faces[i].d * this.faces[i].area();
    return v / 3;
  };

  /* 全体を等倍する（削って小さくなった分を戻し、見た目の大きさを保つ） */
  ConvexSolid.prototype.scale = function (s) {
    for (var i = 0; i < this.faces.length; i++) {
      var f = this.faces[i];
      f.d *= s;
      for (var j = 0; j < f.pts.length; j++) f.pts[j].multiplyScalar(s);
    }
  };

  /* かたよって削られても、宝石が台座の上でまんなかに居られるように寄せる */
  ConvexSolid.prototype.recenter = function (amount) {
    var c = new THREE.Vector3(), n = 0, i, j;
    for (i = 0; i < this.faces.length; i++) {
      var pts = this.faces[i].pts;
      for (j = 0; j < pts.length; j++) { c.add(pts[j]); n++; }
    }
    if (!n) return;
    c.multiplyScalar((amount == null ? 1 : amount) / n);
    if (c.lengthSq() < 1e-8) return;
    for (i = 0; i < this.faces.length; i++) {
      var f = this.faces[i];
      f.d -= f.n.dot(c);
      for (j = 0; j < f.pts.length; j++) f.pts[j].sub(c);
    }
  };

  /* ---- 平面 n・x = d で切り、n・x <= d 側を残す ---- */
  ConvexSolid.prototype.cut = function (n, d, tag) {
    var newFaces = [];
    var capPts = [];
    var i, j;

    for (i = 0; i < this.faces.length; i++) {
      var f = this.faces[i];
      var pts = f.pts, m = pts.length;
      var dist = new Array(m);
      var anyIn = false, anyOut = false;
      for (j = 0; j < m; j++) {
        dist[j] = n.dot(pts[j]) - d;
        if (dist[j] < -EPS) anyIn = true;
        else if (dist[j] > EPS) anyOut = true;
      }
      if (!anyOut) {
        /* まるごと残る（平面上の点は切り口の頂点にもなる） */
        newFaces.push(f);
        for (j = 0; j < m; j++) if (Math.abs(dist[j]) <= EPS) capPts.push(pts[j].clone());
        continue;
      }
      if (!anyIn) continue;                    // まるごと削られる

      var out = [];
      for (j = 0; j < m; j++) {
        var k = (j + 1) % m;
        var dj = dist[j], dk = dist[k];
        if (dj <= EPS) out.push(pts[j]);
        if (Math.abs(dj) <= EPS) capPts.push(pts[j].clone());
        if ((dj < -EPS && dk > EPS) || (dj > EPS && dk < -EPS)) {
          var t = dj / (dj - dk);
          var ip = pts[j].clone().lerp(pts[k], t);
          out.push(ip);
          capPts.push(ip.clone());
        }
      }
      if (out.length >= 3) newFaces.push(new Face(f.n, f.d, out, f.tag));
    }

    /* 切り口（新しい面）を作る */
    var cap = buildCap(n, d, capPts, tag);
    if (!cap) return false;                    // 切れなかった（＝変化なし）
    newFaces.push(cap);
    this.faces = newFaces;
    return true;
  };

  function buildCap(n, d, pts, tag) {
    if (pts.length < 3) return null;

    /* 近い点をまとめる */
    var uniq = [];
    for (var i = 0; i < pts.length; i++) {
      var dup = false;
      for (var j = 0; j < uniq.length; j++) {
        if (uniq[j].distanceToSquared(pts[i]) < MERGE_EPS * MERGE_EPS) { dup = true; break; }
      }
      if (!dup) uniq.push(pts[i]);
    }
    if (uniq.length < 3) return null;

    /* 平面上で重心まわりに角度ソート（断面は凸なのでこれで正しい多角形になる） */
    var c = new THREE.Vector3();
    for (i = 0; i < uniq.length; i++) c.add(uniq[i]);
    c.multiplyScalar(1 / uniq.length);

    var u = Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    u.sub(n.clone().multiplyScalar(u.dot(n))).normalize();
    var v = new THREE.Vector3().crossVectors(n, u).normalize();
    if (new THREE.Vector3().crossVectors(u, v).dot(n) < 0) v.negate();

    var tmp = new THREE.Vector3();
    uniq.sort(function (a, b) {
      tmp.subVectors(a, c);
      var aa = Math.atan2(v.dot(tmp), u.dot(tmp));
      tmp.subVectors(b, c);
      var bb = Math.atan2(v.dot(tmp), u.dot(tmp));
      return aa - bb;
    });

    /* つぶれた（面積ゼロに近い）切り口は無視 */
    var f = new Face(n.clone(), d, uniq, tag);
    if (f.area() < 1e-5) return null;
    return f;
  }

  /* ---- 描画用ジオメトリ ----
   * rock（元の丸石の面）は球面法線でなめらかに、
   * facet（削った面）はフラット法線でカット面らしく見せる。 */
  ConvexSolid.prototype.buildGeometry = function () {
    var pos = [], nor = [], hue = [], flat = [];
    var e1 = new THREE.Vector3(), e2 = new THREE.Vector3();

    for (var i = 0; i < this.faces.length; i++) {
      var f = this.faces[i];
      var isFacet = f.tag && f.tag.kind === 'facet';
      var h = f.tag ? (f.tag.hue || 0) : 0;
      var p0 = f.pts[0];
      for (var k = 1; k < f.pts.length - 1; k++) {
        var tri = [p0, f.pts[k], f.pts[k + 1]];
        for (var t = 0; t < 3; t++) {
          var p = tri[t];
          pos.push(p.x, p.y, p.z);
          if (isFacet) nor.push(f.n.x, f.n.y, f.n.z);
          else {
            var l = p.length() || 1;
            nor.push(p.x / l, p.y / l, p.z / l);
          }
          hue.push(h);
          flat.push(isFacet ? 1 : 0);
        }
      }
    }

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('aHue', new THREE.Float32BufferAttribute(hue, 1));
    g.setAttribute('aFlat', new THREE.Float32BufferAttribute(flat, 1));
    g.computeBoundingSphere();
    return g;
  };

  /* 削った面の一覧（光の模様＝コースティクスの発生源になる） */
  ConvexSolid.prototype.facets = function () {
    var list = [];
    for (var i = 0; i < this.faces.length; i++) {
      var f = this.faces[i];
      if (!f.tag || f.tag.kind !== 'facet') continue;
      list.push({
        id: f.tag.id,
        hue: f.tag.hue,
        center: f.centroid(),
        normal: f.n.clone(),
        area: f.area()
      });
    }
    return list;
  };

  window.ConvexSolid = ConvexSolid;
})();
