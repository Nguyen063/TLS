/**
 * DRONE SHOW SIMULATOR — HÀO KHÍ NON SÔNG
 * 10,000 sharp drones forming image formations
 * NO TEXT — pure visuals only
 */

(function () {
  'use strict';

  // ===== CONFIGURATION =====
  const CONFIG = {
    DRONE_COUNT: 10000,
    // Sharper rendering
    DRONE_RADIUS: 1.5,         
    GLOW_RADIUS: 2.8,          
    GLOW_ALPHA: 0.1,          
    // Timing
    TRANSITION_DURATION: 3500,
    HOLD_DURATION: 6000,
    // Layout
    IMAGE_SCALE: 0.70,
    IMAGE_Y_OFFSET: 0,
    // Motion
    IDLE_DRIFT: 0.2,
    // Sampling
    SAMPLE_STEP: 1,            // pixel step for extraction
  };

  // ===== ACT DATA (images only) =====
  const ACTS = [
    { image: 'images/ly_dynasty_dragon.png' },
    { image: 'images/tank_gate_crash.png' },
    { image: 'images/gear_handshake.png' },
    { image: 'images/peace_dove.png' },
    { image: 'images/vietnam_map_full.png' },
  ];

  // ===== STATE =====
  let canvas, ctx;
  let drones = [];
  let formations = [];
  let currentAct = 0;
  let isTransitioning = false;
  let transitionStart = 0;
  let isPlaying = true;
  let holdTimer = null;
  let loadedImages = [];

  // ===== DOM =====
  const loadingScreen = document.getElementById('loading-screen');
  const loadingBar = document.getElementById('loading-bar');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const progressDots = document.querySelectorAll('.progress-dot');

  // ===== CANVAS SETUP =====
  function initCanvas() {
    canvas = document.getElementById('drone-canvas');
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', () => {
      resizeCanvas();
      rebuildFormations();
      if (!isTransitioning) {
        assignFormation(currentAct, false);
      }
    });
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ===== IMAGE LOADING & PIXEL EXTRACTION =====
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed: ' + src));
      img.src = src;
    });
  }

  function extractPixels(img) {
    const offCanvas = document.createElement('canvas');
    const offCtx = offCanvas.getContext('2d');

    const maxW = window.innerWidth * CONFIG.IMAGE_SCALE;
    const maxH = window.innerHeight * CONFIG.IMAGE_SCALE;
    const scale = Math.min(maxW / img.width, maxH / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;

    offCanvas.width = img.width;
    offCanvas.height = img.height;
    offCtx.drawImage(img, 0, 0);

    const imageData = offCtx.getImageData(0, 0, img.width, img.height);
    const data = imageData.data;
    const points = [];
    const step = CONFIG.SAMPLE_STEP;

    for (let y = 0; y < img.height; y += step) {
      for (let x = 0; x < img.width; x += step) {
        const idx = (y * img.width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];

        const brightness = (r + g + b) / 3;
        // Chỉ lấy những điểm sáng chói nhất (lõi neon), loại bỏ hoàn toàn dải sáng mờ (glow)
        // Điều này giảm số lượng điểm ảnh, giúp 10,000 drones phân bổ **đậm đặc** hơn.
        if (brightness < 120 || a < 200) continue;

        const canvasX = (x / img.width) * drawW + (window.innerWidth - drawW) / 2;
        const canvasY = (y / img.height) * drawH + (window.innerHeight - drawH) / 2;

        points.push({ x: canvasX, y: canvasY, r, g, b });
      }
    }

    return points;
  }

  function sampleToCount(points, count) {
    if (points.length <= count) return points;
    
    // Khôi phục random sampling để giữ độ dày (volume) của nét vẽ, 
    // không bị dồn cục vào các điểm sáng nhất gây thưa thớt.
    const shuffled = [...points];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
  }

  function rebuildFormations() {
    formations = [];
    for (const img of loadedImages) {
      const pts = extractPixels(img);
      formations.push(sampleToCount(pts, CONFIG.DRONE_COUNT));
    }
  }

  async function loadAllImages() {
    loadedImages = [];
    formations = [];
    for (let i = 0; i < ACTS.length; i++) {
      const img = await loadImage(ACTS[i].image);
      loadedImages.push(img);
      const pts = extractPixels(img);
      formations.push(sampleToCount(pts, CONFIG.DRONE_COUNT));
      loadingBar.style.width = ((i + 1) / ACTS.length * 100) + '%';
    }
  }

  // ===== DRONE =====
  class Drone {
    constructor() {
      this.x = Math.random() * window.innerWidth;
      this.y = Math.random() * window.innerHeight;
      this.tx = this.x;
      this.ty = this.y;
      this.sx = this.x;
      this.sy = this.y;
      this.r = 60; this.g = 60; this.b = 60;
      this.tr = 60; this.tg = 60; this.tb = 60;
      this.sr = 60; this.sg = 60; this.sb = 60;
      this.driftPhase = Math.random() * Math.PI * 2;
      this.driftSpeed = 0.2 + Math.random() * 0.4;
      this.twinklePhase = Math.random() * Math.PI * 2;
      this.twinkleSpeed = 0.8 + Math.random() * 1.5;
    }

    setTarget(x, y, r, g, b) {
      this.sx = this.x; this.sy = this.y;
      this.sr = this.r; this.sg = this.g; this.sb = this.b;
      this.tx = x; this.ty = y;
      this.tr = r; this.tg = g; this.tb = b;
    }

    update(progress, time) {
      const t = easeInOutCubic(Math.min(progress, 1));
      this.x = this.sx + (this.tx - this.sx) * t;
      this.y = this.sy + (this.ty - this.sy) * t;
      this.r = Math.round(this.sr + (this.tr - this.sr) * t);
      this.g = Math.round(this.sg + (this.tg - this.sg) * t);
      this.b = Math.round(this.sb + (this.tb - this.sb) * t);
    }

    draw(ctx, time, settled) {
      let dx = this.x;
      let dy = this.y;

      // Gentle drift when settled
      if (settled) {
        dx += Math.sin(time * 0.001 * this.driftSpeed + this.driftPhase) * CONFIG.IDLE_DRIFT;
        dy += Math.cos(time * 0.0007 * this.driftSpeed + this.driftPhase) * CONFIG.IDLE_DRIFT;
      }

      // Subtle twinkle (keeps brightness high for sharpness)
      const tw = 0.85 + 0.15 * Math.sin(time * 0.001 * this.twinkleSpeed + this.twinklePhase);

      // Tight glow
      ctx.beginPath();
      ctx.arc(dx, dy, CONFIG.GLOW_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.r}, ${this.g}, ${this.b}, ${CONFIG.GLOW_ALPHA * tw})`;
      ctx.fill();

      // Sharp core dot
      ctx.beginPath();
      ctx.arc(dx, dy, CONFIG.DRONE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.r}, ${this.g}, ${this.b}, ${tw})`;
      ctx.fill();
    }
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // ===== FORMATION ASSIGNMENT =====
  function assignFormation(actIndex, animate = true) {
    const formation = formations[actIndex];
    if (!formation) return;

    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    // Sort by angle for smooth cross-path transition
    const sortedF = formation.map(p => ({
      ...p, angle: Math.atan2(p.y - cy, p.x - cx)
    }));
    sortedF.sort((a, b) => a.angle - b.angle);

    const sortedD = drones.map(d => ({
      d, angle: Math.atan2(d.y - cy, d.x - cx)
    }));
    sortedD.sort((a, b) => a.angle - b.angle);

    const count = Math.min(sortedD.length, sortedF.length);
    for (let i = 0; i < count; i++) {
      const target = sortedF[i];
      sortedD[i].d.setTarget(target.x, target.y, target.r, target.g, target.b);
    }

    // Park extra drones off-screen
    for (let i = count; i < sortedD.length; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.max(window.innerWidth, window.innerHeight) * 0.7;
      sortedD[i].d.setTarget(
        cx + Math.cos(angle) * dist,
        cy + Math.sin(angle) * dist,
        15, 15, 20
      );
    }

    if (animate) {
      isTransitioning = true;
      transitionStart = performance.now();
    } else {
      // Snap immediately
      for (const drone of drones) {
        drone.x = drone.tx;
        drone.y = drone.ty;
        drone.r = drone.tr;
        drone.g = drone.tg;
        drone.b = drone.tb;
      }
    }
  }

  function initDrones() {
    drones = [];
    for (let i = 0; i < CONFIG.DRONE_COUNT; i++) {
      drones.push(new Drone());
    }
  }

  // ===== PROGRESS DOTS =====
  function updateDots(actIndex) {
    progressDots.forEach((dot, i) => {
      dot.classList.remove('active', 'completed');
      if (i === actIndex) dot.classList.add('active');
      else if (i < actIndex) dot.classList.add('completed');
    });
  }

  // ===== NAVIGATION =====
  function goToAct(index) {
    if (index < 0 || index >= ACTS.length) return;
    if (holdTimer) clearTimeout(holdTimer);
    currentAct = index;
    updateDots(index);
    assignFormation(index, true);
    if (isPlaying) scheduleNext();
  }

  function scheduleNext() {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      if (!isPlaying) return;
      goToAct((currentAct + 1) % ACTS.length);
    }, CONFIG.TRANSITION_DURATION + CONFIG.HOLD_DURATION);
  }

  // ===== RENDER =====
  function render(time) {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    let progress = 1;
    if (isTransitioning) {
      progress = Math.min((time - transitionStart) / CONFIG.TRANSITION_DURATION, 1);
      if (progress >= 1) isTransitioning = false;
    }

    const settled = !isTransitioning;

    for (const drone of drones) {
      drone.update(progress, time);
      drone.draw(ctx, time, settled);
    }

    requestAnimationFrame(render);
  }

  // ===== CONTROLS =====
  function setupControls() {
    btnNext.addEventListener('click', () => goToAct((currentAct + 1) % ACTS.length));
    btnPrev.addEventListener('click', () => goToAct((currentAct - 1 + ACTS.length) % ACTS.length));

    progressDots.forEach(dot => {
      dot.addEventListener('click', () => goToAct(parseInt(dot.dataset.act)));
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goToAct((currentAct + 1) % ACTS.length);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToAct((currentAct - 1 + ACTS.length) % ACTS.length);
      } else if (e.key === 'p' || e.key === 'P') {
        isPlaying = !isPlaying;
        if (isPlaying) scheduleNext();
        else if (holdTimer) clearTimeout(holdTimer);
      }
    });
  }

  // ===== MAIN =====
  async function main() {
    initCanvas();
    initDrones();

    try {
      await loadAllImages();
    } catch (err) {
      console.error(err);
      return;
    }

    // Hide loading
    loadingBar.style.width = '100%';
    setTimeout(() => loadingScreen.classList.add('hidden'), 300);

    setupControls();

    // Start render
    requestAnimationFrame(render);

    // Start show
    setTimeout(() => goToAct(0), 800);
  }

  main();
})();
