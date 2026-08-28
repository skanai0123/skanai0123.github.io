(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./optics.js"));
  else root.OpticsCamera = factory(root.Optics);
})(typeof window === "undefined" ? this : window, function (O) {
  "use strict";
  const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[c]));
  const number = value => Number(value.toPrecision(5));
  function rgb(wavelength) {
    const color = O.wavelengthColor(wavelength);
    return color.startsWith('#') ? [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255) :
      color.match(/[\d.]+/g).map(Number).map(c => c / 255);
  }
  // Real ray hits, binned along the one sensor dimension present in the 2D
  // model. No invented second image coordinate, PSF, noise or interpolation.
  function capture(camera, detector) {
    if (!camera || camera.type !== 'camera' || !Number.isInteger(camera.pixelCount) || camera.pixelCount < 16 || camera.pixelCount > 1024 ||
        !Number.isFinite(camera.aperture) || camera.aperture < 2 || camera.aperture > 300 ||
        !Number.isFinite(camera.exposure) || camera.exposure < .01 || camera.exposure > 100) throw new Error('カメラ設定が不正です。');
    const width = camera.aperture, pitch = width / camera.pixelCount;
    const pixels = Array.from({ length: camera.pixelCount }, (_, i) => ({ position: -width / 2 + (i + .5) * pitch, power: 0, rgb: [0, 0, 0] }));
    let totalPower = 0, hits = 0, nonvisiblePower = 0;
    for (const sample of camera.enabled ? detector?.samples || [] : []) {
      const { position, power, wavelength } = sample;
      if (![position, power, wavelength].every(Number.isFinite) || power <= 0 || Math.abs(position) > width / 2 + 1e-7) continue;
      // Snap values within round-off of a boundary; include both sensor edges.
      const coordinate = (position + width / 2) / pitch, rounded = Math.round(coordinate);
      const index = Math.min(pixels.length - 1, Math.max(0, Math.floor(Math.abs(coordinate - rounded) < 1e-8 ? rounded : coordinate)));
      const pixel = pixels[index], color = rgb(wavelength);
      pixel.power += power; color.forEach((c, i) => { pixel.rgb[i] += power * c; });
      totalPower += power; hits++;
      if (wavelength < 380 || wavelength > 780) nonvisiblePower += power;
    }
    const peakPower = Math.max(...pixels.map(p => p.power));
    const reference = camera.autoExposure && peakPower > 0 ? peakPower : 1, scale = camera.exposure / reference;
    let clippedPixels = 0;
    for (const pixel of pixels) {
      if (pixel.rgb.some(c => c * scale > 1 + 1e-12)) clippedPixels++;
      pixel.color = 'rgb(' + pixel.rgb.map(c => Math.round(255 * Math.min(1, c * scale))).join(',') + ')';
    }
    return { pixels, width, pitch, totalPower, hits, peakPower, reference, clippedPixels, nonvisiblePower,
      enabled: camera.enabled, exposure: camera.exposure, autoExposure: camera.autoExposure };
  }
  function svg(frame, title = 'カメラ像', unit = 'mm') {
    const scale = { mm: 1, cm: 10, in: 25.4 }[unit] || 1;
    const x = 48, width = 552, column = width / frame.pixels.length;
    const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="450" viewBox="0 0 640 300" role="img">`,
      `<title>${escape(title)}：1Dセンサー像と画素パワー</title>`,
      `<desc>2D光線計算の1列分を縦に拡大した表示。非干渉。受光P ${number(frame.totalPower)}。表示ゲイン ${frame.exposure}。${frame.autoExposure ? '最大画素を基準に自動表示。' : '固定基準P=1。'}グラフの縦軸は最大Pで自動調整。縦方向の像は未計算。</desc>`,
      '<rect width="640" height="300" rx="10" fill="#12242b"/>',
      `<rect x="${x}" y="20" width="${width}" height="88" fill="#000"/>`];
    frame.pixels.forEach((p, i) => {
      if (p.power > 0) parts.push(`<rect x="${x+i*column}" y="20" width="${column}" height="88" fill="${p.color}" shape-rendering="crispEdges"/>`);
    });
    parts.push(`<path d="M ${x} 156 V 260 H ${x+width}" fill="none" stroke="#6c8b92"/>`);
    const points = frame.pixels.map((p, i) => `${x+(i+.5)*column},${260-(frame.peakPower ? p.power/frame.peakPower : 0)*84}`).join(' ');
    parts.push(`<polyline points="${points}" fill="none" stroke="#b8e8db" stroke-width="1.5"/>`,
      `<g fill="#c5d7d9" font-family="sans-serif" font-size="22"><text x="48" y="141">1D センサー像（縦は表示用）</text>`,
      `<text x="48" y="170">P / pixel：最大 ${number(frame.peakPower)}</text>`);
    for (const [fraction, anchor] of [[0,'start'],[.5,'middle'],[1,'end']]) {
      parts.push(`<text x="${x+width*fraction}" y="286" text-anchor="${anchor}">${number((fraction-.5)*frame.width/scale)} ${escape(unit)}</text>`);
    }
    parts.push('</g></svg>'); return parts.join('');
  }
  return Object.freeze({ capture, svg });
});
