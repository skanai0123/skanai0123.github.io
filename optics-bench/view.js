(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./optics.js') : root.Optics);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OpticsView = api;
})(typeof window === 'undefined' ? this : window, function (O) {
  'use strict';
  const BASE_VIEW = Object.freeze({ x: -48, y: -42, width: 1096, height: 704 });
  const MIN_VIEW_WIDTH = 20, MAX_VIEW_WIDTH = O.COORDINATE_LIMIT * 64;
  const round = value => Number(value.toFixed(6));
  const formatWavelength = value => String(Number(value.toPrecision(10)));
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  function spectrumLabel(source) {
    const band = O.sourceBand(source);
    return (source.wavelengthWidth ?? 0) > 0 ? `${formatWavelength(band.min)}–${formatWavelength(band.max)} nm` : `${source.wavelength} nm`;
  }
  function spectrumSwatch(source) {
    if (!(source.wavelengthWidth > 0)) return O.wavelengthColor(source.wavelength);
    const band = O.sourceBand(source);
    return 'linear-gradient(90deg,' + Array.from({length:5},(_,i)=>O.wavelengthColor(band.min+(band.max-band.min)*i/4)).join(',') + ')';
  }
  // Merge only spectral samples of the same spatial ray and exact path.
  // Probing still uses the untouched per-wavelength records. This avoids the
  // last SVG stroke hiding all other wavelengths of a broadband source.
  function displaySegments(segments) {
    const output = [], groups = new Map();
    for (const s of segments) {
      const color = O.wavelengthColor(s.wavelength), nonvisible = s.wavelength < 380 || s.wavelength > 780;
      if (!/~\d+:\d+/.test(s.key || '')) { output.push({...s,color,nonvisible}); continue; }
      const key = [s.key.replace(/~\d+:\d+/,''),s.a.x,s.a.y,s.b.x,s.b.y].join('|');
      let group = groups.get(key);
      if (!group) { group={...s,power:0,nonvisible:false,color,rgb:[0,0,0]}; groups.set(key,group); output.push(group); }
      const rgb = color.startsWith('#') ? [1,3,5].map(i=>parseInt(color.slice(i,i+2),16)) : color.match(/[\d.]+/g).map(Number);
      group.power += s.power; group.nonvisible ||= nonvisible;
      rgb.forEach((value,i)=>{group.rgb[i]+=s.power*value;});
    }
    for (const group of groups.values()) {
      if (group.power > 0) group.color='rgb('+group.rgb.map(v=>Math.round(clamp(v/group.power,0,255))).join(',')+')';
      delete group.rgb;
    }
    return output;
  }
  function snapAngle(angle, enabled = true) {
    return O.normalizeAngle(enabled ? Math.round(angle / 22.5) * 22.5 : round(angle));
  }
  function place(x, y, gridStep, snap = true) {
    // Decimal inch grids can divide to just below an exact half-step.
    const quantize = v => {
      if (!Number.isFinite(v)) return 0;
      const index = v / gridStep;
      const tolerance = Number.EPSILON * Math.max(1, Math.abs(index)) * 4;
      return round(snap ? Math.floor(index + 0.5 + tolerance) * gridStep : v);
    };
    return { x: clamp(quantize(x), -O.COORDINATE_LIMIT, O.COORDINATE_LIMIT), y: clamp(quantize(y), -O.COORDINATE_LIMIT, O.COORDINATE_LIMIT) };
  }
  function clampView(view) {
    if (![view.x, view.y, view.width, view.height].every(Number.isFinite) || view.width <= 0 || view.height <= 0) return { ...BASE_VIEW };
    return { ...view, x: clamp(view.x, -MAX_VIEW_WIDTH, MAX_VIEW_WIDTH), y: clamp(view.y, -MAX_VIEW_WIDTH, MAX_VIEW_WIDTH) };
  }
  function nudge(point, dx, dy, gridStep, snap = true, multiplier = 1) {
    const step = (snap ? gridStep : 1) * multiplier;
    const moved = place(point.x + dx * step, point.y + dy * step, gridStep, snap);
    return { x: dx ? moved.x : point.x, y: dy ? moved.y : point.y };
  }
  function pastePosition(element, elements, gridStep, snap = true) {
    const available = p => elements.every(e => Math.abs(e.x - p.x) > 1e-6 || Math.abs(e.y - p.y) > 1e-6);
    const original = { x: element.x, y: element.y };
    // A cut component, or one pasted into another design, keeps its exact mm position.
    if (available(original)) return original;
    const step = snap ? Math.max(gridStep, 25) : 25;
    const maximum = elements.length + 1;
    for (let radius = 1; radius <= maximum; radius++) {
      for (let offset = radius; offset > -radius; offset--) {
        for (const [dx, dy] of [[radius, offset], [offset, -radius], [-radius, -offset], [-offset, radius]]) {
          const p = place(element.x + dx * step, element.y + dy * step, gridStep, snap);
          if (available(p)) return p;
        }
      }
    }
    return null;
  }
  function marqueeRect(a, b) {
    return { x: Math.min(a.x,b.x), y: Math.min(a.y,b.y), width: Math.abs(b.x-a.x), height: Math.abs(b.y-a.y) };
  }
  function marqueeIds(elements, a, b) {
    const r=marqueeRect(a,b);
    return elements.filter(e=>e.x>=r.x && e.x<=r.x+r.width && e.y>=r.y && e.y<=r.y+r.height).map(e=>e.id);
  }
  // Snap the grabbed anchor once, then clamp one common displacement. Never
  // snap or clamp members separately: off-grid preset spacing must survive.
  function groupDelta(elements, anchor, target, gridStep, snap = true, axis = null) {
    if (!elements.length) return {x:0,y:0};
    const at=place(target.x,target.y,gridStep,snap), limit=O.COORDINATE_LIMIT;
    const dx=axis==='y'?0:at.x-anchor.x, dy=axis==='x'?0:at.y-anchor.y;
    return {x:clamp(dx,-limit-Math.min(...elements.map(e=>e.x)),limit-Math.max(...elements.map(e=>e.x))),
      y:clamp(dy,-limit-Math.min(...elements.map(e=>e.y)),limit-Math.max(...elements.map(e=>e.y)))};
  }
  function pasteGroupDelta(group, elements, gridStep, snap = true) {
    if (!group.length) return null;
    const free=d=>group.every(g=>elements.every(e=>Math.abs(g.x+d.x-e.x)>1e-6 || Math.abs(g.y+d.y-e.y)>1e-6));
    if (free({x:0,y:0})) return {x:0,y:0};
    const anchor=group[0], step=snap?Math.max(gridStep,25):25;
    for(let r=1;r<=elements.length+1;r++)for(let i=r;i>-r;i--)for(const [dx,dy] of [[r,i],[i,-r],[-r,-i],[-i,r]]) {
      const d=groupDelta(group,anchor,{x:anchor.x+dx*step,y:anchor.y+dy*step},gridStep,snap);
      if(free(d))return d;
    }
    return null;
  }
  function zoomAt(view, factor, anchor) {
    if (!Number.isFinite(factor) || factor <= 0) return { ...view };
    const width = clamp(view.width / factor, MIN_VIEW_WIDTH, MAX_VIEW_WIDTH);
    const ratio = width / view.width;
    return clampView({ x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio, width, height: view.height * ratio });
  }
  function fiberCablePoints(a, b) {
    const first = O.direction(a.angle), second = O.direction(b.angle);
    const start = { x: a.x + first.x * 48, y: a.y + first.y * 48 };
    const end = { x: b.x + second.x * 48, y: b.y + second.y * 48 };
    const bend = clamp(Math.hypot(b.x - a.x, b.y - a.y) * .45, 60, 220);
    return [start, { x: start.x + first.x * bend, y: start.y + first.y * bend }, { x: end.x + second.x * bend, y: end.y + second.y * bend }, end];
  }
  function fiberCablePath(a, b) {
    const [start, first, second, end] = fiberCablePoints(a, b);
    return `M ${round(start.x)} ${round(start.y)} C ${round(first.x)} ${round(first.y)} ${round(second.x)} ${round(second.y)} ${round(end.x)} ${round(end.y)}`;
  }
  function fitView(elements, size = { width: 1000, height: 600 }, fiberLinks = []) {
    if (!elements.length) return { ...BASE_VIEW };
    const bounds = O.elementBounds(elements);
    let left = bounds.x, top = bounds.y, right = bounds.x + bounds.width, bottom = bounds.y + bounds.height;
    for (const link of fiberLinks) {
      const a = elements.find(e => e.id === link.a), b = elements.find(e => e.id === link.b);
      if (!a || !b) continue;
      // A Bezier curve stays within the convex hull of its control points.
      for (const p of fiberCablePoints(a, b)) {
        left = Math.min(left, p.x); right = Math.max(right, p.x); top = Math.min(top, p.y); bottom = Math.max(bottom, p.y);
      }
    }
    const w = Math.max(size.width, 1), h = Math.max(size.height, 1);
    const padX = Math.min(140, w * .24), padY = Math.min(60, h * .2);
    const scale = Math.max((right - left) / (w - 2 * padX), (bottom - top) / (h - 2 * padY), MIN_VIEW_WIDTH / w);
    const width = scale * w, height = scale * h;
    return { x: (left + right) / 2 - width / 2, y: (top + bottom) / 2 - height / 2, width, height };
  }
  function pickSegments(segments, point, radius) {
    const hits = [];
    for (let index = 0; index < segments.length; index++) {
      const s = segments[index], dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, length2 = dx * dx + dy * dy;
      if (!(length2 > 0)) continue;
      const t = clamp(((point.x - s.a.x) * dx + (point.y - s.a.y) * dy) / length2, 0, 1);
      const at = { x: s.a.x + t * dx, y: s.a.y + t * dy }, distance = Math.hypot(point.x - at.x, point.y - at.y);
      if (distance <= radius) hits.push({ index, t, point: at, distance });
    }
    return hits.sort((a, b) => Math.abs(a.distance - b.distance) > 1e-7 ? a.distance - b.distance :
      Number(Boolean(segments[b.index].center)) - Number(Boolean(segments[a.index].center)) || a.index - b.index);
  }
  function polarizationState(s) {
    if (!s || ![s.I, s.Q, s.U, s.V].every(Number.isFinite) || s.I <= 0) return null;
    const q = s.Q / s.I, u = s.U / s.I, v = s.V / s.I;
    const linear = Math.hypot(q, u), polarized = Math.hypot(q, u, v), degree = clamp(polarized, 0, 1);
    const kind = degree < 1e-8 ? 'unpolarized' : linear < polarized * 1e-6 ? 'circular' : Math.abs(v) < polarized * 1e-6 ? 'linear' : 'elliptical';
    return { q, u, v, degree, kind,
      azimuth: kind === 'unpolarized' || kind === 'circular' ? null : (Math.atan2(u, q) * 90 / Math.PI + 180) % 180,
      ellipticity: kind === 'unpolarized' ? null : Math.atan2(v, linear) * 90 / Math.PI };
  }
  const symbols = { laser:'↦', point:'✦', mirror:'╱', concave:')', lens:'↕', iris:'◉', filter:'F', polarizer:'P', waveplate:'¼', halfwave:'½', phase:'φ', dichroic:'╱', objective:'⌁', fiber:'⊙', blocker:'■', splitter:'◇', pbs:'◈', screen:'▥', camera:'▣' };

  function create(bench, onViewChange = () => {}) {
    const doc = bench.ownerDocument, ns = 'http://www.w3.org/2000/svg';
    const byId = id => doc.getElementById(id);
    const nodes = new Map();
    let viewport = { ...BASE_VIEW }, cache = null, probe = null;
    const make = (tag, attrs = {}, text) => {
      const node = doc.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const pixel = () => Math.max(viewport.width / Math.max(bench.getBoundingClientRect().width, 1), viewport.height / Math.max(bench.getBoundingClientRect().height, 1));
    function setView(value) {
      const next = clampView(value), changed = ['x', 'y', 'width', 'height'].some(key => next[key] !== viewport[key]);
      viewport = next; bench.setAttribute('viewBox', `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`);
      if (cache) draw(...cache);
      if (changed) onViewChange();
    }
    function visibleBounds() {
      const r = bench.getBoundingClientRect(), k = pixel(), width = r.width * k, height = r.height * k;
      return { x: viewport.x + (viewport.width - width) / 2, y: viewport.y + (viewport.height - height) / 2, width, height };
    }
    function point(event) {
      const p = bench.createSVGPoint(); p.x = event.clientX; p.y = event.clientY;
      return p.matrixTransform(bench.getScreenCTM().inverse());
    }
    function inside(event) {
      const r = bench.getBoundingClientRect(), p = point(event);
      return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom && Math.abs(p.x) <= O.COORDINATE_LIMIT && Math.abs(p.y) <= O.COORDINATE_LIMIT;
    }
    function title(e) { return e.label || `${O.TYPES[e.type].label} ${e.id}`; }
    function fiberMate(e) {
      if (e.type !== 'fiber') return null;
      const scene = cache?.[0], link = scene?.fiberLinks?.find(item => item.a === e.id || item.b === e.id);
      return link ? scene.elements.find(item => item.id === (link.a === e.id ? link.b : link.a)) : null;
    }
    function information(e) {
      const unit = cache?.[0]?.unit || 'mm', scale = unit === 'cm' ? 10 : unit === 'in' ? 25.4 : 1;
      const length = value => round(value / scale) + ' ' + unit;
      if (['laser','point'].includes(e.type) && !(e.wavelengthWidth > 0) && e.label === `${e.wavelength} nm` && e.wavelength >= 380 && e.wavelength <= 780) return '';
      if (['laser','point'].includes(e.type)) {
        const band=O.sourceBand(e);
        return spectrumLabel(e)+(band.min<380?' · UV':'')+(band.max>780?' · IR':'');
      }
      if (e.type === 'camera') return `${e.pixelCount} px · ${length(e.aperture)}`;
      if (['lens','objective','concave'].includes(e.type)) return `f ${length(e.focal)}${e.type === 'objective' ? ' · NA '+e.na : ''}`;
      if (e.type === 'iris') return `開口 ${length(e.opening)}`;
      if (e.type === 'filter') return e.filterMode === 'nd' ? `ND · OD ${round(e.opticalDensity)}` :
        e.filterMode === 'bandpass' ? `BP ${e.bandLow}–${e.bandHigh} nm` : `${e.filterMode === 'longpass' ? 'LP' : 'SP'} ${e.cutoff} nm`;
      if (['polarizer','waveplate','halfwave'].includes(e.type)) return `軸 ${round(e.axisAngle)}°`;
      if (e.type === 'phase') return `φ ${round(e.phase)}°`;
      if (e.type === 'dichroic') return `${e.mode === 'longpass' ? 'LP' : 'SP'} ${e.cutoff} nm`;
      if (e.type === 'fiber') return `core ${length(e.coreDiameter)} · NA ${e.na}`;
      if (e.type === 'splitter') return `NPBS · T ${Math.round(e.transmission*100)}%`;
      if (e.type === 'pbs') return 'PBS · p透過 / s反射';
      return '';
    }
    function bodyFor(e) {
      const body = make('g'), half = e.aperture / 2, c = O.TYPES[e.type].color || '#bdd5d3';
      const line = (a,b,color=c,width=2) => make('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:color,'stroke-width':width});
      const box = (x,y,w,h,fill=c,stroke=c) => make('rect',{x,y,width:w,height:h,rx:2,fill,stroke,'stroke-width':1.3});
      const color = ['laser','point'].includes(e.type) ? O.wavelengthColor(e.wavelength) : c;
      if (e.type === 'laser') {
        const h = Math.max(12, Math.min(65, e.beamWidth / 2 + 5));
        body.append(box(-33,-h,33,h*2,'#2b454c',color), box(-2,-Math.max(3,e.beamWidth/2),4,Math.max(6,e.beamWidth),color), line([-24,-h+4],[-24,h-4],'#8eaca4',1),line([-18,-h+4],[-18,h-4],'#8eaca4',1));
      } else if (e.type === 'point') {
        body.append(make('circle',{r:5,fill:color,stroke:'#eee','stroke-width':1}),make('circle',{r:10,fill:'none',stroke:color,'stroke-dasharray':'2 3'}),line([13,0],[22,0],color,1.5));
      } else if (e.type === 'concave') {
        const arc = O.concaveGeometry(e), d = `M ${-arc.sag} ${-half} A ${arc.radius} ${arc.radius} 0 0 1 ${-arc.sag} ${half}`;
        body.append(make('path',{d,transform:'translate(3 0)',fill:'none',stroke:'#63778b','stroke-width':6}),
          make('path',{d,fill:'none',stroke:c,'stroke-width':2,'data-concave-surface':'true'}));
      } else if (e.type === 'lens') {
        if (e.focal > 0) body.append(make('ellipse',{rx:Math.min(8,half/3),ry:half,fill:'#357683','fill-opacity':.35,stroke:c,'stroke-width':1.8}));
        else body.append(make('path',{d:`M -7 ${-half} Q 2 0 -7 ${half} H 7 Q -2 0 7 ${-half} Z`,fill:'#357683','fill-opacity':.3,stroke:c,'stroke-width':1.5}));
        body.append(line([0,-half],[0,half],c,.7));
      } else if (e.type === 'objective') {
        body.append(make('path',{d:`M -14 ${-half} L 14 ${-half*.7} V ${half*.7} L -14 ${half} Z`,fill:'#3c5964',stroke:c,'stroke-width':1.5}),line([8,-half*.65],[8,half*.65],c,3));
      } else if (e.type === 'iris') {
        const gap=Math.min(e.opening/2,half);
        if (half > gap) body.append(box(-5,-half,10,half-gap,'#70888c','#a7b7b8'),box(-5,gap,10,half-gap,'#70888c','#a7b7b8'));
        body.append(line([-10,-half],[10,-half],'#c4d5d2',2),line([-10,half],[10,half],'#c4d5d2',2));
      } else if (e.type === 'filter') {
        body.append(box(-6,-half,12,e.aperture,e.filterMode==='nd'?'#5d686b':'#356b64',c),
          line([0,-half],[0,half],c,.8),make('text',{x:0,y:4,'text-anchor':'middle',fill:'#fff','font-size':11},'F'));
      } else if (['polarizer','waveplate','halfwave','phase'].includes(e.type)) {
        body.append(box(-7,-half,14,e.aperture,e.type==='polarizer'?'#77624a':e.type==='phase'?'#786132':'#74618b',c),make('text',{x:0,y:4,'text-anchor':'middle',fill:'#fff','font-size':11},{polarizer:'P',waveplate:'¼',halfwave:'½',phase:'φ'}[e.type]));
      } else if (e.type === 'dichroic') {
        body.append(line([-2,-half],[-2,half],'#95dce2',4),line([2,-half],[2,half],'#e7baaa',3));
      } else if (['splitter','pbs'].includes(e.type)) {
        // Two decorative right-angle prisms. Only the central zero-thickness
        // segment acts on rays; the glass outline adds no surfaces or path length.
        body.append(make('path',{d:`M 0 ${-half} L ${half} 0 L 0 ${half} Z`,fill:c,'fill-opacity':.13}),
          make('path',{d:`M 0 ${-half} L ${-half} 0 L 0 ${half} Z`,fill:c,'fill-opacity':.24}),
          make('polygon',{points:`0,${-half} ${half},0 0,${half} ${-half},0`,fill:'none',stroke:c,'stroke-opacity':.65,'stroke-width':1,'data-bs-prism':'true'}),
          make('line',{x1:0,y1:-half,x2:0,y2:half,stroke:c,'stroke-width':1.5,'data-bs-surface':'true'}));
        if(e.type==='pbs')body.append(make('text',{x:-half*.35,y:3,'text-anchor':'middle',fill:'#fff0f4','font-size':Math.min(9,half*.45)},'P'));
      } else if (e.type === 'fiber') {
        body.append(box(0,-half,22,e.aperture,'#3c4b54','#bdb3dd'),line([0,-e.coreDiameter/2],[0,e.coreDiameter/2],'#f1e9ff',3),line([22,0],[48,0],'#bdb3dd',3));
      } else if (e.type === 'camera') {
        body.append(box(2,-half,26,e.aperture,'#3e4649',c),line([0,-half],[0,half],'#ffe0a4',3),
          box(9,-Math.min(10,half/2),13,Math.min(20,half),'#182a30',c));
      } else if (e.type === 'screen') {
        body.append(box(-4,-half,8,e.aperture,'#344d42','#a6d3a6'));
        for(let y=-half+5;y<half;y+=8)body.append(line([-3,y],[3,y],'#a6d3a6',.8));
      } else if (e.type === 'blocker') body.append(box(-7,-half,14,e.aperture,'#2c3539','#a9afb0'));
      else body.append(box(-4,-half,8,e.aperture,'#82745b','#e3cda5'),line([-4,-half],[-4,half],'#f7e7c4',2));
      return body;
    }
    function drawNode(e, selectedId, showLabels, isPreview = false, previewLabel = 'ここに配置', selectedIds = [selectedId]) {
      let entry = !isPreview && nodes.get(e.id);
      if (!entry) {
        const node = make('g',isPreview?{class:'optical-element placement-preview'}:{class:'optical-element','data-element-id':e.id,role:'button',tabindex:0});
        entry={node};
        if(!isPreview){nodes.set(e.id,entry);byId('elements').append(node);}
      }
      const n=entry.node,k=pixel(),half=['laser','point'].includes(e.type)?Math.max(18,Math.min(65,e.beamWidth/2+4)):e.aperture/2;
      n.setAttribute('transform',`translate(${e.x} ${e.y})`);
      n.classList.toggle('is-selected',selectedIds.includes(e.id));
      n.classList.toggle('is-primary',e.id===selectedId);
      n.classList.toggle('is-disabled',!e.enabled);
      if(!isPreview){const mate=fiberMate(e),kind=e.label&&['splitter','pbs'].includes(e.type)?'、'+O.TYPES[e.type].label:'';n.setAttribute('aria-pressed',String(selectedIds.includes(e.id)));n.setAttribute('aria-label',`${title(e)}${kind}。X ${round(e.x)}、Y ${round(e.y)} mm、角度 ${round(e.angle)} 度${e.enabled?'':'、無効'}${mate?'、接続先 '+title(mate):''}`);}
      const sag=e.type==='concave'?O.concaveGeometry(e).sag:0,isBS=['splitter','pbs'].includes(e.type);
      const hitHalf=Math.max(isBS?half+4:12,10*k),ringHalf=isBS?half+8:18;
      const body=bodyFor(e),hit=make('rect',{x:e.type==='laser'?-38:-sag-hitHalf,y:-Math.max(half+4,13*k),width:e.type==='laser'?48:sag+2*hitHalf,height:Math.max(half*2+8,26*k),class:'element-hit'});
      body.append(make('rect',{x:e.type==='laser'?-40:-sag-ringHalf,y:-half-8,width:e.type==='laser'?52:sag+2*ringHalf,height:2*half+16,rx:6,class:'selection-ring'}),hit);
      body.setAttribute('transform',`rotate(${e.angle})`);
      const children=[body];
      if(e.id===selectedId&&!isPreview){
        const axis=O.direction(e.angle),radius=Math.max(half+20,32*k);
        children.push(make('line',{x1:0,y1:0,x2:axis.x*radius,y2:axis.y*radius,class:'rotation-arm'}),make('circle',{cx:axis.x*radius,cy:axis.y*radius,r:5*k,class:'rotation-handle','data-rotate':e.id}));
      }
      if(showLabels||isPreview&&previewLabel){
        const name=isPreview?previewLabel:!e.label&&['splitter','pbs'].includes(e.type)?`${O.TYPES[e.type].short} ${e.id}`:title(e);
        const axis=O.direction(e.angle),sideLabel=Math.abs(axis.y)>.65&&!['laser','splitter','pbs'].includes(e.type),side=e.enabled?1:-1;
        const above=e.type==='concave'||e.type==='fiber'&&fiberMate(e)&&!isPreview;
        const extentY=half*(isBS?Math.max(Math.abs(axis.x),Math.abs(axis.y)):Math.abs(axis.x));
        const tx=sideLabel?side*(half*Math.abs(axis.y)+14*k):0,ty=sideLabel?-4*k:(above?-1:1)*(extentY+17*k);
        const anchor=sideLabel?(side>0?'start':'end'):'middle';
        children.push(make('text',{x:tx,y:ty,'text-anchor':anchor,'font-size':11*k,class:'element-name'},name.length>28?name.slice(0,27)+'…':name));
        if(!isPreview)children.push(make('text',{x:tx,y:ty+14*k,'text-anchor':anchor,'font-size':9*k,class:'element-info'},information(e)));
      }
      n.replaceChildren(...children);
      return n;
    }
    function grid(scene) {
      const px=pixel(), visible=visibleBounds(); let step=scene.gridStep;
      while(step/px<8)step*=2;
      let major=step*5;
      while(major/px<80)major*=2;
      for(const id of ['table-background','table-clip-rect'])for(const key of ['x','y','width','height'])byId(id).setAttribute(key,visible[key]);
      for(const [id,size] of [['minor-grid',step],['major-grid',major]]){byId(id).setAttribute('width',size);byId(id).setAttribute('height',size);}
      byId('minor-grid-path').setAttribute('d',`M ${step} 0 H 0 V ${step}`);
      byId('major-grid-path').setAttribute('d',`M ${major} 0 H 0 V ${major}`);
      byId('major-grid-fill').setAttribute('width',major);byId('major-grid-fill').setAttribute('height',major);
      const scale=scene.unit==='in'?25.4:scene.unit==='cm'?10:1;
      const labels=[make('rect',{x:visible.x,y:visible.y,width:visible.width,height:22*px,fill:'#142831','fill-opacity':.9}),
        make('rect',{x:visible.x,y:visible.y,width:42*px,height:visible.height,fill:'#142831','fill-opacity':.9})];
      const label=value=>Math.abs(value)>=1e7?value.toExponential(1):round(value);
      const startX=Math.ceil((visible.x+45*px)/major),startY=Math.ceil((visible.y+26*px)/major);
      // Iterate visible tick indices only, never all grid cells from the origin.
      const countX=Math.ceil(visible.width/major)+1,countY=Math.ceil(visible.height/major)+1;
      for(let i=0;i<countX;i++){const x=(startX+i)*major;if(x>visible.x+visible.width-16*px)break;labels.push(make('text',{x,y:visible.y+14*px,'text-anchor':'middle','font-size':9*px},label(x/scale)));}
      for(let i=0;i<countY;i++){const y=(startY+i)*major;if(y>visible.y+visible.height-12*px)break;labels.push(make('text',{x:visible.x+37*px,y:y+3*px,'text-anchor':'end','font-size':9*px},label(y/scale)));}
      byId('rulers').replaceChildren(...labels);
      byId('grid-readout').textContent=`grid ${round(scene.gridStep/scale)} ${scene.unit}${step!==scene.gridStep?' · 表示線 '+round(step/scale)+' '+scene.unit:''}`;
    }
    function draw(scene, selectedId, result, showLabels=true, selectedIds=[selectedId]) {
      cache=[scene,selectedId,result,showLabels,selectedIds]; grid(scene);
      const cables=[];
      for(const link of scene.fiberLinks||[]){
        const a=scene.elements.find(e=>e.id===link.a),b=scene.elements.find(e=>e.id===link.b);
        if(!a||!b)continue;
        const active=a.enabled&&b.enabled,selected=selectedIds.includes(a.id)||selectedIds.includes(b.id);
        const group=make('g',{'data-fiber-link':`${a.id}:${b.id}`,opacity:active?1:.4});
        const shape={d:fiberCablePath(a,b),fill:'none','vector-effect':'non-scaling-stroke','stroke-linecap':'round'};
        group.append(make('title',{},`${title(a)} ↔ ${title(b)}（模式的な接続線）`),
          make('path',{...shape,stroke:'#11252c','stroke-width':selected?7:6}),
          make('path',{...shape,stroke:selected?'#d4baf1':'#a997c1','stroke-width':selected?3.5:2.5,...(active?{}:{'stroke-dasharray':'7 5'})}));
        cables.push(group);
      }
      byId('fiber-links').replaceChildren(...cables);
      for(const [id,entry] of nodes)if(!scene.elements.some(e=>e.id===id)){entry.node.remove();nodes.delete(id);}
      for(const e of scene.elements)drawNode(e,selectedId,showLabels,false,'ここに配置',selectedIds);
      const displayed=displaySegments(result.segments),maxPower=Math.max(...displayed.map(s=>s.power),1e-10);
      byId('rays').replaceChildren(...displayed.map(s=>make('line',{x1:s.a.x,y1:s.a.y,x2:s.b.x,y2:s.b.y,stroke:s.color,'stroke-width':1.35,opacity:Math.max(.16,Math.min(.95,Math.sqrt(s.power/maxPower))),'vector-effect':'non-scaling-stroke',...(s.nonvisible?{'stroke-dasharray':'5 5'}:{})})));
      const e=scene.elements.find(item=>item.id===selectedId),guides=[],k=pixel();
      if(e&&['lens','objective','concave'].includes(e.type)){
        const curved=e.type==='concave',axis=O.direction(e.angle),p=d=>({x:e.x+d*axis.x,y:e.y+d*axis.y}),a=p(-(curved?2:1)*Math.abs(e.focal)-15),b=p(curved?15:Math.abs(e.focal)+15);
        guides.push(make('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#86b8c4','stroke-width':.8*k,'stroke-dasharray':`${5*k} ${5*k}`,opacity:.6}));
        for(const [sign,name] of (curved?[[-1,'F'],[-2,'C']]:[[-1,'F'],[1,'F']])){const f=p(sign*e.focal);guides.push(make('path',{d:`M ${f.x-4*k} ${f.y} h ${8*k} M ${f.x} ${f.y-4*k} v ${8*k}`,fill:'none',stroke:'#bce0e5','stroke-width':k}),make('text',{x:f.x+8*k,y:f.y-7*k,'font-size':10*k,fill:'#bed9de'},name));}
      }
      byId('guides').replaceChildren(...guides);
      const percent=BASE_VIEW.width/viewport.width*100;
      byId('zoom-level').value=`${percent>=10?Math.round(percent):percent<.01?percent.toExponential(0):Number(percent.toPrecision(2))}%`;
      drawProbe();
    }
    function drawProbe() {
      const group = byId('ray-probe');
      group.replaceChildren();
      if (!probe) return;
      const { segment: s, t } = probe, k = pixel(), dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, length = Math.hypot(dx, dy);
      if (!length) return;
      const x = s.a.x + t * dx, y = s.a.y + t * dy, ux = dx / length, uy = dy / length;
      const line = { x1: s.a.x, y1: s.a.y, x2: s.b.x, y2: s.b.y, 'vector-effect': 'non-scaling-stroke' };
      group.append(make('line', { ...line, stroke: '#10252d', 'stroke-width': 6 }),
        make('line', { ...line, stroke: '#f5ffe0', 'stroke-width': 2, 'stroke-dasharray': '5 4' }),
        make('circle', { cx: x, cy: y, r: 6 * k, fill: '#142831', stroke: O.wavelengthColor(s.wavelength), 'stroke-width': 2 * k }),
        make('path', { d: `M ${x + (10*ux - 4*uy)*k} ${y + (10*uy + 4*ux)*k} L ${x + 16*ux*k} ${y + 16*uy*k} L ${x + (10*ux + 4*uy)*k} ${y + (10*uy - 4*ux)*k}`, fill: 'none', stroke: '#f5ffe0', 'stroke-width': 2*k }));
    }
    function markProbe(value) { probe = value; drawProbe(); }
    function preview(e, message = 'ここに配置') { byId('placement').replaceChildren(...(e?[drawNode(e,-1,true,true,message)]:[])); }
    function previewGroup(elements, message = 'ここに複製') { byId('placement').replaceChildren(...elements.map((e,i)=>drawNode(e,-1,i===0,true,i===0?message:''))); }
    function marquee(rect) { byId('selection-marquee').replaceChildren(...(rect?[make('rect',{...rect,class:'marquee-box','vector-effect':'non-scaling-stroke'})]:[])); }
    function exportSvg(name) {
      const copy=bench.cloneNode(true), area=visibleBounds();
      copy.setAttribute('viewBox',`${area.x} ${area.y} ${area.width} ${area.height}`);
      copy.setAttribute('xmlns',ns);copy.setAttribute('width','1400');copy.setAttribute('height',String(Math.round(1400*area.height/area.width)));
      copy.removeAttribute('tabindex');copy.removeAttribute('class');
      for(const node of copy.querySelectorAll('.selection-ring,.rotation-handle,.rotation-arm,#placement,.element-hit,#ray-probe,#selection-marquee'))node.remove();
      for(const node of copy.querySelectorAll('[tabindex]'))node.removeAttribute('tabindex');
      const style=make('style',{},'.element-name{fill:#deebe6;paint-order:stroke;stroke:#142831;stroke-width:4;stroke-linejoin:round}.element-info{fill:#b5cec4;paint-order:stroke;stroke:#142831;stroke-width:3}.is-disabled{opacity:.32}#rulers{fill:#9aafaf;font-family:monospace}text{font-family:Segoe UI,sans-serif}');
      copy.prepend(make('rect',{x:area.x,y:area.y,width:area.width,height:area.height,fill:'#142831'}),style,make('title',{},name));
      return new XMLSerializer().serializeToString(copy);
    }
    return { draw,point,inside,preview,previewGroup,marquee,exportSvg,markProbe,worldPerPixel:pixel,visibleBounds,
      fit:(elements=cache?.[0]?.elements||[],fiberLinks=cache?.[0]?.fiberLinks||[])=>setView(fitView(elements,bench.getBoundingClientRect(),fiberLinks)),
      getView:()=>({...viewport}),setView,zoom:(factor,anchor)=>setView(zoomAt(viewport,factor,anchor||{x:viewport.x+viewport.width/2,y:viewport.y+viewport.height/2})),focus:id=>nodes.get(id)?.node.focus({preventScroll:true}),title };
  }
  return {BASE_VIEW,MIN_VIEW_WIDTH,MAX_VIEW_WIDTH,snapAngle,place,nudge,pastePosition,marqueeRect,marqueeIds,groupDelta,pasteGroupDelta,zoomAt,clampView,fitView,fiberCablePoints,fiberCablePath,pickSegments,polarizationState,formatWavelength,spectrumLabel,spectrumSwatch,displaySegments,symbols,create};
});
