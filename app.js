(() => {
  const $ = id => document.getElementById(id);

  const drop     = $('drop');
  const fileEl   = $('file');
  const pickBtn  = $('pick');
  const controls = $('controls');
  const preview  = $('preview');
  const origImg  = $('origImg');
  const newImg   = $('newImg');
  const origMeta = $('origMeta');
  const newMeta  = $('newMeta');
  const quality  = $('quality');
  const qval     = $('qval');
  const noise    = $('noise');
  const nval     = $('nval');
  const widthEl  = $('width');
  const heightEl = $('height');
  const format   = $('format');
  const gray     = $('grayscale');
  const stripall = $('stripall');
  const cleanBtn = $('clean');
  const resetBtn = $('reset');
  const dlWrap   = $('downloadWrap');
  const dlLink   = $('download');

  let srcFile = null;
  let srcImg  = null;

  // live label updates
  quality.addEventListener('input', () => qval.textContent = quality.value);
  noise.addEventListener('input',   () => nval.textContent = (+noise.value).toFixed(1));

  // drag & drop
  ['dragenter','dragover'].forEach(ev =>
    drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); })
  );
  ['dragleave','drop'].forEach(ev =>
    drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); })
  );
  drop.addEventListener('drop', e => {
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  });
  pickBtn.addEventListener('click', () => fileEl.click());
  fileEl.addEventListener('change', () => {
    const f = fileEl.files?.[0];
    if (f) handleFile(f);
  });

  async function handleFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('Not an image.');
      return;
    }
    srcFile = file;
    const url = URL.createObjectURL(file);
    srcImg = await loadImage(url);
    origImg.src = url;
    origMeta.textContent = await describeFile(file);
    controls.hidden = false;
    preview.hidden = false;
    widthEl.placeholder  = srcImg.naturalWidth  + ' (original)';
    heightEl.placeholder = srcImg.naturalHeight + ' (original)';
    // auto-fill on first pick
    if (!widthEl.value)  widthEl.value  = srcImg.naturalWidth;
    if (!heightEl.value) heightEl.value = srcImg.naturalHeight;
  }

  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });
  }

  async function describeFile(file) {
    const parts = [`${file.name}`, `${(file.size/1024).toFixed(1)} KB`, file.type || 'unknown'];
    // Try to peek at EXIF/C2PA presence
    const buf = new Uint8Array(await file.slice(0, 512).arrayBuffer());
    const ascii = new TextDecoder('latin1').decode(buf);
    const tags = [];
    if (ascii.includes('Exif'))     tags.push('EXIF');
    if (ascii.includes('http://ns.adobe.com/xap')) tags.push('XMP');
    if (ascii.includes('c2pa'))     tags.push('C2PA');
    if (ascii.includes('Photoshop'))tags.push('Photoshop');
    if (tags.length) parts.push('has: ' + tags.join(', '));
    return parts.join(' · ');
  }

  // ---- Core: rebuild image from scratch ----
  function rebuild(img, opts) {
    const {
      width, height, grayscale, noiseStrength,
      format, quality
    } = opts;

    const canvas = document.createElement('canvas');
    canvas.width  = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // draw resized
    ctx.drawImage(img, 0, 0, width, height);

    // pixel-level manipulation
    const data = ctx.getImageData(0, 0, width, height);
    const px = data.data;

    if (grayscale) {
      for (let i = 0; i < px.length; i += 4) {
        const y = 0.299*px[i] + 0.587*px[i+1] + 0.114*px[i+2];
        px[i] = px[i+1] = px[i+2] = y;
      }
    }

    if (noiseStrength > 0) {
      // tiny gaussian-ish noise, clamped
      for (let i = 0; i < px.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          // cheap approx gaussian: average of 2 uniforms - 1
          const n = ((Math.random() + Math.random()) - 1) * noiseStrength * 4;
          let v = px[i+c] + n;
          px[i+c] = v < 0 ? 0 : v > 255 ? 255 : v;
        }
      }
    }

    ctx.putImageData(data, 0, 0);

    return canvas;
  }

  function canvasToBlob(canvas, format, quality) {
    return new Promise(resolve => {
      // Quality only applies to lossy formats
      const q = (format === 'image/png') ? undefined : (quality/100);
      canvas.toBlob(b => resolve(b), format, q);
    });
  }

  cleanBtn.addEventListener('click', async () => {
    if (!srcImg) return;

    const w = parseInt(widthEl.value, 10)  || srcImg.naturalWidth;
    const h = parseInt(heightEl.value, 10) || srcImg.naturalHeight;

    const canvas = rebuild(srcImg, {
      width: w,
      height: h,
      grayscale: gray.checked,
      noiseStrength: parseFloat(noise.value) || 0,
      format: format.value,
      quality: parseInt(quality.value, 10)
    });

    const blob = await canvasToBlob(canvas, format.value, parseInt(quality.value, 10));

    // The whole "metadata strip" trick: create a NEW Blob from raw bytes.
    // No metadata is carried over because it's not part of the canvas.
    const clean = new Blob([await blob.arrayBuffer()], { type: blob.type });

    const url = URL.createObjectURL(clean);
    newImg.src = url;
    newMeta.textContent = `${(clean.size/1024).toFixed(1)} KB · ${clean.type} · metadata: none`;

    dlLink.href = url;
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[format.value];
    const base = (srcFile?.name || 'image').replace(/\.[^.]+$/, '');
    dlLink.download = `${base}_clean.${ext}`;
    dlWrap.hidden = false;
  });

  resetBtn.addEventListener('click', () => {
    fileEl.value = '';
    srcFile = null;
    srcImg  = null;
    origImg.removeAttribute('src');
    newImg.removeAttribute('src');
    origMeta.textContent = '';
    newMeta.textContent  = '';
    controls.hidden = true;
    preview.hidden  = true;
    dlWrap.hidden   = true;
  });
})();
