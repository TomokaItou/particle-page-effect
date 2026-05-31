const canvas = document.querySelector("#stage");
const ctx = canvas.getContext("2d", { alpha: false });

const ui = {
  imageInput: document.querySelector("#imageInput"),
  playBtn: document.querySelector("#playBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  downloadBtn: document.querySelector("#downloadBtn"),
  progress: document.querySelector("#progress"),
  pixelSize: document.querySelector("#pixelSize"),
  scatter: document.querySelector("#scatter"),
  rotation: document.querySelector("#rotation"),
  wave: document.querySelector("#wave"),
  density: document.querySelector("#density"),
  invert: document.querySelector("#invert"),
  edgeBoost: document.querySelector("#edgeBoost"),
  randomDrift: document.querySelector("#randomDrift"),
  status: document.querySelector("#status"),
  particleCount: document.querySelector("#particleCount"),
};

const outputs = {
  progress: document.querySelector("#progressValue"),
  pixelSize: document.querySelector("#pixelSizeValue"),
  scatter: document.querySelector("#scatterValue"),
  rotation: document.querySelector("#rotationValue"),
  wave: document.querySelector("#waveValue"),
  density: document.querySelector("#densityValue"),
};

let particles = [];
let sourceImage = null;
let playing = false;
let lastTime = 0;
let resizeFrame = 0;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function settings() {
  return {
    progress: Number(ui.progress.value) / 100,
    pixelSize: Number(ui.pixelSize.value),
    scatter: Number(ui.scatter.value),
    rotation: (Number(ui.rotation.value) * Math.PI) / 180,
    wave: Number(ui.wave.value) / 100,
    density: Number(ui.density.value) / 100,
    invert: ui.invert.checked,
    edgeBoost: ui.edgeBoost.checked,
    randomDrift: ui.randomDrift.checked,
  };
}

function updateOutputs() {
  outputs.progress.value = `${ui.progress.value}%`;
  outputs.pixelSize.value = ui.pixelSize.value;
  outputs.scatter.value = ui.scatter.value;
  outputs.rotation.value = `${ui.rotation.value}°`;
  outputs.wave.value = (Number(ui.wave.value) / 100).toFixed(2);
  outputs.density.value = `${ui.density.value}%`;
}

function sizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * scale));
  canvas.height = Math.max(1, Math.round(rect.height * scale));
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  render();
}

function makeDefaultPage() {
  const page = document.createElement("canvas");
  page.width = 840;
  page.height = 1080;
  const pctx = page.getContext("2d");
  pctx.fillStyle = "#f8f4e9";
  pctx.fillRect(0, 0, page.width, page.height);
  pctx.fillStyle = "#24211c";
  pctx.font = "700 64px serif";
  pctx.fillText("粒子书页实验", 110, 145);
  pctx.font = "30px serif";
  const lines = [
    "把一页文字先压成黑白像素，",
    "再让每一个像素块有自己的方向、",
    "速度、延迟和旋转。",
    "",
    "拖动参数时，画面会像纸页被风拆开。",
    "反相可以得到更像底片的视觉。",
    "波浪延迟决定它从左到右散开的节奏。",
  ];
  lines.forEach((line, index) => pctx.fillText(line, 112, 245 + index * 58));
  pctx.fillRect(110, 770, 620, 8);
  pctx.font = "24px serif";
  pctx.fillText("prototype / canvas particles", 110, 840);
  return page;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function reseedParticles() {
  if (!sourceImage) return;
  const cfg = settings();
  const work = document.createElement("canvas");
  const maxSide = 760;
  const ratio = Math.min(maxSide / sourceImage.width, maxSide / sourceImage.height, 1);
  work.width = Math.max(1, Math.round(sourceImage.width * ratio));
  work.height = Math.max(1, Math.round(sourceImage.height * ratio));

  const wctx = work.getContext("2d", { willReadFrequently: true });
  wctx.drawImage(sourceImage, 0, 0, work.width, work.height);
  const image = wctx.getImageData(0, 0, work.width, work.height);
  const data = image.data;
  const centerX = work.width / 2;
  const centerY = work.height / 2;
  const next = [];

  for (let y = 0; y < work.height; y += cfg.pixelSize) {
    for (let x = 0; x < work.width; x += cfg.pixelSize) {
      const i = (Math.floor(y) * work.width + Math.floor(x)) * 4;
      const luminance = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const ink = cfg.invert ? luminance / 255 : 1 - luminance / 255;
      const keepChance = cfg.edgeBoost ? clamp(ink * 1.55, 0, 1) : 1;
      const stableNoise = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
      if (stableNoise > cfg.density * keepChance) continue;

      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.hypot(dx, dy) || 1;
      const angle = Math.atan2(dy, dx);
      const swirl = Math.sin((x + y) * 0.02) * 0.85;
      const drift = cfg.randomDrift ? (stableNoise - 0.5) * Math.PI * 1.2 : 0;
      const outAngle = angle + swirl + drift;
      const strength = 0.48 + ink * 0.9 + stableNoise * 0.45;

      next.push({
        x,
        y,
        size: cfg.pixelSize,
        gray: cfg.invert ? 255 - luminance : luminance,
        alpha: clamp(0.25 + ink * 1.15, 0.15, 1),
        tx: Math.cos(outAngle) * cfg.scatter * strength + dx * 0.25,
        ty: Math.sin(outAngle) * cfg.scatter * strength + dy * 0.18,
        spin: (stableNoise - 0.5) * cfg.rotation,
        delay: cfg.wave * (x / work.width) * 0.75 + stableNoise * cfg.wave * 0.25,
      });
    }
  }

  particles = next;
  ui.particleCount.textContent = particles.length.toLocaleString("zh-CN");
  ui.status.textContent = `已采样 ${particles.length.toLocaleString("zh-CN")} 个粒子。`;
  render();
}

function render() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const cfg = settings();
  ctx.fillStyle = "#efeae0";
  ctx.fillRect(0, 0, width, height);

  if (!particles.length) {
    ctx.fillStyle = "#756d61";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("上传图片或等待默认书页生成", width / 2, height / 2);
    return;
  }

  const pageWidth = Math.max(...particles.map((p) => p.x)) + cfg.pixelSize;
  const pageHeight = Math.max(...particles.map((p) => p.y)) + cfg.pixelSize;
  const scale = Math.min((width - 72) / pageWidth, (height - 72) / pageHeight, 1.35);
  const offsetX = (width - pageWidth * scale) / 2;
  const offsetY = (height - pageHeight * scale) / 2;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  for (const p of particles) {
    const localT = clamp((cfg.progress - p.delay) / Math.max(0.12, 1 - p.delay), 0, 1);
    const t = easeInOutCubic(localT);
    const x = p.x + p.tx * t;
    const y = p.y + p.ty * t;
    const rot = p.spin * t;
    const size = p.size * (1 - t * 0.38);
    const gray = Math.round(cfg.invert ? 255 - p.gray : p.gray);

    ctx.save();
    ctx.translate(x + p.size / 2, y + p.size / 2);
    ctx.rotate(rot);
    ctx.globalAlpha = p.alpha * (1 - t * 0.15);
    ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  }

  ctx.restore();
}

function tick(now) {
  if (!playing) return;
  const delta = Math.min(64, now - lastTime);
  lastTime = now;
  const next = Number(ui.progress.value) + delta * 0.035;
  ui.progress.value = next >= 100 ? 100 : String(next);
  if (next >= 100) {
    playing = false;
    ui.playBtn.textContent = "播放";
  }
  updateOutputs();
  render();
  requestAnimationFrame(tick);
}

function setPlaying(value) {
  playing = value;
  ui.playBtn.textContent = playing ? "暂停" : "播放";
  lastTime = performance.now();
  if (playing) requestAnimationFrame(tick);
}

for (const input of [
  ui.progress,
  ui.scatter,
  ui.rotation,
  ui.wave,
  ui.invert,
  ui.edgeBoost,
  ui.randomDrift,
]) {
  input.addEventListener("input", () => {
    updateOutputs();
    render();
  });
}

for (const input of [ui.pixelSize, ui.density]) {
  input.addEventListener("input", () => {
    updateOutputs();
    reseedParticles();
  });
}

ui.imageInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  sourceImage = await loadImageFromFile(file);
  ui.status.textContent = `已载入：${file.name}`;
  ui.progress.value = 0;
  updateOutputs();
  reseedParticles();
});

ui.playBtn.addEventListener("click", () => {
  if (Number(ui.progress.value) >= 100) ui.progress.value = 0;
  setPlaying(!playing);
});

ui.resetBtn.addEventListener("click", () => {
  setPlaying(false);
  ui.progress.value = 0;
  updateOutputs();
  render();
});

ui.downloadBtn.addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "particle-page-frame.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

window.addEventListener("resize", () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(sizeCanvas);
});

sourceImage = makeDefaultPage();
updateOutputs();
sizeCanvas();
reseedParticles();
