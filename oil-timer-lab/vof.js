/*
 * Immiscible 2D flow: geometric PLIC volume transport on a staggered grid.
 * VOF stores occupied area, not dissolved concentration. The two directional
 * sweeps use the same frozen step function for their divergence correction
 * (Weymouth & Yue), so incompressible face velocities conserve oil volume.
 * References: https://basilisk.fr/src/vof.h and /src/fractions.h
 * The flow model is Boussinesq, with model-unit coefficients, not a calibrated
 * variable-density two-fluid solver. No empirical relative settling is used.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OilTimerVOF = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  // Area of n.x*x + n.y*y <= alpha inside the unit square. Reflections
  // reduce all signs to the CDF of the sum of two uniform distributions.
  function lineArea(nx, ny, alpha) {
    alpha -= Math.min(0, nx) + Math.min(0, ny);
    const a = Math.min(Math.abs(nx), Math.abs(ny));
    const b = Math.max(Math.abs(nx), Math.abs(ny));
    if (b < 1e-14) return alpha >= 0 ? 1 : 0;
    if (alpha <= 0) return 0;
    if (alpha >= a + b) return 1;
    const reflected = alpha > (a + b) / 2;
    const t = reflected ? a + b - alpha : alpha;
    const area = a < 1e-14 ? t / b : (t < a ? t * t / (2 * a * b) : (t - a / 2) / b);
    return clamp(reflected ? 1 - area : area, 0, 1);
  }

  function lineAlpha(nx, ny, fraction) {
    const a = Math.min(Math.abs(nx), Math.abs(ny));
    const b = Math.max(Math.abs(nx), Math.abs(ny));
    const f = Math.min(fraction, 1 - fraction);
    const t = a > 1e-14 && f < a / (2 * b)
      ? Math.sqrt(2 * a * b * f) : b * f + a / 2;
    return (fraction > 0.5 ? a + b - t : t) + Math.min(0, nx) + Math.min(0, ny);
  }

  function sweptArea(nx, ny, alpha, amount, horizontal, positive) {
    const lo = positive ? 1 - amount : 0;
    return horizontal
      ? amount * lineArea(nx * amount, ny, alpha - nx * lo)
      : amount * lineArea(nx, ny * amount, alpha - ny * lo);
  }

  // A light paddle wheel coupled to the grid by dissipative drag. The blades
  // are permeable force strips, NOT moving solid-mask cells. Keeping the
  // volume grid fixed avoids deleting oil when a blade rotates through it.
  class PaddleWheel {
    constructor({ x, y, radius = 22, hubRadius = 4, thickness = 1.4, blades = 6,
      inertia = 0.08 * radius ** 4, drag = 16, damping = 0.025 }) {
      Object.assign(this, { x, y, radius, hubRadius, thickness, blades, inertia, drag, damping });
      this.reset();
    }

    reset() { this.angle = 0; this.omega = 0; this.torque = 0; }

    makePorts(positions, cellArea) {
      return positions.filter(p => Math.hypot(p.x - this.x, p.y - this.y) <= this.radius + this.thickness)
        .map(p => ({ ...p, dx: p.x - this.x, dy: p.y - this.y,
          lever: p.horizontal ? this.y - p.y : p.x - this.x, mass: cellArea, weight: 0 }));
    }

    couple(dt, ports, frameAlpha = 0) {
      if (!(dt > 0) || !Number.isFinite(dt)) return;
      // omega is relative to the vessel; a turning support changes it even
      // without flow. Bearing friction dissipates relative rotation.
      this.omega = (this.omega - frameAlpha * dt) * Math.exp(-this.damping * dt);
      const before = this.omega, sector = 2 * Math.PI / this.blades;
      for (const p of ports) {
        const r = Math.hypot(p.dx, p.dy);
        const phase = Math.atan2(p.dy, p.dx) - this.angle;
        const a = phase - Math.round(phase / sector) * sector;
        const along = r * Math.cos(a), across = Math.abs(r * Math.sin(a));
        p.weight = along >= this.hubRadius && along <= this.radius
          ? Math.max(0, 1 - across / this.thickness) : 0;
      }
      // Forward/backward half sweeps reduce ordering bias. Each implicit
      // pair impulse conserves angular momentum and cannot add kinetic energy:
      // J = -(v-l*w) / (1/m + l*l/I + 1/(k*dt)).
      for (const forward of [true, false]) {
        for (let q = 0; q < ports.length; q++) {
          const p = ports[forward ? q : ports.length - 1 - q];
          if (p.weight === 0) continue;
          const slip = p.field[p.f] - p.lever * this.omega;
          const impulse = -slip / (1 / p.mass + p.lever * p.lever / this.inertia
            + 2 / (this.drag * p.weight * p.mass * dt));
          p.field[p.f] += impulse / p.mass;
          this.omega -= p.lever * impulse / this.inertia;
        }
      }
      this.torque = this.inertia * (this.omega - before) / dt;
    }

    advance(dt) {
      this.angle = (this.angle + this.omega * dt) % (2 * Math.PI);
    }
  }

  class Solver {
    constructor({ nx, ny, mask, width = 144, contactAngle = 90 }) {
      this.nx = nx; this.ny = ny; this.h = width / nx;
      this.mask = Uint8Array.from(mask);
      this.cells = Int32Array.from(Array.from(this.mask.keys()).filter(id => this.mask[id]));
      const n = nx * ny;
      this.c = new Float64Array(n);
      this.u = new Float64Array((nx + 1) * ny);
      this.v = new Float64Array(nx * (ny + 1));
      this.uOld = new Float64Array(this.u.length);
      this.vOld = new Float64Array(this.v.length);
      this.mx = new Float64Array(n); this.my = new Float64Array(n);
      this.alpha = new Float64Array(n);
      this.frozen = new Uint8Array(n);
      this.work = new Float64Array(n); this.smooth = new Float64Array(n);
      this.smoothTmp = new Float64Array(n); this.curvature = new Float64Array(n);
      this.normalX = new Float64Array(n); this.normalY = new Float64Array(n);
      this.fluxX = new Float64Array(this.u.length); this.fluxY = new Float64Array(this.v.length);
      this.xFaces = []; this.yFaces = [];
      for (const a of this.cells) {
        const i = a % nx, j = Math.floor(a / nx);
        if (i + 1 < nx && this.mask[a + 1]) this.xFaces.push({ a, b: a + 1, f: i + 1 + j * (nx + 1) });
        if (j + 1 < ny && this.mask[a + nx]) this.yFaces.push({ a, b: a + nx, f: i + (j + 1) * nx });
      }
      this.neighbors = new Int32Array(n * 4);
      this.wallX = new Float64Array(n); this.wallY = new Float64Array(n);
      for (const id of this.cells) {
        const i = id % nx, j = Math.floor(id / nx);
        for (const [k, di, dj] of [[0,-1,0],[1,1,0],[2,0,-1],[3,0,1]]) {
          const other = id + di + dj * nx;
          this.neighbors[id * 4 + k] = i + di >= 0 && i + di < nx && j + dj >= 0 && j + dj < ny && this.mask[other] ? other : id;
          if (this.neighbors[id * 4 + k] === id) { this.wallX[id] -= di; this.wallY[id] -= dj; }
        }
        const length = Math.hypot(this.wallX[id], this.wallY[id]);
        if (length > 0) { this.wallX[id] /= length; this.wallY[id] /= length; }
      }
      this.rank = new Int32Array(n).fill(-1);
      this.cells.forEach((id, q) => { this.rank[id] = q; });
      this.factorPressure();
      this.pressure = new Float64Array(this.cells.length);
      this.divergence = new Float64Array(n);
      this.stats = { divergence: 0, maxCfl: 0, substeps: 0, boundError: 0 };
      this.iteration = 0;
      this.buildRenderSources();
      this.setContactAngle(contactAngle);
    }

    attachWheel(wheel) {
      this.wheel = wheel;
      const positions = [];
      if (wheel) for (const horizontal of [true, false]) {
        const width = this.nx + (horizontal ? 1 : 0);
        for (const {f} of horizontal ? this.xFaces : this.yFaces) {
          positions.push({ field: horizontal ? this.u : this.v, f, horizontal,
            x: (f % width + (horizontal ? 0 : 0.5)) * this.h,
            y: (Math.floor(f / width) + (horizontal ? 0.5 : 0)) * this.h });
        }
      }
      this.wheelPorts = wheel ? wheel.makePorts(positions, this.h * this.h) : [];
    }

    setContactAngle(degrees) {
      if (!Number.isFinite(degrees)) return;
      const angle = clamp(degrees, 15, 165);
      if (angle === this.contactAngle) return;
      this.contactAngle = angle;
      this.contactCos = Math.cos(angle * Math.PI / 180);
      this.contactSin = Math.sin(angle * Math.PI / 180);
      this.reconstruct();
    }

    contactNormal(gx, gy, wx, wy) {
      // n points out of oil; w points out of the solid into the liquid.
      // The angle is measured THROUGH OIL: n.w = cos(theta). A large
      // angle therefore disfavors oil spreading across the solid surface.
      // Preserve the tangential orientation. A parallel, uniform film has
      // no contact line, so do not invent a tangent or push it off the wall.
      const tangent = -wy * gx + wx * gy;
      if (Math.abs(tangent) < 1e-10 || wx * wx + wy * wy < 0.5) return [gx, gy];
      const sign = Math.sign(tangent);
      return [this.contactCos * wx - sign * this.contactSin * wy,
        this.contactCos * wy + sign * this.contactSin * wx];
    }

    wallValue(field, id, wx, wy) {
      // Continue the interface geometrically into a ghost cell for the
      // curvature stencil only. Copying the center value here biases the
      // normal gradient toward a 90-degree angle even when theta differs.
      const n=id*4, nb=this.neighbors, gx=field[nb[n]]-field[nb[n+1]], gy=field[nb[n+2]]-field[nb[n+3]];
      if (Math.abs(-wy*gx+wx*gy)<1e-10) return field[id];
      let [mx,my]=this.contactNormal(gx,gy,wx,wy);
      const length=Math.abs(mx)+Math.abs(my);
      mx/=length; my/=length;
      return lineArea(mx,my,lineAlpha(mx,my,clamp(field[id],0,1))+mx*wx+my*wy);
    }

    factorPressure() {
      const faces = [...this.xFaces, ...this.yFaces], rank = this.rank;
      let band = 0;
      for (const { a, b } of faces) band = Math.max(band, rank[b] - rank[a]);
      this.stride = band + 1;
      const l = this.factor = new Float64Array(this.cells.length * this.stride);
      for (const { a, b } of faces) {
        const qa = rank[a], qb = rank[b];
        l[qa * this.stride]++; l[qb * this.stride]++;
        l[qb * this.stride + qb - qa] = -1;
      }
      if (l.length) l[0] += 1; // One pressure gauge; the closed vessel has zero net divergence.
      for (let row = 0; row < this.cells.length; row++) {
        const base = row * this.stride, first = Math.max(0, row - band);
        for (let col = first; col <= row; col++) {
          let value = l[base + row - col];
          const other = col * this.stride;
          for (let k = first; k < col; k++) value -= l[base + row - k] * l[other + col - k];
          if (col === row) {
            if (!(value > 0)) throw new Error('The immiscible fluid domain must be connected.');
            l[base] = Math.sqrt(value);
          } else l[base + row - col] = value / l[other];
        }
      }
    }

    reset(upperY, fill = 0.6) {
      this.c.fill(0); this.u.fill(0); this.v.fill(0); this.pressure.fill(0);
      this.iteration = 0;
      const rows = Math.min(this.ny, Math.ceil(upperY / this.h - 0.5));
      let capacity = 0;
      for (const id of this.cells) if (Math.floor(id / this.nx) < rows) capacity++;
      let remaining = capacity * fill;
      for (let j = rows - 1; j >= 0 && remaining > 0; j--) {
        let count = 0;
        for (let i = 0; i < this.nx; i++) count += this.mask[i + j * this.nx];
        if (!count) continue;
        const fraction = Math.min(1, remaining / count);
        for (let i = 0; i < this.nx; i++) if (this.mask[i + j * this.nx]) this.c[i + j * this.nx] = fraction;
        remaining = Math.max(0, remaining - count * fraction);
      }
      this.reconstruct();
    }

    mass() {
      let area = 0;
      for (const id of this.cells) area += this.c[id];
      return area * this.h * this.h;
    }

    value(field, i, j, fallback) {
      return i >= 0 && i < this.nx && j >= 0 && j < this.ny && this.mask[i + j * this.nx]
        ? field[i + j * this.nx] : fallback;
    }

    reconstruct() {
      const { c, nx, mx, my, alpha } = this;
      for (const id of this.cells) {
        if (c[id] <= 0 || c[id] >= 1) { mx[id] = 0; my[id] = 1; alpha[id] = c[id]; continue; }
        const i = id % nx, j = Math.floor(id / nx), center = c[id];
        const l = this.value(c, i-1, j, center), r = this.value(c, i+1, j, center);
        const t = this.value(c, i, j-1, center), b = this.value(c, i, j+1, center);
        const tl = this.value(c, i-1, j-1, center), tr = this.value(c, i+1, j-1, center);
        const bl = this.value(c, i-1, j+1, center), br = this.value(c, i+1, j+1, center);
        let gx = -(2*(r-l) + tr + br - tl - bl);
        let gy = -(2*(b-t) + bl + br - tl - tr);
        if (this.wallX[id] || this.wallY[id]) [gx, gy] = this.contactNormal(gx, gy, this.wallX[id], this.wallY[id]);
        let length = Math.abs(gx) + Math.abs(gy);
        if (length < 1e-12) { gx = 0; gy = 1; length = 1; }
        mx[id] = gx / length; my[id] = gy / length;
        alpha[id] = lineAlpha(mx[id], my[id], clamp(center, 0, 1));
      }
    }

    advect(dt) {
      const ratio = dt / this.h;
      for (const id of this.cells) this.frozen[id] = this.c[id] >= 0.5 ? 1 : 0;
      for (const horizontal of this.iteration % 2 ? [false, true] : [true, false]) {
        this.reconstruct();
        const faces = horizontal ? this.xFaces : this.yFaces;
        const velocity = horizontal ? this.u : this.v;
        const flux = horizontal ? this.fluxX : this.fluxY;
        flux.fill(0);
        for (const { a, b, f } of faces) {
          const amount = Math.abs(velocity[f]) * ratio, donor = velocity[f] >= 0 ? a : b;
          this.stats.maxCfl = Math.max(this.stats.maxCfl, amount);
          if (amount > 0.50000001) throw new Error('VOF transport exceeded its geometric CFL limit.');
          const fraction = this.c[donor];
          const oil = fraction <= 0 ? 0 : fraction >= 1 ? amount
            : sweptArea(this.mx[donor], this.my[donor], this.alpha[donor], amount, horizontal, velocity[f] >= 0);
          flux[f] = velocity[f] >= 0 ? oil : -oil;
        }
        for (const id of this.cells) {
          const i = id % this.nx, j = Math.floor(id / this.nx);
          const first = horizontal ? i + j * (this.nx + 1) : id;
          const last = first + (horizontal ? 1 : this.nx);
          const next = this.c[id] + flux[first] - flux[last] + this.frozen[id] * ratio * (velocity[last] - velocity[first]);
          this.stats.boundError = Math.max(this.stats.boundError, -next, next - 1);
          this.work[id] = clamp(next, 0, 1); // Only roundoff under the VOF CFL.
        }
        for (const id of this.cells) this.c[id] = this.work[id];
      }
      this.iteration++;
    }

    project() {
      const { pressure: q, factor: l, stride, cells, rank, divergence: d } = this;
      const band = stride - 1;
      d.fill(0);
      for (const { a,b,f } of this.xFaces) { d[a] += this.u[f]; d[b] -= this.u[f]; }
      for (const { a,b,f } of this.yFaces) { d[a] += this.v[f]; d[b] -= this.v[f]; }
      for (let row = 0; row < cells.length; row++) {
        let value = -d[cells[row]];
        for (let col = Math.max(0, row-band); col < row; col++) value -= l[row*stride + row-col]*q[col];
        q[row] = value/l[row*stride];
      }
      for (let row = cells.length-1; row >= 0; row--) {
        let value = q[row];
        for (let col = row+1; col <= Math.min(cells.length-1,row+band); col++) value -= l[col*stride + col-row]*q[col];
        q[row] = value/l[row*stride];
      }
      for (const { a,b,f } of this.xFaces) this.u[f] += q[rank[a]] - q[rank[b]];
      for (const { a,b,f } of this.yFaces) this.v[f] += q[rank[a]] - q[rank[b]];
      d.fill(0);
      for (const { a,b,f } of this.xFaces) { d[a] += this.u[f]; d[b] -= this.u[f]; }
      for (const { a,b,f } of this.yFaces) { d[a] += this.v[f]; d[b] -= this.v[f]; }
      let error = 0;
      for (const id of cells) error = Math.max(error, Math.abs(d[id])/this.h);
      this.stats.divergence = error;
    }

    sampleFace(field, x, y, horizontal) {
      const w = this.nx + (horizontal ? 1 : 0), height = this.ny + (horizontal ? 0 : 1);
      const gx = clamp(x / this.h - (horizontal ? 0 : 0.5), 0, w-1);
      const gy = clamp(y / this.h - (horizontal ? 0.5 : 0), 0, height-1);
      const i = Math.min(w-2, Math.floor(gx)), j = Math.min(height-2, Math.floor(gy));
      const tx = gx-i, ty = gy-j, a = i+j*w;
      return (field[a]*(1-tx)+field[a+1]*tx)*(1-ty) + (field[a+w]*(1-tx)+field[a+w+1]*tx)*ty;
    }

    computeCurvature() {
      // Smooth only the force stencil, never the transported oil fractions.
      this.smooth.set(this.c);
      for (let pass=0;pass<2;pass++) {
        for (const id of this.cells) {
          const n=id*4, nb=this.neighbors, s=this.smooth;
          this.smoothTmp[id]=(4*s[id]
            +(nb[n]===id?this.wallValue(s,id,1,0):s[nb[n]])
            +(nb[n+1]===id?this.wallValue(s,id,-1,0):s[nb[n+1]])
            +(nb[n+2]===id?this.wallValue(s,id,0,1):s[nb[n+2]])
            +(nb[n+3]===id?this.wallValue(s,id,0,-1):s[nb[n+3]]))/8;
        }
        for (const id of this.cells) this.smooth[id]=this.smoothTmp[id];
      }
      for (const id of this.cells) {
        const n=id*4, nb=this.neighbors, s=this.smooth;
        const gx=(nb[n]===id?this.wallValue(s,id,1,0):s[nb[n]])-(nb[n+1]===id?this.wallValue(s,id,-1,0):s[nb[n+1]]);
        const gy=(nb[n+2]===id?this.wallValue(s,id,0,1):s[nb[n+2]])-(nb[n+3]===id?this.wallValue(s,id,0,-1):s[nb[n+3]]);
        const norm=Math.hypot(gx,gy);
        this.normalX[id]=norm>1e-10?gx/norm:0;
        this.normalY[id]=norm>1e-10?gy/norm:0;
      }
      for (const id of this.cells) {
        const n=id*4, nb=this.neighbors;
        const at=(other,component)=>Math.hypot(this.normalX[other],this.normalY[other])>0.5?component[other]:component[id];
        const gx=this.normalX[id], gy=this.normalY[id];
        // Finite-volume divergence of the interface normal. Impose the
        // equilibrium angle on SOLID FACES, not throughout the liquid.
        // No transported fraction is overwritten by this boundary condition.
        const left=nb[n]===id?this.contactNormal(gx,gy,1,0)[0]:0.5*(gx+at(nb[n],this.normalX));
        const right=nb[n+1]===id?this.contactNormal(gx,gy,-1,0)[0]:0.5*(gx+at(nb[n+1],this.normalX));
        const top=nb[n+2]===id?this.contactNormal(gx,gy,0,1)[1]:0.5*(gy+at(nb[n+2],this.normalY));
        const bottom=nb[n+3]===id?this.contactNormal(gx,gy,0,-1)[1]:0.5*(gy+at(nb[n+3],this.normalY));
        this.curvature[id]=clamp((right-left+bottom-top)/this.h,-1/this.h,1/this.h);
      }
    }

    step(dt, options = {}) {
      const { oilDensity=1.1, waterDensity=1, viscosity=2, waterViscosity=0.4,
        surfaceTension=20, buoyancy=0, gravity={x:0,y:1}, omega=0, alpha=0,
        contactAngle=this.contactAngle } = options;
      if (!(dt > 0) || !Number.isFinite(dt)) return;
      this.setContactAngle(contactAngle);
      const h=this.h, contrast=clamp((oilDensity-waterDensity)/waterDensity*(1+buoyancy),-8,8);
      const sigma=surfaceTension*0.01/Math.max(0.05,waterDensity);
      const maxNu=0.001+Math.max(viscosity,waterViscosity)*0.035;
      let maxSpeed=0;
      for(const {f} of this.xFaces) maxSpeed=Math.max(maxSpeed,Math.abs(this.u[f]));
      for(const {f} of this.yFaces) maxSpeed=Math.max(maxSpeed,Math.abs(this.v[f]));
      if (this.wheel) maxSpeed=Math.max(maxSpeed,Math.abs(this.wheel.omega)*this.wheel.radius);
      const capillary=sigma>0 ? 0.3*Math.sqrt(h*h*h/sigma) : Infinity;
      const maxDt=Math.min(0.4*h/(maxSpeed+8*dt+1e-9),0.23*h*h/maxNu,capillary);
      const steps=Math.max(1,Math.ceil(dt/maxDt)), subDt=dt/steps;
      this.stats.substeps=steps; this.stats.maxCfl=0; this.stats.boundError=0;
      for(let sub=0;sub<steps;sub++) {
        this.uOld.set(this.u); this.vOld.set(this.v);
        this.computeCurvature();
        for(const horizontal of [true,false]) {
          const faces=horizontal?this.xFaces:this.yFaces, target=horizontal?this.u:this.v;
          const source=horizontal?this.uOld:this.vOld;
          const w=this.nx+(horizontal?1:0), height=this.ny+(horizontal?0:1);
          for(const {a,b,f} of faces) {
            const i=f%w,j=Math.floor(f/w);
            const x=(i+(horizontal?0:0.5))*h,y=(j+(horizontal?0.5:0))*h;
            const vx=this.sampleFace(this.uOld,x,y,true), vy=this.sampleFace(this.vOld,x,y,false);
            const advected=this.sampleFace(source,x-subDt*vx,y-subDt*vy,horizontal);
            const average=0.5*(this.c[a]+this.c[b]);
            const nu=0.001+0.035*(waterViscosity+(viscosity-waterViscosity)*average);
            const lap=(i>0?source[f-1]:0)+(i+1<w?source[f+1]:0)+(j>0?source[f-w]:0)+(j+1<height?source[f+w]:0)-4*source[f];
            const capillaryForce=sigma*0.5*(this.curvature[a]+this.curvature[b])*(this.c[b]-this.c[a])/h;
            const rx=x-this.nx*h/2,ry=y-this.ny*h/2;
            const inertia=horizontal?2*omega*vy+omega*omega*rx+alpha*ry:-2*omega*vx+omega*omega*ry-alpha*rx;
            const gravityForce=4.8*contrast*average*(horizontal?gravity.x:gravity.y);
            target[f]=advected+subDt*(nu*lap/(h*h)+gravityForce+capillaryForce+inertia);
          }
        }
        if (this.wheel) this.wheel.couple(subDt, this.wheelPorts, alpha);
        this.project();
        let peak=0;
        for(const {f} of this.xFaces) peak=Math.max(peak,Math.abs(this.u[f]));
        for(const {f} of this.yFaces) peak=Math.max(peak,Math.abs(this.v[f]));
        // Uniform scaling keeps the projected velocity divergence-free. It
        // bounds only extreme forcing and guarantees each geometric sweep's CFL.
        const scale=Math.min(1,6/Math.max(peak,1e-12),0.45*h/(subDt*Math.max(peak,1e-12)));
        if(scale<1) {
          for(const {f} of this.xFaces) this.u[f]*=scale;
          for(const {f} of this.yFaces) this.v[f]*=scale;
        }
        this.advect(subDt);
        if (this.wheel) this.wheel.advance(subDt);
      }
      this.reconstruct();
    }

    buildRenderSources() {
      this.renderSources=new Int32Array(this.mask.length).fill(-1);
      for(let j=0;j<this.ny;j++) for(let i=0;i<this.nx;i++) {
        const id=i+j*this.nx;
        if(this.mask[id]) {this.renderSources[id]=id;continue;}
        let distance=Infinity;
        for(let dj=-2;dj<=2;dj++) for(let di=-2;di<=2;di++) {
          const x=i+di,y=j+dj,n=x+y*this.nx,d=di*di+dj*dj;
          if(x>=0&&x<this.nx&&y>=0&&y<this.ny&&this.mask[n]&&d<distance) {distance=d;this.renderSources[id]=n;}
        }
      }
    }

    render(image) {
      const {width,height,data}=image, cw=width/this.nx,ch=height/this.ny;
      if(!this.renderCoverage || this.renderCoverage.length!==width*height) this.renderCoverage=new Float64Array(width*height);
      const coverage=this.renderCoverage;
      coverage.fill(0);
      // Integrate each cut polygon over the actual pixel footprint. A simple
      // distance-based alpha at each cell edge creates visible seams (and
      // false hairlines for tiny roundoff fractions) between adjacent cells.
      for(let j=0;j<this.ny;j++) for(let i=0;i<this.nx;i++) {
        const source=this.renderSources[i+j*this.nx];
        if(source<0 || this.c[source]<=0) continue;
        const mx=this.mx[source],my=this.my[source];
        const intercept=this.alpha[source]-mx*(i-source%this.nx)-my*(j-Math.floor(source/this.nx));
        const startX=Math.max(0,Math.floor(i*cw)),endX=Math.min(width,Math.ceil((i+1)*cw));
        const startY=Math.max(0,Math.floor(j*ch)),endY=Math.min(height,Math.ceil((j+1)*ch));
        for(let y=startY;y<endY;y++) for(let x=startX;x<endX;x++) {
          const x0=Math.max(0,x/cw-i),x1=Math.min(1,(x+1)/cw-i);
          const y0=Math.max(0,y/ch-j),y1=Math.min(1,(y+1)/ch-j);
          const rectangle=(x1-x0)*(y1-y0)*cw*ch;
          const fraction=this.c[source]>=1?1:lineArea(mx*(x1-x0),my*(y1-y0),intercept-mx*x0-my*y0);
          coverage[x+y*width]+=rectangle*fraction;
        }
      }
      for(let pixel=0;pixel<coverage.length;pixel++) data[pixel*4+3]=Math.round(255*clamp(coverage[pixel],0,1));
    }
  }
  return { Solver, PaddleWheel, lineArea, lineAlpha, sweptArea };
});
