const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../scripts/oil-timer.test.cjs'), 'utf8').split("test('requested page defaults initialize")[0];
const {loadTimer,advance} = new Function('require','__dirname',source+'; return {loadTimer,advance};')(require,path.join(__dirname,'../scripts'));
const timer=loadTimer({pageDefaults:true});
timer.click('shapeWheel');
const initialMass=timer.computeOilMass(), samples=[];
for(let segment=0;segment<20;segment++) {
  advance(timer,120);
  const sample={frames:120*(segment+1),massError:timer.computeOilMass()/initialMass-1,
    ...timer.getMassFractions(),angle:timer.wheel.angle,omega:timer.wheel.omega,stats:{...timer.vof.stats}};
  samples.push(sample); console.log(JSON.stringify(sample));
}
if(process.argv.includes('--record')) fs.writeFileSync(path.join(__dirname,'oil-timer-wheel-check.json'),JSON.stringify({
  sourceHashes:Object.fromEntries(['index.html','vof.js'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../oil-timer-lab',file))).digest('hex')])),
  parameters:timer.parameters,samples
},null,2)+'\n');
