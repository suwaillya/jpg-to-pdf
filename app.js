const fileInput = document.getElementById("fileInput");
const makePdfBtn = document.getElementById("makePdf");
const clearBtn = document.getElementById("clear");
const statusEl = document.getElementById("status");
const grid = document.getElementById("grid");

const pageSizeEl = document.getElementById("pageSize");
const orientationEl = document.getElementById("orientation");
const marginMmEl = document.getElementById("marginMm");
const qualityEl = document.getElementById("quality");
const pdfNameEl = document.getElementById("pdfName");

let items = []; // { id, file, url, w, h, rot }
let sortable = null;

// ---- Smooth auto-scroll while dragging (speed depends on distance) ----
let dragging = false;
let lastClientY = null;
let rafId = null;

function startAutoScroll() {
  dragging = true;
  const threshold = 120;     // px from top/bottom
  const maxSpeed = 26;       // px per frame (approx)
  const ease = (t) => t * t; // smoother ramp

  const tick = () => {
    if (!dragging || lastClientY == null) return;

    const vh = window.innerHeight;
    const topDist = lastClientY;
    const botDist = vh - lastClientY;

    let dy = 0;
    if (topDist < threshold) {
      const t = (threshold - topDist) / threshold;
      dy = -Math.ceil(maxSpeed * ease(t));
    } else if (botDist < threshold) {
      const t = (threshold - botDist) / threshold;
      dy = Math.ceil(maxSpeed * ease(t));
    }

    if (dy !== 0) window.scrollBy({ top: dy, left: 0, behavior: "auto" });
    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);
}

function stopAutoScroll() {
  dragging = false;
  lastClientY = null;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

// ---- File loading: allow adding more after first selection ----
fileInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  // append (not reset)
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const { w, h } = await getImageSize(url);
    items.push({ id: cryptoId(), file, url, w, h, rot: 0 });
  }

  render();
  setEnabled(true);
  setStatus(`已載入 ${items.length} 張圖片（可繼續加入），可拖曳排序後產生 PDF。`);

  // allow selecting same files again
  fileInput.value = "";
});

clearBtn.addEventListener("click", () => {
  cleanup();
  items = [];
  render();
  setEnabled(false);
  setStatus("已清除。");
  fileInput.value = "";
});

makePdfBtn.addEventListener("click", async () => {
  if (!items.length) return;

  const { jsPDF } = window.jspdf;
  const pageSize = pageSizeEl.value; // a4 | letter | fit
  const orientationSetting = orientationEl.value; // portrait | landscape | auto
  const marginMm = clamp(Number(marginMmEl.value || 0), 0, 30);
  const quality = clamp(Number(qualityEl.value || 0.9), 0.1, 1);
  const pdfName = (pdfNameEl.value || "images.pdf").trim();

  setEnabled(false);
  setStatus("開始產生 PDF…");

  let doc = new jsPDF({
    unit: "mm",
    format: pageSize === "fit" ? "a4" : pageSize,
    orientation: orientationSetting === "auto" ? "portrait" : orientationSetting,
    compress: true,
  });

  let firstPage = true;

  for (let i = 0; i < items.length; i++) {
    setStatus(`處理中：${i + 1} / ${items.length}`);

    const it = items[i];
    const { w, h } = effectiveSize(it);

    const dataUrl = await toJpegDataUrl(it.url, quality, it.rot);

    let format = pageSize;
    let orient = orientationSetting;

    if (orientationSetting === "auto") {
      orient = w >= h ? "landscape" : "portrait";
    }

    if (pageSize === "fit") {
      const baseW = orient === "portrait" ? 210 : 297;
      const ratio = h / w;
      const fitW = baseW;
      const fitH = fitW * ratio;
      format = [fitW, fitH];
    }

    if (firstPage) {
      doc = new jsPDF({ unit: "mm", format: format, orientation: orient, compress: true });
      firstPage = false;
    } else {
      doc.addPage(format, orient);
    }

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    const usableW = Math.max(1, pageW - marginMm * 2);
    const usableH = Math.max(1, pageH - marginMm * 2);

    const imgRatio = h / w;
    let drawW = usableW;
    let drawH = drawW * imgRatio;
    if (drawH > usableH) {
      drawH = usableH;
      drawW = drawH / imgRatio;
    }

    const x = (pageW - drawW) / 2;
    const y = (pageH - drawH) / 2;

    doc.addImage(dataUrl, "JPEG", x, y, drawW, drawH, undefined, "FAST");
  }

  doc.save(pdfName.endsWith(".pdf") ? pdfName : `${pdfName}.pdf`);
  setStatus(`完成！已下載：${pdfName.endsWith(".pdf") ? pdfName : `${pdfName}.pdf`}`);
  setEnabled(true);
});

// ---- Render + SortableJS ----
function render() {
  grid.innerHTML = "";

  items.forEach((it, idx) => {
    const card = document.createElement("div");
    card.className = "thumb";
    card.dataset.id = it.id;

    const displayW = effectiveSize(it).w;
    const displayH = effectiveSize(it).h;

	card.innerHTML = `
	  <header class="thumbHeader">
		<span class="thumbIndex">#${idx + 1}</span>

		<div class="controls">
		  <button class="iconBtn" data-action="rotate" title="旋轉 90°" aria-label="旋轉">
			<svg viewBox="0 0 24 24" class="icon" aria-hidden="true">
			  <path d="M12 5a7 7 0 1 1-6.32 9.98" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
			  <path d="M6 5v5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		  </button>

		  <button class="iconBtn danger" data-action="delete" title="刪除" aria-label="刪除">
			<svg viewBox="0 0 24 24" class="icon" aria-hidden="true">
			  <path d="M6 7h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
			  <path d="M9 7V5h6v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			  <path d="M8 7l1 14h6l1-14" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
			  <path d="M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
			</svg>
		  </button>
		</div>
	  </header>

	  <img src="${it.url}" alt="" style="transform: rotate(${it.rot}deg);">
	  <div class="meta">${displayW}×${displayH}（旋轉：${it.rot}°）</div>
	  <div class="filename" title="${escapeHtml(it.file.name)}">${escapeHtml(it.file.name)}</div>
	`;



    // controls
    card.querySelector("[data-action='delete']").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeById(it.id);
    });
    card.querySelector("[data-action='rotate']").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      rotateById(it.id);
    });

    grid.appendChild(card);
  });

  initSortable();
}

function initSortable() {
  if (sortable) {
    sortable.destroy();
    sortable = null;
  }

  sortable = new Sortable(grid, {
    animation: 170,
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    dragClass: "sortable-drag",
    forceFallback: true,     // better mobile consistency
    fallbackOnBody: true,
    fallbackTolerance: 4,
    onChoose: () => startAutoScroll(),
    onUnchoose: () => stopAutoScroll(),
    onEnd: () => {
      stopAutoScroll();
      // sync items order by DOM order
      const idOrder = Array.from(grid.children).map((el) => el.dataset.id);
      const map = new Map(items.map((x) => [x.id, x]));
      items = idOrder.map((id) => map.get(id)).filter(Boolean);
      // refresh numbering
      render();
    },
    onMove: (evt) => {
      const oe = evt.originalEvent;
      if (oe && typeof oe.clientY === "number") lastClientY = oe.clientY;
      return true;
    },
  });
}

// ---- Mutations ----
function removeById(id) {
  const idx = items.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const [removed] = items.splice(idx, 1);
  try { URL.revokeObjectURL(removed.url); } catch {}
  render();
  setEnabled(items.length > 0);
  setStatus(items.length ? `已刪除 1 張，剩 ${items.length} 張。` : "已清空。");
}

function rotateById(id) {
  const it = items.find((x) => x.id === id);
  if (!it) return;
  it.rot = (it.rot + 90) % 360;
  render();
}

function cleanup() {
  for (const it of items) {
    try { URL.revokeObjectURL(it.url); } catch {}
  }
}

function setEnabled(enabled) {
  makePdfBtn.disabled = !enabled || items.length === 0;
  clearBtn.disabled = !enabled || items.length === 0;
  fileInput.disabled = false; // always allow add more
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

function getImageSize(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = url;
  });
}

function effectiveSize(it) {
  const rot = ((it.rot % 360) + 360) % 360;
  if (rot === 90 || rot === 270) return { w: it.h, h: it.w };
  return { w: it.w, h: it.h };
}

async function toJpegDataUrl(url, quality, rotationDeg) {
  const img = await loadImage(url);

  const rot = ((rotationDeg % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;

  const canvas = document.createElement("canvas");
  canvas.width = swap ? img.naturalHeight : img.naturalWidth;
  canvas.height = swap ? img.naturalWidth : img.naturalHeight;

  const ctx = canvas.getContext("2d");

  // White background (avoid PNG transparency turning black)
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // rotate around center
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rot * Math.PI) / 180);

  // draw image centered
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  return canvas.toDataURL("image/jpeg", quality);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

function cryptoId() {
  // simple unique id without dependencies
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
