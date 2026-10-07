const assert = require('node:assert/strict');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
(async () => {
 const server=spawn('python3',['serve.py','--port','0'],{cwd:root,stdio:['ignore','pipe','pipe']});
 let browser;
 try {
  const origin=await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{const m=String(d).match(/http:\/\/127\.0\.0\.1:\d+/);if(m)resolve(m[0]);});server.on('error',reject);});
  browser=await chromium.launch({channel:'chrome',headless:true,timeout:6000,args:['--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:940},hasTouch:true});page.setDefaultTimeout(1600);
  const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{
   // Upgrade an existing profile that predates a deliberate movement-mode choice.
   if(!localStorage.getItem('pinddd-creator-editor'))localStorage.setItem('pinddd-creator-editor',JSON.stringify({'canvas/snapEnabled':true,'canvas/snap':.1}));
  });
  await page.goto(origin+'/editor/',{waitUntil:'commit'});
  await page.waitForFunction(()=>window.editor?.placement&&editor.session&&!editor.session.loading&&document.querySelector('#viewport canvas'),null,{timeout:6000});
  await page.evaluate(()=>{
   const group=new THREE.Group();group.name='自由移动样件';
   const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshStandardMaterial());mesh.position.set(.3,1,.2);group.add(mesh);
   editor.addObject(group);editor.select(group);
  });
  const mode=page.getByLabel('物品移动方式',{exact:true}),canvasMode=page.getByLabel('画布移动方式',{exact:true});
  assert.equal(await mode.inputValue(),'screen');assert.equal(await canvasMode.inputValue(),'screen');assert(await canvasMode.isVisible());
  const read=()=>page.evaluate(()=>{const o=editor.scene.getObjectByName('自由移动样件'),b=new THREE.Box3().setFromObject(o,true),v=b.getCenter(new THREE.Vector3()),c=editor.viewportCamera,r=document.querySelector('#viewport canvas').getBoundingClientRect(),depth=v.clone().applyMatrix4(c.matrixWorldInverse).z;v.project(c);return{position:o.position.toArray(),bottom:b.min.y,depth,x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2,history:editor.history.undos.length};});
  const before=await read();
  await page.mouse.click(before.x+8,before.y+6);assert.equal(await page.evaluate(()=>editor.placement.object?.name),'自由移动样件');
  await page.mouse.move(before.x+68,before.y-74);
  const moved=await read();assert(Math.abs(moved.x-before.x-60)<1e-6);assert(Math.abs(moved.y-before.y+80)<1e-6);assert(Math.abs(moved.depth-before.depth)<1e-8);assert(moved.bottom>0,'screen up permits floating');
  await page.mouse.click(before.x+68,before.y-74);assert.equal(await page.evaluate(()=>editor.placement.object),null);assert.equal((await read()).history,before.history+1);
  await page.evaluate(()=>editor.undo());assert.deepEqual((await read()).position,before.position);await page.evaluate(()=>editor.redo());assert.deepEqual((await read()).position,moved.position);
  await page.getByRole('button',{name:'移动物品',exact:true}).click();await page.mouse.move(before.x,before.y);
  assert.deepEqual((await read()).position,moved.position,'sidebar entry does not jump');
  await page.mouse.move(before.x-30,before.y+40);await page.keyboard.press('Escape');assert.deepEqual((await read()).position,moved.position);
  await page.evaluate(()=>{
   const check=(v,m)=>{if(!v)throw Error(m)},p=editor.placement,o=editor.selected,c=editor.camera;
   const center=()=>new THREE.Box3().setFromObject(o,true).getCenter(new THREE.Vector3());
   const start=o.position.clone();p.pointer.set(0,0);p.grab(o,false,true);p.pointer.set(.1,.15);p.move();
   let anchor=center();p.scale(.5);check(center().distanceTo(anchor)<1e-8,'free scale keeps center');p.rotate(1,27.3);check(center().distanceTo(anchor)<1e-8,'free yaw keeps center');
   anchor=o.position.clone();c.position.x+=2;c.lookAt(editor.controls.center);c.updateMatrixWorld(true);p.pointer.x+=.1;p.move();check(o.position.distanceTo(anchor)<1e-8,'navigation reanchors without jumping');
   p.pointer.x+=.05;p.move();check(o.position.distanceTo(anchor)>.01,'continues following after navigation');
   anchor=o.position.clone();p.setMovementMode('surface');check(o.position.distanceTo(anchor)<1e-8,'switch does not reposition');p.setMovementMode('screen');p.pointer.y+=.2;p.move();check(o.position.distanceTo(anchor)<1e-8,'screen re-entry anchor');
   p.cancel();check(o.position.distanceTo(start)<1e-8&&o.scale.x===1,'cancel restores all transforms');
   p.grab(o,true,true);const copy=p.object;p.pointer.x+=.1;p.move();p.finish();check(copy.parent===editor.scene,'clone placed');editor.undo();check(copy.parent===null,'clone undo');
   o.userData.isLocked=true;p.grab(o);check(!p.object,'locked cannot grab');o.userData.isLocked=false;
   // Both projection types and axis views must preserve camera depth and projected deltas.
   const cameras=[c,new THREE.OrthographicCamera(-10,10,8,-8,.01,1000)];
   for(const cam of cameras)for(const xyz of [[10,12,10],[0,0,20],[20,0,0],[0,20,0]]){
    cam.position.set(...xyz);cam.lookAt(0,0,0);cam.updateProjectionMatrix();cam.updateMatrixWorld(true);editor.viewportCamera=cam;editor.signals.objectChanged.dispatch(o); // Apply renderer depth projection before pointer input.
    p.pointer.set(0,0);p.grab(o,false,true);const v=center(),ndc=v.clone().project(cam),depth=v.clone().applyMatrix4(cam.matrixWorldInverse).z;
    const raycast=p.raycaster.intersectObjects,support=p.supportHeight;p.raycaster.intersectObjects=()=>{throw Error('free move must skip collision rays')};p.supportHeight=()=>{throw Error('free move must skip support triangles')};
    p.pointer.set(.12,.16);p.move();p.raycaster.intersectObjects=raycast;p.supportHeight=support;
    const after=center(),projected=after.clone().project(cam);check(Math.abs(projected.x-ndc.x-.12)<1e-8&&Math.abs(projected.y-ndc.y-.16)<1e-8,'projected direction '+JSON.stringify({type:cam.type,xyz,dx:projected.x-ndc.x,dy:projected.y-ndc.y,ready:p.screenReady,mode:p.movementMode}));check(Math.abs(after.applyMatrix4(cam.matrixWorldInverse).z-depth)<1e-8,'fixed camera depth');p.cancel();
   }
   editor.viewportCamera=c;c.position.set(10,12,10);c.lookAt(0,0,0);c.updateMatrixWorld(true);
   // Explicit re-ground still uses table support while free move is active.
   const table=new THREE.Mesh(new THREE.BoxGeometry(20,1,20),new THREE.MeshStandardMaterial());table.position.y=.5;editor.addObject(table);
   o.position.set(0,5,0);editor.select(o);p.contextAction('ground',o);check(Math.abs(new THREE.Box3().setFromObject(o,true).min.y-1)<1e-8,'free mode re-ground to table');
   p.setMovementMode('surface');p.pointer.set(0,0);p.grab(o);p.move();check(p.valid&&Math.abs(new THREE.Box3().setFromObject(o,true).min.y-1)<1e-8,'surface mode still stacks');p.cancel();editor.removeObject(table);
   p.setMovementMode('screen');o.position.set(0,0,0);editor.signals.objectChanged.dispatch(o);
  });
  // Trusted touch events use the same screen plane, including floating placement.
  const cdp=await page.context().newCDPSession(page);
  const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({id:i,x:p.x,y:p.y,radiusX:3,radiusY:3,force:1}))});
  const tp=await read();await touch('touchStart',[tp]);await touch('touchEnd',[]);
  assert.equal(await page.evaluate(()=>editor.placement.object?.name),'自由移动样件');
  await touch('touchStart',[tp]);await touch('touchMove',[{x:tp.x+35,y:tp.y-45}]);await touch('touchEnd',[]);
  const touchMoved=await read();assert(Math.abs(touchMoved.x-tp.x-35)<1e-6&&Math.abs(touchMoved.y-tp.y+45)<1e-6);assert(Math.abs(touchMoved.depth-tp.depth)<1e-8);
  await page.getByRole('button',{name:'确认摆放',exact:true}).click();
  await canvasMode.selectOption('surface');assert.equal(await mode.inputValue(),'surface');
  await page.reload({waitUntil:'commit'});await page.waitForFunction(()=>window.editor?.session&&!editor.session.loading,null,{timeout:6000});
  assert.equal(await canvasMode.inputValue(),'surface','explicit surface choice persists');
  await canvasMode.selectOption('screen');await page.evaluate(()=>editor.deselect());
  assert(await canvasMode.isVisible(),'mode control remains visible without selection');
  for(const size of [{width:834,height:1194},{width:390,height:844}]){
   await page.setViewportSize(size);const r=await canvasMode.boundingBox();assert(r.x>=0&&r.x+r.width<=size.width,'mode control fits narrow screens');
  }
  await page.screenshot({path:path.join(root,'.build_tmp/free-move.png')});
  await page.reload({waitUntil:'commit'});await page.waitForFunction(()=>window.editor?.placement,null,{timeout:6000});
  assert.equal(await page.evaluate(()=>editor.placement.movementMode),'screen','mode persists');assert.deepEqual(errors,[]);
  console.log('PASS: default free movement, visible synchronized mode control, explicit mode persistence, actual mouse/touch screen-plane movement, floating, no jump, fixed depth, both projections and axis views, rotate/scale, cancel/undo/clone/lock, surface switch and table re-ground, persisted mode; collision scans skipped; console errors=0');
 } finally {if(browser)await browser.close();server.kill('SIGTERM');}
})().catch(e=>{console.error(e);process.exitCode=1;});
