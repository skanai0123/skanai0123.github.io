(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./optics.js') : root.Optics);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OpticsView = api;
})(typeof window === 'undefined' ? this : window, function (O) {
  'use strict';
  const BASE_VIEW = Object.freeze({ x: -48, y: -42, width: 1096, height: 704 });
  const round = value => Number(value.toFixed(6));
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  function snapAngle(angle, enabled = true) {
    return O.normalizeAngle(enabled ? Math.round(angle / 22.5) * 22.5 : round(angle));
  }
  function place(x, y, gridStep, snap = true) {
    // Decimal inch grids can divide to just below an exact half-step.
    const quantize = v => {
      const index = v / gridStep;
      const tolerance = Number.EPSILON * Math.max(1, Math.abs(index)) * 4;
      return round(snap ? Math.floor(index + 0.5 + tolerance) * gridStep : v);
    };
    return { x: clamp(quantize(x), O.MARGIN, O.WIDTH - O.MARGIN), y: clamp(quantize(y), O.MARGIN, O.HEIGHT - O.MARGIN) };
  }
  function clampView(view) {
    return { ...view, x: clamp(view.x, -view.width + 40, O.WIDTH - 40), y: clamp(view.y, -view.height + 40, O.HEIGHT - 40) };
  }
  function nudge(point, dx, dy, gridStep, snap = true, multiplier = 1) {
    const step = (snap ? gridStep : 1) * multiplier;
    const moved = place(point.x + dx * step, point.y + dy * step, gridStep, snap);
    return { x: dx ? moved.x : point.x, y: dy ? moved.y : point.y };
  }
  function zoomAt(view, factor, anchor) {
    const width = clamp(view.width / factor, BASE_VIEW.width / 10, BASE_VIEW.width * 1.5);
    const ratio = width / view.width;
    return clampView({ x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio, width, height: view.height * ratio });
  }
  const symbols = { laser:'↦', point:'✦', mirror:'╱', lens:'↕', iris:'◉', polarizer:'P', waveplate:'¼', dichroic:'╱', objective:'⌁', fiber:'⊙', blocker:'■', splitter:'◇', screen:'▥' };

  function create(bench) {
    const doc = bench.ownerDocument, ns = 'http://www.w3.org/2000/svg';
    const byId = id => doc.getElementById(id);
    const nodes = new Map();
    let viewport = { ...BASE_VIEW }, cache = null;
    const make = (tag, attrs = {}, text) => {
      const node = doc.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const pixel = () => Math.max(viewport.width / Math.max(bench.getBoundingClientRect().width, 1), viewport.height / Math.max(bench.getBoundingClientRect().height, 1));
    function setView(value) { viewport = clampView(value); bench.setAttribute('viewBox', `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`); if (cache) draw(...cache); }
    function point(event) {
      const p = bench.createSVGPoint(); p.x = event.clientX; p.y = event.clientY;
      return p.matrixTransform(bench.getScreenCTM().inverse());
    }
    function inside(event) {
      const r = bench.getBoundingClientRect(), p = point(event);
      return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom && p.x >= 0 && p.x <= O.WIDTH && p.y >= 0 && p.y <= O.HEIGHT;
    }
    function title(e) { return e.label || `${O.TYPES[e.type].label} ${e.id}`; }
    function information(e) {
      const unit = cache?.[0]?.unit || 'mm', scale = unit === 'cm' ? 10 : unit === 'in' ? 25.4 : 1;
      const length = value => round(value / scale) + ' ' + unit;
      if (['laser','point'].includes(e.type)) return `${e.wavelength} nm${e.wavelength < 380 ? ' · UV' : e.wavelength > 780 ? ' · IR' : ''}`;
      if (['lens','objective'].includes(e.type)) return `f ${length(e.focal)}${e.type === 'objective' ? ' · NA '+e.na : ''}`;
      if (e.type === 'iris') return `開口 ${length(e.opening)}`;
      if (['polarizer','waveplate'].includes(e.type)) return `軸 ${round(e.axisAngle)}°`;
      if (e.type === 'dichroic') return `${e.mode === 'longpass' ? 'LP' : 'SP'} ${e.cutoff} nm`;
      if (e.type === 'fiber') return `core ${length(e.coreDiameter)} · NA ${e.na}`;
      if (e.type === 'splitter') return `T ${Math.round(e.transmission*100)}%`;
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
      } else if (e.type === 'polarizer' || e.type === 'waveplate') {
        body.append(box(-7,-half,14,e.aperture,e.type==='polarizer'?'#77624a':'#74618b',c),make('text',{x:0,y:4,'text-anchor':'middle',fill:'#fff','font-size':11},e.type==='polarizer'?'P':'¼'));
      } else if (e.type === 'dichroic') {
        body.append(line([-2,-half],[-2,half],'#95dce2',4),line([2,-half],[2,half],'#e7baaa',3));
      } else if (e.type === 'splitter') {
        body.append(box(-6,-half,12,e.aperture,'#526977','#b8d7e7'),line([-12,0],[12,0],'#e6f6fd',1));
      } else if (e.type === 'fiber') {
        body.append(box(0,-half,22,e.aperture,'#3c4b54','#bdb3dd'),line([0,-e.coreDiameter/2],[0,e.coreDiameter/2],'#f1e9ff',3),line([22,0],[48,0],'#bdb3dd',3));
      } else if (e.type === 'screen') {
        body.append(box(-4,-half,8,e.aperture,'#344d42','#a6d3a6'));
        for(let y=-half+5;y<half;y+=8)body.append(line([-3,y],[3,y],'#a6d3a6',.8));
      } else if (e.type === 'blocker') body.append(box(-7,-half,14,e.aperture,'#2c3539','#a9afb0'));
      else body.append(box(-4,-half,8,e.aperture,'#82745b','#e3cda5'),line([-4,-half],[-4,half],'#f7e7c4',2));
      return body;
    }
    function drawNode(e, selectedId, showLabels, isPreview = false) {
      let entry = !isPreview && nodes.get(e.id);
      if (!entry) {
        const node = make('g',isPreview?{class:'optical-element placement-preview'}:{class:'optical-element','data-element-id':e.id,role:'button',tabindex:0});
        entry={node};
        if(!isPreview){nodes.set(e.id,entry);byId('elements').append(node);}
      }
      const n=entry.node,k=pixel(),half=['laser','point'].includes(e.type)?Math.max(18,Math.min(65,e.beamWidth/2+4)):e.aperture/2;
      n.setAttribute('transform',`translate(${e.x} ${e.y})`);
      n.classList.toggle('is-selected',e.id===selectedId);
      n.classList.toggle('is-disabled',!e.enabled);
      if(!isPreview){n.setAttribute('aria-pressed',String(e.id===selectedId));n.setAttribute('aria-label',`${title(e)}。X ${round(e.x)}、Y ${round(e.y)} mm、角度 ${round(e.angle)} 度${e.enabled?'':'、無効'}`);}
      const body=bodyFor(e),hit=make('rect',{x:e.type==='laser'?-38:-Math.max(12,10*k),y:-Math.max(half+4,13*k),width:e.type==='laser'?48:Math.max(24,20*k),height:Math.max(half*2+8,26*k),class:'element-hit'});
      body.append(make('rect',{x:e.type==='laser'?-40:-18,y:-half-8,width:e.type==='laser'?52:36,height:2*half+16,rx:6,class:'selection-ring'}),hit);
      body.setAttribute('transform',`rotate(${e.angle})`);
      const children=[body];
      if(e.id===selectedId&&!isPreview){
        const axis=O.direction(e.angle),radius=Math.max(half+20,32*k);
        children.push(make('line',{x1:0,y1:0,x2:axis.x*radius,y2:axis.y*radius,class:'rotation-arm'}),make('circle',{cx:axis.x*radius,cy:axis.y*radius,r:5*k,class:'rotation-handle','data-rotate':e.id}));
      }
      if(showLabels||isPreview){
        const name=isPreview?'ここに配置':title(e);
        const axis=O.direction(e.angle),sideLabel=Math.abs(axis.y)>.65&&e.type!=='laser',side=e.enabled?1:-1;
        const tx=sideLabel?side*(half*Math.abs(axis.y)+14*k):0,ty=sideLabel?-4*k:half*Math.abs(axis.x)+17*k;
        const anchor=sideLabel?(side>0?'start':'end'):'middle';
        children.push(make('text',{x:tx,y:ty,'text-anchor':anchor,'font-size':11*k,class:'element-name'},name.length>28?name.slice(0,27)+'…':name));
        if(!isPreview)children.push(make('text',{x:tx,y:ty+14*k,'text-anchor':anchor,'font-size':9*k,class:'element-info'},information(e)));
      }
      n.replaceChildren(...children);
      return n;
    }
    function grid(scene) {
      const px=pixel(); let step=scene.gridStep;
      while(step/px<7)step*=2;
      const major=step*5;
      for(const [id,size] of [['minor-grid',step],['major-grid',major]]){byId(id).setAttribute('width',size);byId(id).setAttribute('height',size);}
      byId('minor-grid-path').setAttribute('d',`M ${step} 0 H 0 V ${step}`);
      byId('major-grid-path').setAttribute('d',`M ${major} 0 H 0 V ${major}`);
      byId('major-grid-fill').setAttribute('width',major);byId('major-grid-fill').setAttribute('height',major);
      const scale=scene.unit==='in'?25.4:scene.unit==='cm'?10:1,labels=[];
      for(let x=0;x<=O.WIDTH+1e-7;x+=major)labels.push(make('text',{x,y:-12*px,'text-anchor':'middle','font-size':10*px},round(x/scale)));
      for(let y=0;y<=O.HEIGHT+1e-7;y+=major)labels.push(make('text',{x:-10*px,y:y+3*px,'text-anchor':'end','font-size':10*px},round(y/scale)));
      byId('rulers').replaceChildren(...labels);
      byId('grid-readout').textContent=`grid ${round(scene.gridStep/scale)} ${scene.unit}${step!==scene.gridStep?' · 表示線 '+round(step/scale)+' '+scene.unit:''}`;
    }
    function draw(scene, selectedId, result, showLabels=true) {
      cache=[scene,selectedId,result,showLabels]; grid(scene);
      for(const [id,entry] of nodes)if(!scene.elements.some(e=>e.id===id)){entry.node.remove();nodes.delete(id);}
      for(const e of scene.elements)drawNode(e,selectedId,showLabels);
      const maxPower=Math.max(...result.segments.map(s=>s.power),1e-10);
      byId('rays').replaceChildren(...result.segments.map(s=>make('line',{x1:s.a.x,y1:s.a.y,x2:s.b.x,y2:s.b.y,stroke:O.wavelengthColor(s.wavelength),'stroke-width':1.35,opacity:Math.max(.16,Math.min(.95,Math.sqrt(s.power/maxPower))),'vector-effect':'non-scaling-stroke',...(s.wavelength<380||s.wavelength>780?{'stroke-dasharray':'5 5'}:{})})));
      const e=scene.elements.find(item=>item.id===selectedId),guides=[],k=pixel();
      if(e&&['lens','objective'].includes(e.type)){
        const axis=O.direction(e.angle),p=d=>({x:e.x+d*axis.x,y:e.y+d*axis.y}),a=p(-Math.abs(e.focal)-15),b=p(Math.abs(e.focal)+15);
        guides.push(make('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#86b8c4','stroke-width':.8*k,'stroke-dasharray':`${5*k} ${5*k}`,opacity:.6}));
        for(const sign of [-1,1]){const f=p(sign*e.focal);guides.push(make('path',{d:`M ${f.x-4*k} ${f.y} h ${8*k} M ${f.x} ${f.y-4*k} v ${8*k}`,fill:'none',stroke:'#bce0e5','stroke-width':k}),make('text',{x:f.x+8*k,y:f.y-7*k,'font-size':10*k,fill:'#bed9de'},'F'));}
      }
      byId('guides').replaceChildren(...guides);
      byId('zoom-level').value=`${Math.round(BASE_VIEW.width/viewport.width*100)}%`;
    }
    function preview(e) { byId('placement').replaceChildren(...(e?[drawNode(e,-1,true,true)]:[])); }
    function exportSvg(name) {
      const copy=bench.cloneNode(true);
      copy.setAttribute('xmlns',ns);copy.setAttribute('width','1400');copy.setAttribute('height',String(Math.round(1400*viewport.height/viewport.width)));
      copy.removeAttribute('tabindex');copy.removeAttribute('class');
      for(const node of copy.querySelectorAll('.selection-ring,.rotation-handle,.rotation-arm,#placement,.element-hit'))node.remove();
      for(const node of copy.querySelectorAll('[tabindex]'))node.removeAttribute('tabindex');
      const style=make('style',{},'.element-name{fill:#deebe6;paint-order:stroke;stroke:#142831;stroke-width:4;stroke-linejoin:round}.element-info{fill:#b5cec4;paint-order:stroke;stroke:#142831;stroke-width:3}.is-disabled{opacity:.32}#rulers{fill:#9aafaf;font-family:monospace}text{font-family:Segoe UI,sans-serif}');
      copy.prepend(make('rect',{x:viewport.x,y:viewport.y,width:viewport.width,height:viewport.height,fill:'#142831'}),style,make('title',{},name));
      return new XMLSerializer().serializeToString(copy);
    }
    return { draw,point,inside,preview,exportSvg,fit:()=>setView({...BASE_VIEW}),getView:()=>({...viewport}),setView,zoom:(factor,anchor)=>setView(zoomAt(viewport,factor,anchor||{x:viewport.x+viewport.width/2,y:viewport.y+viewport.height/2})),focus:id=>nodes.get(id)?.node.focus({preventScroll:true}),title };
  }
  return {BASE_VIEW,snapAngle,place,nudge,zoomAt,clampView,symbols,create};
});
