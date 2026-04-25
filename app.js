const $ = (selector) => document.querySelector(selector);

const fileInput = $("#fileInput");
const imageList = $("#imageList");
const canvas = $("#stageCanvas");
const ctx = canvas.getContext("2d");
const emptyState = $("#emptyState");
const imageTitle = $("#imageTitle");
const imageMeta = $("#imageMeta");
const gridModeBtn = $("#gridModeBtn");
const freeModeBtn = $("#freeModeBtn");
const gridPanel = $("#gridPanel");
const freePanel = $("#freePanel");
const rowInput = $("#rowInput");
const colInput = $("#colInput");
const addSliceBtn = $("#addSliceBtn");
const clearSlicesBtn = $("#clearSlicesBtn");
const exportBtn = $("#exportBtn");
const exportStatus = $("#exportStatus");
const prefixInput = $("#prefixInput");
const formatSelect = $("#formatSelect");
const fitBtn = $("#fitBtn");
const resetBtn = $("#resetBtn");

const HIT = 12;
const MIN_SIZE = 24;

const state = {
  images: [],
  activeIndex: -1,
  mode: "grid",
  rows: 2,
  cols: 2,
  view: { x: 0, y: 0, w: 0, h: 0, scale: 1 },
  drag: null,
  activeSlice: -1,
};

fileInput.addEventListener("change", async (event) => {
  const files = [...event.target.files].filter((file) => file.type.startsWith("image/"));
  for (const file of files) await addImage(file);
  if (state.activeIndex < 0 && state.images.length) setActiveImage(0);
  renderImageList();
  draw();
});

gridModeBtn.addEventListener("click", () => setMode("grid"));
freeModeBtn.addEventListener("click", () => setMode("free"));
rowInput.addEventListener("input", updateGridFromInputs);
colInput.addEventListener("input", updateGridFromInputs);
addSliceBtn.addEventListener("click", addFreeSlice);
clearSlicesBtn.addEventListener("click", clearFreeSlices);
fitBtn.addEventListener("click", fitImage);
resetBtn.addEventListener("click", resetCurrentImage);
exportBtn.addEventListener("click", exportSlices);

document.querySelectorAll(".grid-preset").forEach((button) => {
  button.addEventListener("click", () => {
    const size = Number(button.dataset.size);
    state.rows = size;
    state.cols = size;
    rowInput.value = size;
    colInput.value = size;
    setPresetActive();
    const image = getActiveImage();
    if (image) image.grid = createGrid(size, size);
    draw();
  });
});

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("lostpointercapture", endDrag);

window.addEventListener("resize", () => {
  resizeCanvas();
  fitImage();
});

resizeCanvas();
draw();

async function addImage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  state.images.push({
    id: crypto.randomUUID(),
    file,
    url,
    img,
    grid: createGrid(state.rows, state.cols),
    freeSlices: [],
  });
}

function createGrid(rows, cols) {
  return {
    rows,
    cols,
    left: 0.05,
    top: 0.05,
    right: 0.95,
    bottom: 0.95,
    colsAt: Array.from({ length: Math.max(0, cols - 1) }, (_, i) => (i + 1) / cols),
    rowsAt: Array.from({ length: Math.max(0, rows - 1) }, (_, i) => (i + 1) / rows),
  };
}

function setActiveImage(index) {
  state.activeIndex = index;
  state.activeSlice = -1;
  const image = getActiveImage();
  if (!image) return;
  imageTitle.textContent = image.file.name;
  imageMeta.textContent = `${image.img.naturalWidth} x ${image.img.naturalHeight}px`;
  renderImageList();
  fitImage();
}

function renderImageList() {
  imageList.innerHTML = "";
  state.images.forEach((image, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `image-item ${index === state.activeIndex ? "active" : ""}`;
    button.innerHTML = `
      <img src="${image.url}" alt="" />
      <span>
        <strong>${escapeHtml(image.file.name)}</strong>
        <small>${image.img.naturalWidth} x ${image.img.naturalHeight}</small>
      </span>
    `;
    button.addEventListener("click", () => setActiveImage(index));
    imageList.append(button);
  });
}

function setMode(mode) {
  state.mode = mode;
  gridModeBtn.classList.toggle("active", mode === "grid");
  freeModeBtn.classList.toggle("active", mode === "free");
  gridPanel.classList.toggle("hidden", mode !== "grid");
  freePanel.classList.toggle("hidden", mode !== "free");
  canvas.style.cursor = "default";
  draw();
}

function updateGridFromInputs() {
  state.rows = clamp(Number(rowInput.value) || 1, 1, 12);
  state.cols = clamp(Number(colInput.value) || 1, 1, 12);
  rowInput.value = state.rows;
  colInput.value = state.cols;
  setPresetActive();
  const image = getActiveImage();
  if (image) image.grid = createGrid(state.rows, state.cols);
  draw();
}

function setPresetActive() {
  document.querySelectorAll(".grid-preset").forEach((button) => {
    const size = Number(button.dataset.size);
    button.classList.toggle("active", state.rows === size && state.cols === size);
  });
}

function resizeCanvas() {
  const wrap = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(wrap.width * dpr));
  canvas.height = Math.max(1, Math.round(wrap.height * dpr));
  canvas.style.width = `${wrap.width}px`;
  canvas.style.height = `${wrap.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function fitImage() {
  const image = getActiveImage();
  if (!image) {
    draw();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const pad = 36;
  const scale = Math.min(
    (rect.width - pad * 2) / image.img.naturalWidth,
    (rect.height - pad * 2) / image.img.naturalHeight,
  );
  state.view.scale = Math.max(0.02, scale);
  state.view.w = image.img.naturalWidth * state.view.scale;
  state.view.h = image.img.naturalHeight * state.view.scale;
  state.view.x = (rect.width - state.view.w) / 2;
  state.view.y = (rect.height - state.view.h) / 2;
  draw();
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  const image = getActiveImage();
  if (!image) {
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image.img, state.view.x, state.view.y, state.view.w, state.view.h);

  ctx.strokeStyle = "rgba(23, 32, 51, 0.28)";
  ctx.lineWidth = 1;
  ctx.strokeRect(state.view.x, state.view.y, state.view.w, state.view.h);

  if (state.mode === "grid") drawGrid(image);
  if (state.mode === "free") drawFreeSlices(image);
}

function drawGrid(image) {
  const box = gridBoxToScreen(image.grid);
  shadeOutside(box);

  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.w, box.h);

  ctx.strokeStyle = "#0f8b8d";
  ctx.lineWidth = 2;
  for (const t of image.grid.colsAt) {
    const x = box.x + box.w * t;
    line(x, box.y, x, box.y + box.h);
  }
  for (const t of image.grid.rowsAt) {
    const y = box.y + box.h * t;
    line(box.x, y, box.x + box.w, y);
  }
  drawHandles(box);
  ctx.restore();
}

function drawFreeSlices(image) {
  ctx.save();
  ctx.fillStyle = "rgba(10, 20, 35, 0.34)";
  ctx.fillRect(state.view.x, state.view.y, state.view.w, state.view.h);

  image.freeSlices.forEach((slice, index) => {
    const box = imageRectToScreen(slice, image);
    ctx.clearRect(box.x, box.y, box.w, box.h);
    ctx.drawImage(image.img, slice.x, slice.y, slice.w, slice.h, box.x, box.y, box.w, box.h);
    ctx.strokeStyle = index === state.activeSlice ? "#ef8f36" : "#0f8b8d";
    ctx.lineWidth = index === state.activeSlice ? 3 : 2;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    drawHandles(box);
    drawLabel(box, index + 1);
  });
  ctx.restore();
}

function drawHandles(box) {
  const points = [
    [box.x, box.y],
    [box.x + box.w, box.y],
    [box.x, box.y + box.h],
    [box.x + box.w, box.y + box.h],
  ];
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#172033";
  ctx.lineWidth = 1.5;
  for (const [x, y] of points) {
    ctx.beginPath();
    ctx.rect(x - 6, y - 6, 12, 12);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawLabel(box, label) {
  ctx.save();
  ctx.fillStyle = "rgba(23, 32, 51, 0.9)";
  ctx.fillRect(box.x, box.y, 28, 23);
  ctx.fillStyle = "#fff";
  ctx.font = "700 13px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(label), box.x + 14, box.y + 12);
  ctx.restore();
}

function shadeOutside(box) {
  ctx.save();
  ctx.fillStyle = "rgba(10, 20, 35, 0.34)";
  ctx.beginPath();
  ctx.rect(state.view.x, state.view.y, state.view.w, state.view.h);
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.fill("evenodd");
  ctx.restore();
}

function line(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function onPointerDown(event) {
  const image = getActiveImage();
  if (!image) return;
  event.preventDefault();
  const point = eventPoint(event);
  canvas.setPointerCapture(event.pointerId);

  state.drag = state.mode === "grid" ? hitGrid(point, image) : hitFree(point, image);

  if (state.mode === "free") {
    if (state.drag?.index !== undefined) state.activeSlice = state.drag.index;
    if (!state.drag && isInsideImage(point)) {
      const slice = makeSliceAt(point, image);
      image.freeSlices.push(slice);
      state.activeSlice = image.freeSlices.length - 1;
      state.drag = {
        type: "slice-move",
        index: state.activeSlice,
        dx: slice.w / 2,
        dy: slice.h / 2,
      };
    }
  }
  draw();
}

function onPointerMove(event) {
  const image = getActiveImage();
  const point = eventPoint(event);
  if (!image) return;

  if (!state.drag) {
    const hit = state.mode === "grid" ? hitGrid(point, image) : hitFree(point, image);
    canvas.style.cursor = cursorForHit(hit, state.mode === "free" && isInsideImage(point));
    return;
  }

  event.preventDefault();
  if (state.mode === "grid") moveGrid(point, image);
  if (state.mode === "free") moveFreeSlice(point, image);
  draw();
}

function endDrag(event) {
  if (event?.pointerId !== undefined && canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  state.drag = null;
}

function hitGrid(point, image) {
  const grid = image.grid;
  const box = gridBoxToScreen(grid);
  const corner = hitCorner(point, box);
  if (corner) return { type: "grid-resize", corner };
  const edge = hitEdge(point, box);
  if (edge) return { type: "grid-resize", edge };

  for (let i = 0; i < grid.colsAt.length; i += 1) {
    const x = box.x + box.w * grid.colsAt[i];
    if (Math.abs(point.x - x) <= HIT && point.y >= box.y && point.y <= box.y + box.h) {
      return { type: "grid-col", index: i };
    }
  }
  for (let i = 0; i < grid.rowsAt.length; i += 1) {
    const y = box.y + box.h * grid.rowsAt[i];
    if (Math.abs(point.y - y) <= HIT && point.x >= box.x && point.x <= box.x + box.w) {
      return { type: "grid-row", index: i };
    }
  }
  if (insideBox(point, box)) {
    return {
      type: "grid-move",
      start: point,
      original: { left: grid.left, top: grid.top, right: grid.right, bottom: grid.bottom },
    };
  }
  return null;
}

function hitFree(point, image) {
  for (let index = image.freeSlices.length - 1; index >= 0; index -= 1) {
    const box = imageRectToScreen(image.freeSlices[index], image);
    const corner = hitCorner(point, box);
    if (corner) return { type: "slice-resize", index, corner };
    const edge = hitEdge(point, box);
    if (edge) return { type: "slice-resize", index, edge };
    if (insideBox(point, box)) {
      const imgPoint = screenToImage(point, image);
      const slice = image.freeSlices[index];
      return { type: "slice-move", index, dx: imgPoint.x - slice.x, dy: imgPoint.y - slice.y };
    }
  }
  return null;
}

function moveGrid(point, image) {
  const grid = image.grid;
  const drag = state.drag;
  const ratio = screenToRatio(point);
  const minGap = 0.03;

  if (drag.type === "grid-resize") {
    const handle = drag.corner || drag.edge;
    if (handle.includes("w")) grid.left = clamp(ratio.x, 0, grid.right - 0.06);
    if (handle.includes("e")) grid.right = clamp(ratio.x, grid.left + 0.06, 1);
    if (handle.includes("n")) grid.top = clamp(ratio.y, 0, grid.bottom - 0.06);
    if (handle.includes("s")) grid.bottom = clamp(ratio.y, grid.top + 0.06, 1);
    return;
  }

  const box = gridBoxToScreen(grid);
  if (drag.type === "grid-col") {
    const min = drag.index === 0 ? minGap : grid.colsAt[drag.index - 1] + minGap;
    const max = drag.index === grid.colsAt.length - 1 ? 1 - minGap : grid.colsAt[drag.index + 1] - minGap;
    grid.colsAt[drag.index] = clamp((point.x - box.x) / box.w, min, max);
    return;
  }
  if (drag.type === "grid-row") {
    const min = drag.index === 0 ? minGap : grid.rowsAt[drag.index - 1] + minGap;
    const max = drag.index === grid.rowsAt.length - 1 ? 1 - minGap : grid.rowsAt[drag.index + 1] - minGap;
    grid.rowsAt[drag.index] = clamp((point.y - box.y) / box.h, min, max);
    return;
  }
  if (drag.type === "grid-move") {
    const dx = (point.x - drag.start.x) / state.view.w;
    const dy = (point.y - drag.start.y) / state.view.h;
    const w = drag.original.right - drag.original.left;
    const h = drag.original.bottom - drag.original.top;
    grid.left = clamp(drag.original.left + dx, 0, 1 - w);
    grid.right = grid.left + w;
    grid.top = clamp(drag.original.top + dy, 0, 1 - h);
    grid.bottom = grid.top + h;
  }
}

function moveFreeSlice(point, image) {
  const drag = state.drag;
  const slice = image.freeSlices[drag.index];
  if (!slice) return;

  const p = screenToImage(point, image);
  if (drag.type === "slice-move") {
    slice.x = clamp(p.x - drag.dx, 0, image.img.naturalWidth - slice.w);
    slice.y = clamp(p.y - drag.dy, 0, image.img.naturalHeight - slice.h);
    return;
  }

  const handle = drag.corner || drag.edge;
  const oldRight = slice.x + slice.w;
  const oldBottom = slice.y + slice.h;

  if (handle.includes("w")) {
    const nextX = clamp(p.x, 0, oldRight - MIN_SIZE);
    slice.x = nextX;
    slice.w = oldRight - nextX;
  }
  if (handle.includes("e")) {
    slice.w = clamp(p.x - slice.x, MIN_SIZE, image.img.naturalWidth - slice.x);
  }
  if (handle.includes("n")) {
    const nextY = clamp(p.y, 0, oldBottom - MIN_SIZE);
    slice.y = nextY;
    slice.h = oldBottom - nextY;
  }
  if (handle.includes("s")) {
    slice.h = clamp(p.y - slice.y, MIN_SIZE, image.img.naturalHeight - slice.y);
  }
}

function addFreeSlice() {
  const image = getActiveImage();
  if (!image) return;
  const baseW = Math.max(MIN_SIZE, Math.round(image.img.naturalWidth * 0.34));
  const baseH = Math.max(MIN_SIZE, Math.round(image.img.naturalHeight * 0.34));
  const offset = image.freeSlices.length * 28;
  const x = clamp(Math.round((image.img.naturalWidth - baseW) / 2 + offset), 0, image.img.naturalWidth - baseW);
  const y = clamp(Math.round((image.img.naturalHeight - baseH) / 2 + offset), 0, image.img.naturalHeight - baseH);
  image.freeSlices.push({ x, y, w: baseW, h: baseH });
  state.activeSlice = image.freeSlices.length - 1;
  setMode("free");
  draw();
}

function clearFreeSlices() {
  const image = getActiveImage();
  if (!image) return;
  image.freeSlices = [];
  state.activeSlice = -1;
  draw();
}

function resetCurrentImage() {
  const image = getActiveImage();
  if (!image) return;
  image.grid = createGrid(state.rows, state.cols);
  image.freeSlices = [];
  state.activeSlice = -1;
  fitImage();
}

async function exportSlices() {
  if (!state.images.length) {
    setStatus("Please choose images first.");
    return;
  }

  const format = formatSelect.value;
  const ext = format === "image/jpeg" ? "jpg" : format.split("/")[1];
  const prefix = sanitizeName(prefixInput.value.trim() || "slice");
  const canPickFolder = "showDirectoryPicker" in window;
  let directory = null;

  if (canPickFolder) {
    try {
      directory = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch {
      setStatus("Folder selection cancelled.");
      return;
    }
  }

  let count = 0;
  for (let imageIndex = 0; imageIndex < state.images.length; imageIndex += 1) {
    const image = state.images[imageIndex];
    const regions = state.mode === "grid" ? getGridRegions(image) : getFreeRegions(image);
    for (let regionIndex = 0; regionIndex < regions.length; regionIndex += 1) {
      const blob = await cropToBlob(image, regions[regionIndex], format);
      const name = `${prefix}_${pad(imageIndex + 1)}_${pad(regionIndex + 1)}.${ext}`;
      if (directory) {
        const handle = await directory.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        downloadBlob(blob, name);
        await sleep(80);
      }
      count += 1;
      setStatus(`Exported ${count} images...`);
    }
  }

  setStatus(directory ? `Done. Saved ${count} images to the selected folder.` : `Done. Downloaded ${count} images.`);
}

function getGridRegions(image) {
  const grid = image.grid;
  const xs = [
    grid.left,
    ...grid.colsAt.map((t) => grid.left + (grid.right - grid.left) * t),
    grid.right,
  ];
  const ys = [
    grid.top,
    ...grid.rowsAt.map((t) => grid.top + (grid.bottom - grid.top) * t),
    grid.bottom,
  ];
  const regions = [];
  for (let r = 0; r < grid.rows; r += 1) {
    for (let c = 0; c < grid.cols; c += 1) {
      regions.push({
        x: Math.round(xs[c] * image.img.naturalWidth),
        y: Math.round(ys[r] * image.img.naturalHeight),
        w: Math.max(1, Math.round((xs[c + 1] - xs[c]) * image.img.naturalWidth)),
        h: Math.max(1, Math.round((ys[r + 1] - ys[r]) * image.img.naturalHeight)),
      });
    }
  }
  return regions;
}

function getFreeRegions(image) {
  if (!image.freeSlices.length) {
    return [{ x: 0, y: 0, w: image.img.naturalWidth, h: image.img.naturalHeight }];
  }
  return image.freeSlices.map((slice) => normalizeSlice(slice, image));
}

async function cropToBlob(image, region, format) {
  const output = document.createElement("canvas");
  output.width = Math.max(1, Math.round(region.w));
  output.height = Math.max(1, Math.round(region.h));
  const outputCtx = output.getContext("2d");
  outputCtx.imageSmoothingQuality = "high";
  outputCtx.drawImage(image.img, region.x, region.y, region.w, region.h, 0, 0, output.width, output.height);
  return new Promise((resolve) => output.toBlob(resolve, format, format === "image/jpeg" ? 0.94 : undefined));
}

function makeSliceAt(point, image) {
  const p = screenToImage(point, image);
  const w = Math.max(MIN_SIZE, Math.round(image.img.naturalWidth * 0.28));
  const h = Math.max(MIN_SIZE, Math.round(image.img.naturalHeight * 0.28));
  return {
    x: clamp(Math.round(p.x - w / 2), 0, image.img.naturalWidth - w),
    y: clamp(Math.round(p.y - h / 2), 0, image.img.naturalHeight - h),
    w,
    h,
  };
}

function gridBoxToScreen(grid) {
  return {
    x: state.view.x + grid.left * state.view.w,
    y: state.view.y + grid.top * state.view.h,
    w: (grid.right - grid.left) * state.view.w,
    h: (grid.bottom - grid.top) * state.view.h,
  };
}

function imageRectToScreen(slice, image) {
  return {
    x: state.view.x + (slice.x / image.img.naturalWidth) * state.view.w,
    y: state.view.y + (slice.y / image.img.naturalHeight) * state.view.h,
    w: (slice.w / image.img.naturalWidth) * state.view.w,
    h: (slice.h / image.img.naturalHeight) * state.view.h,
  };
}

function screenToRatio(point) {
  return {
    x: clamp((point.x - state.view.x) / state.view.w, 0, 1),
    y: clamp((point.y - state.view.y) / state.view.h, 0, 1),
  };
}

function screenToImage(point, image) {
  const ratio = screenToRatio(point);
  return {
    x: ratio.x * image.img.naturalWidth,
    y: ratio.y * image.img.naturalHeight,
  };
}

function hitCorner(point, box) {
  const corners = [
    ["nw", box.x, box.y],
    ["ne", box.x + box.w, box.y],
    ["sw", box.x, box.y + box.h],
    ["se", box.x + box.w, box.y + box.h],
  ];
  for (const [name, x, y] of corners) {
    if (Math.abs(point.x - x) <= HIT && Math.abs(point.y - y) <= HIT) return name;
  }
  return null;
}

function hitEdge(point, box) {
  const nearLeft = Math.abs(point.x - box.x) <= HIT;
  const nearRight = Math.abs(point.x - (box.x + box.w)) <= HIT;
  const nearTop = Math.abs(point.y - box.y) <= HIT;
  const nearBottom = Math.abs(point.y - (box.y + box.h)) <= HIT;
  const withinX = point.x >= box.x - HIT && point.x <= box.x + box.w + HIT;
  const withinY = point.y >= box.y - HIT && point.y <= box.y + box.h + HIT;
  if (nearLeft && withinY) return "w";
  if (nearRight && withinY) return "e";
  if (nearTop && withinX) return "n";
  if (nearBottom && withinX) return "s";
  return null;
}

function cursorForHit(hit, canCreate) {
  if (!hit) return canCreate ? "crosshair" : "default";
  const handle = hit.corner || hit.edge || "";
  if (handle === "nw" || handle === "se") return "nwse-resize";
  if (handle === "ne" || handle === "sw") return "nesw-resize";
  if (handle === "w" || handle === "e") return "ew-resize";
  if (handle === "n" || handle === "s") return "ns-resize";
  if (hit.type === "grid-col") return "col-resize";
  if (hit.type === "grid-row") return "row-resize";
  return "move";
}

function eventPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function insideBox(point, box) {
  return point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;
}

function isInsideImage(point) {
  return insideBox(point, { x: state.view.x, y: state.view.y, w: state.view.w, h: state.view.h });
}

function normalizeSlice(slice, image) {
  const x = clamp(Math.round(slice.x), 0, image.img.naturalWidth - 1);
  const y = clamp(Math.round(slice.y), 0, image.img.naturalHeight - 1);
  return {
    x,
    y,
    w: clamp(Math.round(slice.w), 1, image.img.naturalWidth - x),
    h: clamp(Math.round(slice.h), 1, image.img.naturalHeight - y),
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getActiveImage() {
  return state.images[state.activeIndex] || null;
}

function setStatus(message) {
  exportStatus.textContent = message;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function sanitizeName(name) {
  return name.replace(/[\\/:*?"<>|]+/g, "_");
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
