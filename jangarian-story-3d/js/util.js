/* ===== じゃんがりあん ものがたり : 小さな道具箱 ===== */
window.JG = window.JG || {};

JG.U = {
  clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
  lerp: function (a, b, t) { return a + (b - a) * t; },
  // 角度の最短経路補間
  lerpAngle: function (a, b, t) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  },
  rand: function (a, b) { return a + Math.random() * (b - a); },
  randInt: function (a, b) { return Math.floor(JG.U.rand(a, b + 1)); },
  pick: function (arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  dist2d: function (ax, az, bx, bz) {
    var dx = ax - bx, dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
  },
  // フレーム独立の減衰係数 (1 - exp(-k*dt))
  damp: function (k, dt) { return 1 - Math.exp(-k * dt); }
};

// ふるい iOS Safari むけ roundRect ポリフィル
if (window.CanvasRenderingContext2D &&
    !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    if (typeof r === 'number') r = { tl: r, tr: r, br: r, bl: r };
    else r = { tl: r[0] || 0, tr: r[0] || 0, br: r[0] || 0, bl: r[0] || 0 };
    this.moveTo(x + r.tl, y);
    this.lineTo(x + w - r.tr, y);
    this.arcTo(x + w, y, x + w, y + r.tr, r.tr);
    this.lineTo(x + w, y + h - r.br);
    this.arcTo(x + w, y + h, x + w - r.br, y + h, r.br);
    this.lineTo(x + r.bl, y + h);
    this.arcTo(x, y + h, x, y + h - r.bl, r.bl);
    this.lineTo(x, y + r.tl);
    this.arcTo(x, y, x + r.tl, y, r.tl);
    this.closePath();
    return this;
  };
}
