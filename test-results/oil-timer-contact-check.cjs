const { Solver } = require('../oil-timer-lab/vof.js');
const results=[];
for(const resolution of [1,1.5]) for(const angle of [60,90,140]) {
  const nx=48*resolution,ny=32*resolution, h=1/resolution, r=7, solver=new Solver({nx,ny,width:48,mask:new Uint8Array(nx*ny).fill(1),contactAngle:angle});
  for(let j=0;j<ny;j++) for(let i=0;i<nx;i++) {
    let count=0;
    for(let y=0;y<8;y++) for(let x=0;x<8;x++) if(Math.hypot((i+(x+.5)/8-nx/2)*h,(j+(y+.5)/8-ny)*h)<r) count++;
    solver.c[i+j*nx]=count/64;
  }
  const mass=solver.mass();
  for(let step=0;step<1500;step++) solver.step(.18,{surfaceTension:100,oilDensity:1,waterDensity:1,viscosity:5,waterViscosity:5});
  let wall=0,centerHeight=0,peak=0;
  for(let i=0;i<nx;i++) {
    const id=i+(ny-1)*nx, c=solver.c[id], mx=solver.mx[id], a=solver.alpha[id]-solver.my[id];
    wall+=h*(c>=1-1e-10?1:c<=1e-10?0:Math.abs(mx)<1e-12?(a>=0?1:0):mx>0?Math.max(0,Math.min(1,a/mx)):1-Math.max(0,Math.min(1,a/mx)));
  }
  for(let j=0;j<ny;j++) centerHeight+=h*solver.c[nx/2+j*nx];
  for(const u of [...solver.u,...solver.v]) peak=Math.max(peak,Math.abs(u));
  const theta=angle*Math.PI/180, radius=Math.sqrt(mass/(theta-Math.sin(theta)*Math.cos(theta)));
  results.push({angle,h,massError:solver.mass()/mass-1,wall,centerHeight,peak,analyticFootprint:2*radius*Math.sin(theta),analyticHeight:radius*(1-Math.cos(theta)),stats:solver.stats});
}
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const report={
  kind:'Static oil-side contact-angle diagnostic',
  solverSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../oil-timer-lab/vof.js'))).digest('hex'),
  setup:'Initially semicircular radius-7 drop on a horizontal wall; equal densities; surface tension 100; viscosities 5/5; 1500 steps of 0.18.',
  measurement:'Wall trace uses PLIC geometry, ignoring fractions within 1e-10 of a pure phase only when measuring the contact length. The simulation is not rounded.',
  limitation:'Static illustrative wall model. Refinement is not established: errors need not decrease monotonically between these two grids. These are not measured oil properties.',
  samples:results
};
if(process.argv.includes('--record')) fs.writeFileSync(path.join(__dirname,'oil-timer-contact-check.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
