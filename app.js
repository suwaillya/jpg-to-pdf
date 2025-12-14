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

let items = []; // { file, url, w, h }

fileInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  // reset previous
  cleanup();
  items = [];

  for (const file of files) {
    const url = URL.createObjectURL(file);
    const { w, h } = await getImageSize(url);
    items.push({ file, url, w, h });
  }

  render();
  setEnabled(true);
  setStatus(`已載入 ${items.length} 張圖片，可拖曳排序後產生 PDF。`);
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

  // Create initial doc; we'll re-create if using "fit" + auto orientation per page
  let doc = new jsPDF({
    unit: "mm",
    format: pageSize === "fit" ? "a4" : pageSize,
    orientation: orientationSetting === "auto" ? "portrait" : orientationSetting,
    compress: true,
  });

  // We'll handle first page separately to avoid blank page issues
  let firstPage = true;

  for (let i = 0; i < items.length; i++) {
    setStatus(`處理中：${i + 1} / ${items.length}`);

    const { file, url, w, h } = items[i];

    // Convert image to JPEG data URL (also handles PNG)
    const dataUrl = await toJpegDataUrl(url, quality);

    // Decide page format/orientation per page
    let format = pageSize;
    let orient = orientationSetting;

    if (orientationSetting === "auto") {
      orient = w >= h ? "landscape" : "portrait";
    }

    if (pageSize === "fit") {
      // Fit: page exactly matches image aspect ratio (in mm)
      // We'll define page size using a constant pixel->mm ratio via 96dpi assumption,
      // but better: choose a max width then compute height to keep aspect ratio.
      // Here: we use width 210mm for portrait, 297mm for landscape as baseline.
      const baseW = orient === "portrait" ? 210 : 297; // approx A4 width in mm
      const ratio = h / w;
      const fitW = baseW;
      const fitH = fitW * ratio;

      format = [fitW, fitH]; // custom page size in mm
    }

    // Add page (or set first page)
    if (firstPage) {
      // replace first page size/orientation if needed
      doc = new jsPDF({ unit: "mm", format: format, orientation: orient, compress: true });
      firstPage = false;
    } else {
      doc.addPage(format, orient);
    }

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    const usableW = Math.max(1, pageW - marginMm * 2);
    const usableH = Math.max(1, pageH - marginMm * 2);

    // Calculate image draw size preserving aspect ratio
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

function render() {
  grid.innerHTML = "";
  items.forEach((it, idx) => {
    const card = document.createElement("div");
    card.className = "thumb";
    card.draggable = true;
    card.dataset.index = String(idx);

    card.innerHTML = `
      <header>
        <span>#${idx + 1}</span>
        <span title="${escapeHtml(it.file.name)}">${truncate(it.file.name, 18)}</span>
      </header>
      <img src="${it.url}" alt="">
      <div class="meta">${it.w}×${it.h}</div>
    `;

    // drag events
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", card.dataset.index);
      e.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData("text/plain"));
      const to = Number(card.dataset.index);
      if (Number.isNaN(from) || Number.isNaN(to) || from === to) return;
      const moved = items.splice(from, 1)[0];
      items.splice(to, 0, moved);
      render();
    });

    grid.appendChild(card);
  });
}

function cleanup() {
  for (const it of items) {
    try { URL.revokeObjectURL(it.url); } catch {}
  }
}

function setEnabled(enabled) {
  makePdfBtn.disabled = !enabled || items.length === 0;
  clearBtn.disabled = !enabled || items.length === 0;
  fileInput.disabled = !enabled ? false : false; // keep selectable always
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

async function toJpegDataUrl(url, quality) {
  const img = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");

  // White background (avoid PNG transparency turning black)
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);

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
