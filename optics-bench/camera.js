(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./optics.js"));
  else root.OpticsCamera = factory(root.Optics);
})(typeof window === "undefined" ? this : window, function (O) {
  "use strict";
  const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[c]));
  const number = value => Number(value.toPrecision(5));
  const FALLBACK = Object.freeze({ sensorHeight: 18, pixelRows: 192, spotSize: 1 });
  function rgb(wavelength) {
    const color = O.wavelengthColor(wavelength);
    return color.startsWith('#') ? [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255) :
      color.match(/[\d.]+/g).map(Number).map(c => c / 255);
  }
  function color(values, scale) {
    return 'rgb(' + values.map(c => Math.round(255 * Math.min(1, c * scale))).join(',') + ')';
  }
  function sensorLayout(frame) {
    if (!frame || !Number.isFinite(frame.width) || frame.width <= 0 || !Number.isFinite(frame.height) || frame.height <= 0) {
      throw new Error('センサー寸法が不正です。');
    }
    const maximumWidth = 760, maximumHeight = 430;
    // A single scale is shared by X and Y. One physical millimetre therefore
    // occupies the same SVG length in either direction, even for non-square
    // sensors or non-square pixel pitches.
    const scale = Math.min(maximumWidth / frame.width, maximumHeight / frame.height);
    const width = frame.width * scale, height = frame.height * scale;
    return { x: 100 + (maximumWidth - width) / 2, y: 72 + (maximumHeight - height) / 2, width, height, scale };
  }
  function normalizedKernel(count, pitch, sigma, center) {
    const weights = new Float64Array(count);
    const radius = Math.max(1, Math.ceil(3 * sigma / pitch));
    const first = Math.max(0, center - radius), last = Math.min(count - 1, center + radius);
    let sum = 0;
    for (let i = first; i <= last; i++) {
      const distance = (i - center) * pitch;
      weights[i] = Math.exp(-.5 * distance * distance / (sigma * sigma));
      sum += weights[i];
    }
    if (sum <= 0) weights[Math.max(0, Math.min(count - 1, center))] = 1;
    else for (let i = first; i <= last; i++) weights[i] /= sum;
    return weights;
  }
  // The exact horizontal bins remain in `pixels` for compatibility. Camera
  // samples may also carry a paraxial vertical position, used by luminous
  // screen targets; ordinary planar sources remain centered at Y=0.
  function capture(camera, detector) {
    const sensorHeight = camera?.sensorHeight ?? FALLBACK.sensorHeight;
    const pixelRows = camera?.pixelRows ?? FALLBACK.pixelRows;
    const spotSize = camera?.spotSize ?? FALLBACK.spotSize;
    if (!camera || camera.type !== 'camera' || !Number.isInteger(camera.pixelCount) || camera.pixelCount < 16 || camera.pixelCount > 1024 ||
        !Number.isInteger(pixelRows) || pixelRows < 16 || pixelRows > 512 ||
        !Number.isFinite(camera.aperture) || camera.aperture < 2 || camera.aperture > 300 ||
        !Number.isFinite(sensorHeight) || sensorHeight < 2 || sensorHeight > 300 ||
        !Number.isFinite(spotSize) || spotSize < .01 || spotSize > 300 ||
        !Number.isFinite(camera.exposure) || camera.exposure < .01 || camera.exposure > 100) throw new Error('カメラ設定が不正です。');
    const width = camera.aperture, pitch = width / camera.pixelCount, rowPitch = sensorHeight / pixelRows;
    const pixels = Array.from({ length: camera.pixelCount }, (_, i) => ({ position: -width / 2 + (i + .5) * pitch, power: 0, rgb: [0, 0, 0] }));
    const rawPower = new Float64Array(camera.pixelCount * pixelRows), rawRgb = new Float64Array(rawPower.length * 3), beamProfiles = new Map();
    const bin = (value, extent, step, count, reverse = false) => {
      const coordinate = (reverse ? extent / 2 - value : value + extent / 2) / step, rounded = Math.round(coordinate);
      return Math.min(count - 1, Math.max(0, Math.floor(Math.abs(coordinate - rounded) < 1e-8 ? rounded : coordinate)));
    };
    let totalPower = 0, hits = 0, nonvisiblePower = 0, hasVerticalData = false;
    for (const sample of camera.enabled ? detector?.samples || [] : []) {
      const { position, power, wavelength } = sample, verticalPosition = Number.isFinite(sample.verticalPosition) ? sample.verticalPosition : 0;
      if (![position, verticalPosition, power, wavelength].every(Number.isFinite) || power <= 0 ||
          Math.abs(position) > width / 2 + 1e-7 || Math.abs(verticalPosition) > sensorHeight / 2 + 1e-7) continue;
      const column = bin(position, width, pitch, camera.pixelCount), row = bin(verticalPosition, sensorHeight, rowPitch, pixelRows, true);
      const index = row * camera.pixelCount + column, pixel = pixels[column], sampleColor = rgb(wavelength);
      pixel.power += power; sampleColor.forEach((c, i) => { pixel.rgb[i] += power * c; });
      if (typeof sample.cameraProfile === 'string') {
        const profile = beamProfiles.get(sample.cameraProfile) || { min: position, max: position, vertical: 0, power: 0, rgb: [0, 0, 0] };
        profile.min = Math.min(profile.min, position); profile.max = Math.max(profile.max, position);
        profile.vertical += power * verticalPosition; profile.power += power;
        sampleColor.forEach((c, channel) => { profile.rgb[channel] += power * c; });
        beamProfiles.set(sample.cameraProfile, profile);
      } else {
        rawPower[index] += power;
        sampleColor.forEach((c, channel) => { rawRgb[index * 3 + channel] += power * c; });
      }
      totalPower += power; hits++;
      hasVerticalData ||= Math.abs(verticalPosition) > 1e-9;
      if (wavelength < 380 || wavelength > 780) nonvisiblePower += power;
    }
    // A laser is traced as a meridional slice through the table plane. Treating
    // that slice as the complete 2D sensor image turns a finite beam into a
    // horizontal stripe. Reconstruct each unsplit laser path as a uniform round
    // cross-section whose measured in-plane span is its diameter. This is a
    // display estimate only; the exact 1D bins and detected power stay unchanged.
    for (const profile of beamProfiles.values()) {
      const center = (profile.min + profile.max) / 2, verticalCenter = profile.vertical / profile.power;
      const radius = Math.max(0, (profile.max - profile.min) / 2), indices = [];
      if (radius > Math.min(pitch, rowPitch) / 2) {
        const firstColumn = Math.max(0, Math.floor((center - radius + width / 2) / pitch));
        const lastColumn = Math.min(camera.pixelCount - 1, Math.floor((center + radius + width / 2) / pitch));
        const firstRow = Math.max(0, Math.floor((sensorHeight / 2 - verticalCenter - radius) / rowPitch));
        const lastRow = Math.min(pixelRows - 1, Math.floor((sensorHeight / 2 - verticalCenter + radius) / rowPitch));
        for (let row = firstRow; row <= lastRow; row++) for (let column = firstColumn; column <= lastColumn; column++) {
          const x = -width / 2 + (column + .5) * pitch, y = sensorHeight / 2 - (row + .5) * rowPitch;
          if ((x - center) ** 2 + (y - verticalCenter) ** 2 <= radius ** 2 + 1e-12) indices.push(row * camera.pixelCount + column);
        }
      }
      if (!indices.length) indices.push(bin(verticalCenter, sensorHeight, rowPitch, pixelRows, true) * camera.pixelCount + bin(center, width, pitch, camera.pixelCount));
      const fraction = 1 / indices.length;
      for (const index of indices) {
        rawPower[index] += profile.power * fraction;
        for (let channel = 0; channel < 3; channel++) rawRgb[index * 3 + channel] += profile.rgb[channel] * fraction;
      }
    }
    const peakPower = Math.max(...pixels.map(p => p.power));
    const reference = camera.autoExposure && peakPower > 0 ? peakPower : 1, columnScale = camera.exposure / reference;
    let columnClippedPixels = 0;
    for (const pixel of pixels) {
      if (pixel.rgb.some(c => c * columnScale > 1 + 1e-12)) columnClippedPixels++;
      pixel.color = 'rgb(' + pixel.rgb.map(c => Math.round(255 * Math.min(1, c * columnScale))).join(',') + ')';
    }

    const sigma = spotSize / 2.354820045;
    const horizontalPower = new Float64Array(rawPower.length), horizontalRgb = new Float64Array(rawRgb.length);
    for (let row = 0; row < pixelRows; row++) for (let source = 0; source < pixels.length; source++) {
      const sourceIndex = row * camera.pixelCount + source;
      if (rawPower[sourceIndex] <= 0) continue;
      const weights = normalizedKernel(pixels.length, pitch, sigma, source);
      for (let column = 0; column < pixels.length; column++) {
        const weight = weights[column];
        if (weight <= 0) continue;
        const targetIndex = row * camera.pixelCount + column;
        horizontalPower[targetIndex] += rawPower[sourceIndex] * weight;
        for (let channel = 0; channel < 3; channel++) horizontalRgb[targetIndex * 3 + channel] += rawRgb[sourceIndex * 3 + channel] * weight;
      }
    }
    const imagePower = new Float64Array(camera.pixelCount * pixelRows), imageRgb = new Float64Array(imagePower.length * 3);
    for (let sourceRow = 0; sourceRow < pixelRows; sourceRow++) {
      const weights = normalizedKernel(pixelRows, rowPitch, sigma, sourceRow);
      for (let column = 0; column < camera.pixelCount; column++) {
        const sourceIndex = sourceRow * camera.pixelCount + column;
        if (horizontalPower[sourceIndex] <= 0) continue;
        for (let row = 0; row < pixelRows; row++) {
          const weight = weights[row];
          if (weight <= 0) continue;
          const targetIndex = row * camera.pixelCount + column;
          imagePower[targetIndex] += horizontalPower[sourceIndex] * weight;
          for (let channel = 0; channel < 3; channel++) imageRgb[targetIndex * 3 + channel] += horizontalRgb[sourceIndex * 3 + channel] * weight;
        }
      }
    }
    const imagePeakPower = imagePower.reduce((peak, value) => Math.max(peak, value), 0);
    const imageReference = camera.autoExposure && imagePeakPower > 0 ? imagePeakPower : 1, imageScale = camera.exposure / imageReference;
    let clippedPixels = 0;
    for (let index = 0; index < imagePower.length; index++) {
      if ([0, 1, 2].some(channel => imageRgb[index * 3 + channel] * imageScale > 1 + 1e-12)) clippedPixels++;
    }
    return { pixels, imagePower, imageRgb, width, height: sensorHeight, pitch, rowPitch, columns: camera.pixelCount, rows: pixelRows,
      spotSize, totalPower, hits, peakPower, imagePeakPower, reference, imageReference, imageScale, clippedPixels, columnClippedPixels,
      nonvisiblePower, hasVerticalData, hasBeamProfile: beamProfiles.size > 0,
      enabled: camera.enabled, exposure: camera.exposure, autoExposure: camera.autoExposure };
  }
  function svg(frame, title = 'カメラ像', unit = 'mm') {
    const unitScale = { mm: 1, cm: 10, in: 25.4 }[unit] || 1;
    const layout = sensorLayout(frame), sensorWidth = layout.width, sensorHeight = layout.height, sensorX = layout.x, sensorY = layout.y;
    const columnStride = Math.max(1, Math.ceil(frame.columns / 160)), rowStride = Math.max(1, Math.ceil(frame.rows / 120));
    const displayColumns = Math.ceil(frame.columns / columnStride), displayRows = Math.ceil(frame.rows / rowStride);
    const cellWidth = sensorWidth / displayColumns, cellHeight = sensorHeight / displayRows;
    const verticalDescription = frame.hasVerticalData ? (frame.hasBeamProfile ? '発光スクリーンの近軸像位置とレーザーの円形断面推定' : '発光スクリーンから近軸伝搬した像位置') :
      (frame.hasBeamProfile ? '面内光線幅から推定したレーザーの円形断面' : '中央面の受光位置');
    const verticalLabel = frame.hasVerticalData ? (frame.hasBeamProfile ? 'paraxial + beam profile' : 'paraxial image') : (frame.hasBeamProfile ? 'beam profile estimate' : 'center plane');
    const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640" preserveAspectRatio="xMidYMid meet" role="img">`,
      `<title>${escape(title)}：2Dセンサー像</title>`,
      `<desc>横方向は面内光線の受光位置。縦方向は${verticalDescription}。XとYは同じ物理表示倍率。Gaussian表示スポットFWHM ${number(frame.spotSize)} mm。非干渉。受光P ${number(frame.totalPower)}。表示ゲイン ${frame.exposure}。${frame.autoExposure ? '最大画素を基準に自動表示。' : '固定基準P=1。'}</desc>`,
      '<rect width="960" height="640" rx="16" fill="#12242b"/>',
      `<g fill="#c5d7d9" font-family="sans-serif"><text x="100" y="38" font-size="24">2D SENSOR · ${frame.columns} × ${frame.rows} px</text><text x="860" y="38" text-anchor="end" font-size="17">X/Y SCALE 1:1 · Y: ${verticalLabel}</text></g>`,
      `<rect x="${sensorX}" y="${sensorY}" width="${sensorWidth}" height="${sensorHeight}" data-physical-scale="${number(layout.scale)}" fill="#000" stroke="#7f9aa0" stroke-width="2"/>`];
    for (let displayRow = 0; displayRow < displayRows; displayRow++) for (let displayColumn = 0; displayColumn < displayColumns; displayColumn++) {
      const firstRow = displayRow * rowStride, lastRow = Math.min(frame.rows, firstRow + rowStride);
      const firstColumn = displayColumn * columnStride, lastColumn = Math.min(frame.columns, firstColumn + columnStride);
      let samples = 0, red = 0, green = 0, blue = 0, power = 0;
      for (let row = firstRow; row < lastRow; row++) for (let column = firstColumn; column < lastColumn; column++) {
        const index = row * frame.columns + column; samples++; power += frame.imagePower[index];
        red += frame.imageRgb[index * 3]; green += frame.imageRgb[index * 3 + 1]; blue += frame.imageRgb[index * 3 + 2];
      }
      if (power <= 0) continue;
      const fill = color([red / samples, green / samples, blue / samples], frame.imageScale);
      if (fill === 'rgb(0,0,0)') continue;
      parts.push(`<rect x="${sensorX + displayColumn * cellWidth}" y="${sensorY + displayRow * cellHeight}" width="${cellWidth + .02}" height="${cellHeight + .02}" fill="${fill}" shape-rendering="crispEdges"/>`);
    }
    parts.push(`<rect x="${sensorX}" y="${sensorY}" width="${sensorWidth}" height="${sensorHeight}" fill="none" stroke="#9cb4b8" stroke-width="2"/>`,
      `<g fill="#c5d7d9" font-family="sans-serif" font-size="18"><text x="${sensorX + sensorWidth / 2}" y="${sensorY + sensorHeight + 50}" text-anchor="middle">sensor X</text><text x="30" y="${sensorY + sensorHeight / 2}" text-anchor="middle" transform="rotate(-90 30 ${sensorY + sensorHeight / 2})">sensor Y</text>`);
    for (const fraction of [0, .5, 1]) {
      parts.push(`<text x="${sensorX + sensorWidth * fraction}" y="${sensorY + sensorHeight + 27}" text-anchor="${fraction === 0 ? 'start' : fraction === 1 ? 'end' : 'middle'}">${number((fraction - .5) * frame.width / unitScale)} ${escape(unit)}</text>`,
        `<text x="${sensorX - 14}" y="${sensorY + sensorHeight * fraction + 6}" text-anchor="end">${number((.5 - fraction) * frame.height / unitScale)} ${escape(unit)}</text>`);
    }
    parts.push(`<text x="100" y="615">受光P ${number(frame.totalPower)} · 最大P/画素 ${number(frame.imagePeakPower)} · spot FWHM ${number(frame.spotSize / unitScale)} ${escape(unit)}</text></g></svg>`);
    return parts.join('');
  }
  return Object.freeze({ capture, sensorLayout, svg });
});
