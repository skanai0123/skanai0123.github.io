(function (root, factory) {
  const api = factory(
    typeof module === 'object' && module.exports ? require('./optics.js') : root.Optics,
    typeof module === 'object' && module.exports ? require('./view.js') : root.OpticsView
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OpticsSpatial = api;
})(typeof window === 'undefined' ? this : window, function (O, V) {
  'use strict';

  const DEFAULT_VIEW = Object.freeze({ azimuth: 35, elevation: 30 });
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 4;
  const MAX_SEGMENTS = 2500;
  const TABLE_THICKNESS = 12;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const fmt = value => Number(value.toFixed(4));

  function camera(options = {}) {
    return {
      azimuth: ((finite(options.azimuth, DEFAULT_VIEW.azimuth) % 360) + 360) % 360,
      elevation: clamp(finite(options.elevation, DEFAULT_VIEW.elevation), 10, 80)
    };
  }

  // Orthographic oblique projection. X/Y remain the physical bench plane and
  // Z is display-only height; no Z coordinate is added to the saved design.
  function project(point, options = DEFAULT_VIEW) {
    const view = camera(options), azimuth = view.azimuth * Math.PI / 180, elevation = view.elevation * Math.PI / 180;
    const x = finite(point.x), y = finite(point.y), z = finite(point.z);
    const horizontal = x * Math.cos(azimuth) - y * Math.sin(azimuth);
    const depth = x * Math.sin(azimuth) + y * Math.cos(azimuth);
    return { x: horizontal, y: depth * Math.sin(elevation) - z * Math.cos(elevation), depth };
  }

  function sceneBounds(elements) {
    if (!elements.length) return { x: -150, y: -100, width: 300, height: 200 };
    const bounds = O.elementBounds(elements), span = Math.max(bounds.width, bounds.height, 200);
    const padding = clamp(span * 0.16, 70, 300);
    return { x: bounds.x - padding, y: bounds.y - padding, width: bounds.width + padding * 2, height: bounds.height + padding * 2 };
  }

  function clipSegment(segment, bounds) {
    const dx = segment.b.x - segment.a.x, dy = segment.b.y - segment.a.y;
    let start = 0, end = 1;
    const edges = [
      [-dx, segment.a.x - bounds.x],
      [dx, bounds.x + bounds.width - segment.a.x],
      [-dy, segment.a.y - bounds.y],
      [dy, bounds.y + bounds.height - segment.a.y]
    ];
    for (const [p, q] of edges) {
      if (Math.abs(p) < 1e-12) { if (q < 0) return null; continue; }
      const ratio = q / p;
      if (p < 0) start = Math.max(start, ratio); else end = Math.min(end, ratio);
      if (start > end) return null;
    }
    return {
      ...segment,
      a: { x: segment.a.x + dx * start, y: segment.a.y + dy * start },
      b: { x: segment.a.x + dx * end, y: segment.a.y + dy * end }
    };
  }

  function niceStep(value) {
    if (!(value > 0)) return 10;
    const scale = 10 ** Math.floor(Math.log10(value)), normalized = value / scale;
    return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * scale;
  }

  function displayRadius(element) {
    const aperture = finite(element.aperture, 0);
    if (aperture > 0) return Math.max(aperture / 2, 7);
    if (['laser', 'point', 'white', 'fiber'].includes(element.type)) return 10;
    return 14;
  }

  function displayHeightRadius(element) {
    if (element.type === 'camera') return Math.max(finite(element.sensorHeight, 18) / 2, 7);
    if (element.type === 'screen') return Math.max(finite(element.screenHeight, 100) / 2, 7);
    return displayRadius(element);
  }

  function opticalHeight(elements) {
    const radius = elements.filter(e => !O.isAnnotation(e)).reduce((largest, element) => Math.max(largest, displayRadius(element), displayHeightRadius(element)), 0);
    return Math.max(30, radius + 8);
  }

  function projectedArea(points) {
    if (!points.length) return { x: -100, y: -60, width: 200, height: 120 };
    const left = Math.min(...points.map(point => point.x)), right = Math.max(...points.map(point => point.x));
    const top = Math.min(...points.map(point => point.y)), bottom = Math.max(...points.map(point => point.y));
    const span = Math.max(right - left, bottom - top, 100), padding = Math.max(18, span * 0.055);
    return { x: left - padding, y: top - padding, width: Math.max(100, right - left + padding * 2), height: Math.max(70, bottom - top + padding * 2) };
  }

  function zoomArea(area, value = 1) {
    const zoom = clamp(finite(value, 1), MIN_ZOOM, MAX_ZOOM);
    const width = area.width / zoom, height = area.height / zoom;
    return {
      x: area.x + (area.width - width) / 2,
      y: area.y + (area.height - height) / 2,
      width,
      height
    };
  }

  function create(svg, onSelect = () => {}) {
    const doc = svg.ownerDocument, ns = 'http://www.w3.org/2000/svg';
    let lastArea = { x: -100, y: -60, width: 200, height: 120 };
    const make = (tag, attributes = {}, text) => {
      const node = doc.createElementNS(ns, tag);
      for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
      if (text !== undefined) node.textContent = String(text);
      return node;
    };
    const pathData = (points, close = true) => points.map((point, index) => `${index ? 'L' : 'M'} ${fmt(point.x)} ${fmt(point.y)}`).join(' ') + (close ? ' Z' : '');
    const title = element => element.label || `${O.TYPES[element.type]?.label || element.type} ${element.id}`;

    function draw(scene, result, selectedId, showLabels = true, options = DEFAULT_VIEW) {
      const labelFactor = (scene.labelScale ?? 100) / 100;
      const view = camera(options), bounds = sceneBounds(scene.elements), axisHeight = opticalHeight(scene.elements);
      const projected = point => project(point, view);
      const worldCorners = [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        { x: bounds.x, y: bounds.y + bounds.height }
      ];
      const topCorners = worldCorners.map(point => projected({ ...point, z: 0 }));
      const bottomCorners = worldCorners.map(point => projected({ ...point, z: -TABLE_THICKNESS }));

      const clipped = V.displaySegments(result.segments).map(segment => clipSegment(segment, bounds)).filter(Boolean);
      const stride = Math.max(1, Math.ceil(clipped.length / MAX_SEGMENTS));
      const visibleSegments = clipped.filter((_, index) => index % stride === 0).slice(0, MAX_SEGMENTS);
      const fitPoints = [...topCorners, ...bottomCorners];
      for (const segment of visibleSegments) fitPoints.push(projected({ ...segment.a, z: axisHeight }), projected({ ...segment.b, z: axisHeight }));
      for (const element of scene.elements) {
        if (element.type === 'region') continue; // Its bounds already expand the floor corners.
        if (element.type === 'comment') {
          const anchor = projected({ ...element, z: 0 }), box = O.commentLayout(element);
          fitPoints.push({ x: anchor.x - 16, y: anchor.y - 16 }, { x: anchor.x + box.x + box.width + 4, y: anchor.y + box.y + box.height + 4 });
          continue;
        }
        const radius = displayRadius(element);
        for (const dx of [-radius, radius]) for (const dy of [-radius, radius]) {
          fitPoints.push(projected({ x: element.x + dx, y: element.y + dy, z: 0 }));
          fitPoints.push(projected({ x: element.x + dx, y: element.y + dy, z: axisHeight + radius + 18 }));
        }
      }
      const zoom = clamp(finite(options.zoom, 1), MIN_ZOOM, MAX_ZOOM);
      lastArea = zoomArea(projectedArea(fitPoints), zoom);
      svg.setAttribute('viewBox', `${fmt(lastArea.x)} ${fmt(lastArea.y)} ${fmt(lastArea.width)} ${fmt(lastArea.height)}`);
      svg.setAttribute('aria-label', `斜視3D光学図。方位角${fmt(view.azimuth)}度、仰角${fmt(view.elevation)}度、拡大率${fmt(zoom * 100)}%。${scene.elements.length}部品、光線${visibleSegments.length}本を表示。`);

      const sides = worldCorners.map((_, index) => {
        const next = (index + 1) % worldCorners.length;
        return make('path', {
          d: pathData([topCorners[index], topCorners[next], bottomCorners[next], bottomCorners[index]]),
          fill: index % 2 ? '#10242c' : '#0d2027', stroke: '#43616a', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke'
        });
      });
      const table = make('g', { 'data-spatial-table': 'true', 'aria-hidden': 'true' });
      table.append(...sides, make('path', {
        d: pathData(topCorners), fill: '#17323b', stroke: '#668189', 'stroke-width': 1.2, 'vector-effect': 'non-scaling-stroke'
      }));

      const grid = make('g', { 'data-spatial-grid': 'true', opacity: 0.58, 'aria-hidden': 'true' });
      let step = Math.max(finite(scene.gridStep, 10), niceStep(Math.max(bounds.width, bounds.height) / 24));
      while (bounds.width / step + bounds.height / step > 70) step *= 2;
      for (let x = Math.ceil(bounds.x / step) * step; x <= bounds.x + bounds.width + 1e-8; x += step) {
        const a = projected({ x, y: bounds.y, z: 0.2 }), b = projected({ x, y: bounds.y + bounds.height, z: 0.2 });
        grid.append(make('line', { x1: fmt(a.x), y1: fmt(a.y), x2: fmt(b.x), y2: fmt(b.y), stroke: '#54717a', 'stroke-width': 0.7, 'vector-effect': 'non-scaling-stroke' }));
      }
      for (let y = Math.ceil(bounds.y / step) * step; y <= bounds.y + bounds.height + 1e-8; y += step) {
        const a = projected({ x: bounds.x, y, z: 0.2 }), b = projected({ x: bounds.x + bounds.width, y, z: 0.2 });
        grid.append(make('line', { x1: fmt(a.x), y1: fmt(a.y), x2: fmt(b.x), y2: fmt(b.y), stroke: '#54717a', 'stroke-width': 0.7, 'vector-effect': 'non-scaling-stroke' }));
      }

      const axes = make('g', { 'data-spatial-axes': 'true', 'aria-hidden': 'true' });
      const axisLength = Math.min(Math.max(step * 1.4, 35), Math.min(bounds.width, bounds.height) * 0.24);
      const origin = { x: bounds.x + step * 0.55, y: bounds.y + bounds.height - step * 0.55, z: 1 };
      const axisOrigin = projected(origin);
      for (const [letter, vector, color] of [
        ['X', { x: axisLength, y: 0, z: 0 }, '#f39a78'],
        ['Y', { x: 0, y: axisLength, z: 0 }, '#9ed47f'],
        ['Z', { x: 0, y: 0, z: axisLength }, '#8fc7f0']
      ]) {
        const end = projected({ x: origin.x + vector.x, y: origin.y + vector.y, z: origin.z + vector.z });
        axes.append(make('line', { x1: fmt(axisOrigin.x), y1: fmt(axisOrigin.y), x2: fmt(end.x), y2: fmt(end.y), stroke: color, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }),
          make('text', { x: fmt(end.x), y: fmt(end.y - 4), fill: color, 'font-size': 10, 'text-anchor': 'middle', 'paint-order': 'stroke', stroke: '#17323b', 'stroke-width': 3 }, letter));
      }

      const fibers = make('g', { 'data-spatial-fibers': 'true', 'aria-hidden': 'true' });
      for (const link of scene.fiberLinks || []) {
        const first = scene.elements.find(element => element.id === link.a), second = scene.elements.find(element => element.id === link.b);
        if (!first || !second) continue;
        const points = V.fiberCablePoints(first, second).map(point => projected({ ...point, z: 8 }));
        fibers.append(make('path', {
          d: `M ${fmt(points[0].x)} ${fmt(points[0].y)} C ${fmt(points[1].x)} ${fmt(points[1].y)} ${fmt(points[2].x)} ${fmt(points[2].y)} ${fmt(points[3].x)} ${fmt(points[3].y)}`,
          fill: 'none', stroke: '#a88cd2', 'stroke-width': 3, opacity: first.enabled && second.enabled ? 0.9 : 0.35, 'vector-effect': 'non-scaling-stroke'
        }));
      }

      const rays = make('g', { 'data-spatial-rays': 'true', 'aria-hidden': 'true' });
      const maxPower = Math.max(...visibleSegments.map(segment => segment.power), 1e-10);
      for (const segment of visibleSegments) {
        const a = projected({ ...segment.a, z: axisHeight + finite(segment.verticalStart) });
        const b = projected({ ...segment.b, z: axisHeight + finite(segment.verticalEnd) });
        const strength = clamp(Math.sqrt(Math.max(segment.power, 0) / maxPower), 0.2, 1);
        rays.append(make('line', {
          x1: fmt(a.x), y1: fmt(a.y), x2: fmt(b.x), y2: fmt(b.y), stroke: segment.color || O.wavelengthColor(segment.wavelength),
          'stroke-width': fmt(1.2 + strength * 2.2), opacity: fmt(0.35 + strength * 0.62),
          'stroke-dasharray': segment.nonvisible ? '7 4' : 'none', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke',
          'data-spatial-ray': String(segment.sourceId)
        }));
      }

      const palette = {
        laser: '#8dc9ad', point: '#efca75', white: '#f7f0c8', mirror: '#b8d7df', concave: '#9fc7d2', lens: '#63c9e4',
        objective: '#74b8da', iris: '#9ba9a7', filter: '#75b99b', polarizer: '#d4a36e', waveplate: '#aa91d1', halfwave: '#9277bf',
        phase: '#d18baa', dichroic: '#d6a96c', splitter: '#9bc3d6', pbs: '#bb9fd7', fiber: '#a88cd2', blocker: '#536168',
        screen: '#e2dca8', camera: '#6e8794', fluorescent: '#d8a5cb'
      };
      const discTypes = new Set(['lens', 'objective', 'iris']);
      const sourceTypes = new Set(['laser', 'point', 'white', 'fiber']);
      const elementLayer = make('g', { 'data-spatial-elements': 'true' });
      const regions = make('g', { 'data-spatial-regions': 'true' });
      const ordered = [...scene.elements].sort((a, b) => Number(a.type === 'comment') - Number(b.type === 'comment') || project(b, view).depth - project(a, view).depth || a.id - b.id);
      for (const element of ordered) {
        const group = make('g', {
          class: `spatial-element${element.id === selectedId ? ' is-selected' : ''}${element.enabled ? '' : ' is-disabled'}`,
          'data-spatial-element-id': element.id, tabindex: 0, role: 'button', 'aria-label': `${title(element)}を2D編集画面で選択`,
          'aria-pressed': String(element.id === selectedId), opacity: element.enabled ? 1 : 0.34
        });
        group.addEventListener('click', event => { event.stopPropagation?.(); onSelect(element.id); });
        group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault?.(); onSelect(element.id); } });
        if (element.type === 'region') {
          const box=O.regionGeometry(element),color=O.REGION_COLORS[element.regionColor];
          const offsets=box.width===0?[[0,0],[0,box.height]]:box.height===0?[[0,0],[box.width,0]]:[[0,0],[box.width,0],[box.width,box.height],[0,box.height]];
          const points=offsets.map(([dx,dy])=>projected({x:element.x+dx,y:element.y+dy,z:.5})),d=pathData(points,Boolean(box.width&&box.height));
          group.append(make('path',{d,fill:box.width&&box.height?color:'none','fill-opacity':.08,'pointer-events':'none'}),
            make('path',{d,fill:'none',stroke:color,'stroke-width':element.id===selectedId?2.8:1.6,'stroke-dasharray':'8 6','vector-effect':'non-scaling-stroke','pointer-events':'stroke',class:'spatial-region-border'}),
            make('text',{x:fmt(points[0].x),y:fmt(points[0].y-8),fill:color,'font-size':13,'font-weight':600,'paint-order':'stroke',stroke:'#17323b','stroke-width':3},Array.from(title(element)).slice(0,16).join('')));
          regions.append(group); continue;
        }
        if (element.type === 'comment') {
          const anchor = projected({ ...element, z: 0 });
          group.setAttribute('transform', `translate(${fmt(anchor.x)} ${fmt(anchor.y)})`);
          group.setAttribute('aria-expanded', String(element.commentDisplay !== 'click' || element.id === selectedId));
          group.append(V.commentBubble(make, element, element.id === selectedId));
          elementLayer.append(group); continue;
        }
        const color = palette[element.type] || '#aab9b5', radius = displayRadius(element), heightRadius = displayHeightRadius(element);
        const tangent = O.direction(finite(element.angle) + 90), centerZ = axisHeight;
        const surfacePoints = (angleOffset = 0) => {
          const t = O.direction(finite(element.angle) + 90 + angleOffset), half = radius;
          return [
            projected({ x: element.x - t.x * half, y: element.y - t.y * half, z: Math.max(1, centerZ - heightRadius) }),
            projected({ x: element.x + t.x * half, y: element.y + t.y * half, z: Math.max(1, centerZ - heightRadius) }),
            projected({ x: element.x + t.x * half, y: element.y + t.y * half, z: centerZ + heightRadius }),
            projected({ x: element.x - t.x * half, y: element.y - t.y * half, z: centerZ + heightRadius })
          ];
        };
        let body;
        if (discTypes.has(element.type)) {
          const points = Array.from({ length: 32 }, (_, index) => {
            const angle = index * Math.PI * 2 / 32;
            return projected({ x: element.x + tangent.x * Math.cos(angle) * radius, y: element.y + tangent.y * Math.cos(angle) * radius, z: centerZ + Math.sin(angle) * radius });
          });
          body = make('path', { d: pathData(points), fill: element.type === 'iris' ? '#20343a' : color, 'fill-opacity': element.type === 'iris' ? 0.9 : 0.38, stroke: color, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' });
          group.append(body);
          if (element.type === 'iris') {
            const opening = clamp(finite(element.opening, radius), 0, radius * 2) / 2;
            const hole = Array.from({ length: 24 }, (_, index) => {
              const angle = index * Math.PI * 2 / 24;
              return projected({ x: element.x + tangent.x * Math.cos(angle) * opening, y: element.y + tangent.y * Math.cos(angle) * opening, z: centerZ + Math.sin(angle) * opening });
            });
            group.append(make('path', { d: pathData(hole), fill: '#17323b', stroke: '#c7d8d3', 'stroke-width': 1.2, 'vector-effect': 'non-scaling-stroke' }));
          }
        } else if (sourceTypes.has(element.type)) {
          const base = projected({ x: element.x, y: element.y, z: 0 }), top = projected({ x: element.x, y: element.y, z: centerZ });
          const sourceColor = element.type === 'fiber' ? color : element.type === 'white' ? '#fff6cd' : O.wavelengthColor(element.wavelength);
          group.append(make('line', { x1: fmt(base.x), y1: fmt(base.y), x2: fmt(top.x), y2: fmt(top.y), stroke: '#82969a', 'stroke-width': 3, 'vector-effect': 'non-scaling-stroke' }),
            make('circle', { cx: fmt(base.x), cy: fmt(base.y), r: 5, fill: '#263f47', stroke: '#8ba0a2', 'stroke-width': 1.2, 'vector-effect': 'non-scaling-stroke' }),
            make('circle', { cx: fmt(top.x), cy: fmt(top.y), r: element.type === 'point' || element.type === 'white' ? 7 : 5.5, fill: sourceColor, stroke: '#f4f6e6', 'stroke-width': 1.4, 'vector-effect': 'non-scaling-stroke' }));
          body = group.children[group.children.length - 1];
        } else {
          const points = surfacePoints();
          body = make('path', { d: pathData(points), fill: color, 'fill-opacity': ['blocker', 'camera'].includes(element.type) ? 0.92 : 0.48, stroke: color, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' });
          group.append(body);
          if (['splitter', 'pbs'].includes(element.type)) {
            group.append(make('path', { d: pathData(surfacePoints(90)), fill: color, 'fill-opacity': 0.16, stroke: '#d7edf1', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }));
          }
        }
        const center = projected({ x: element.x, y: element.y, z: centerZ });
        group.append(make('text', { x: fmt(center.x), y: fmt(center.y + 4), fill: '#f4f7ee', 'font-size': 10, 'font-weight': 700, 'text-anchor': 'middle', 'paint-order': 'stroke', stroke: '#17323b', 'stroke-width': 3 },
          element.type === 'screen' && element.screenPattern === 'doll' ? '人' : V.symbols[element.type] || '•'));
        if (element.id === selectedId) {
          const selection = sourceTypes.has(element.type)
            ? make('circle', { cx: fmt(center.x), cy: fmt(center.y), r: 10, fill: 'none', stroke: '#e9f7b8', 'stroke-width': 2.5, 'stroke-dasharray': '5 3', 'vector-effect': 'non-scaling-stroke', class: 'spatial-selection' })
            : make('path', { d: body.getAttribute('d'), fill: 'none', stroke: '#e9f7b8', 'stroke-width': 3.5, 'stroke-dasharray': '7 3', 'vector-effect': 'non-scaling-stroke', class: 'spatial-selection' });
          group.append(selection);
        }
        if (showLabels) {
          const labelPoint = projected({ x: element.x, y: element.y, z: centerZ + heightRadius + 12 * labelFactor });
          group.append(make('text', { x: fmt(labelPoint.x), y: fmt(labelPoint.y), fill: '#d9e8e2', 'font-size': 10 * labelFactor, 'text-anchor': 'middle', 'paint-order': 'stroke', stroke: '#17323b', 'stroke-width': 3.5, class: 'spatial-label' }, title(element)));
        }
        elementLayer.append(group);
      }

      if (!scene.elements.length) {
        const center = projected({ x: 0, y: 0, z: 20 });
        elementLayer.append(make('text', { x: fmt(center.x), y: fmt(center.y), fill: '#b6cac4', 'font-size': 13, 'text-anchor': 'middle' }, '部品を配置すると3D表示が更新されます'));
      }
      svg.replaceChildren(table, grid, axes, regions, fibers, rays, elementLayer);
      return { elements: scene.elements.length, segmentsShown: visibleSegments.length, segmentsTotal: clipped.length, azimuth: view.azimuth, elevation: view.elevation, zoom };
    }

    function exportSvg(name) {
      const copy = svg.cloneNode(true);
      copy.setAttribute('xmlns', ns); copy.setAttribute('width', '1400');
      copy.setAttribute('height', String(Math.round(1400 * lastArea.height / lastArea.width)));
      copy.removeAttribute('tabindex'); copy.removeAttribute('class');
      for (const node of copy.querySelectorAll('.spatial-selection')) node.remove();
      for (const node of copy.querySelectorAll('[tabindex]')) node.removeAttribute('tabindex');
      copy.prepend(make('title', {}, name + ' — 斜視3D光学図'));
      return new XMLSerializer().serializeToString(copy);
    }

    return { draw, exportSvg };
  }

  return { DEFAULT_VIEW, MIN_ZOOM, MAX_ZOOM, MAX_SEGMENTS, camera, project, sceneBounds, clipSegment, niceStep, displayRadius, displayHeightRadius, opticalHeight, projectedArea, zoomArea, create };
});
