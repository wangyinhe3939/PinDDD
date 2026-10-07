const assert = require('node:assert/strict');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
(async () => {
 const server = spawn('python3', ['serve.py', '--port', '0'], {cwd:root, stdio:['ignore','pipe','pipe']});
 let browser;
 try {
  const origin = await new Promise((resolve,reject) => {server.stdout.on('data',d => {const m=String(d).match(/http:\/\/127\.0\.0\.1:\d+/);if(m)resolve(m[0]);});server.on('error',reject);});
  browser = await chromium.launch({channel:'chrome',headless:true,timeout:6000,args:['--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport:{width:1440,height:940}});page.setDefaultTimeout(1600);
  const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(origin+'/editor/',{waitUntil:'commit'});
  await page.waitForFunction(()=>window.editor?.placement&&editor.session&&!editor.session.loading&&document.querySelector('#viewport canvas'),null,{timeout:6000});
  const result=await page.evaluate(()=>{
   const camera=editor.camera.clone();camera.name='远裁剪相机';camera.position.set(-4,2,0);editor.addObject(camera);
   const second=new THREE.OrthographicCamera(-2,2,2,-2,.1,2000);second.name='另一个相机';second.position.set(4,2,0);editor.addObject(second);
   editor.scene.updateMatrixWorld(true);editor.sceneHelpers.updateMatrixWorld(true);
   const bounds=new THREE.Box3().setFromObject(editor.helpers[camera.id]);
   editor.controls.focus(camera);editor.controls.update(.5);
   return {helperSpan:bounds.getSize(new THREE.Vector3()).length(),focusDistance:editor.camera.position.distanceTo(editor.controls.center)};
  });
  assert(result.helperSpan<10,'camera marker must not use the 1e10 far plane: '+JSON.stringify(result));
  assert(result.focusDistance>2,'focus must frame a camera marker, not an empty point');
  // Zoomed-out cameras stay readable and can be selected without entering placement.
  await page.evaluate(()=>{editor.camera.position.set(40,48,40);editor.camera.lookAt(0,0,0);editor.controls.center.set(0,0,0);editor.signals.windowResize.dispatch();});
  const markerPoint=async name=>page.evaluate(name=>{const c=editor.scene.getObjectByName(name);const v=c.getWorldPosition(new THREE.Vector3()).project(editor.camera),r=document.querySelector('#viewport canvas').getBoundingClientRect();return{x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2};},name);
  for(const name of ['远裁剪相机','另一个相机']) {
   const p=await markerPoint(name);await page.mouse.click(p.x,p.y);
   assert.equal(await page.evaluate(()=>editor.selected?.name),name,'camera marker is pickable after zooming out');
   assert.equal(await page.evaluate(()=>editor.placement.object),null,'a camera is selected without model grabbing');
  }
  const markerStats=await page.evaluate(()=>{
   const c=editor.scene.getObjectByName('远裁剪相机'),m=editor.helpers[c.id],r=document.querySelector('#viewport canvas').getBoundingClientRect();
   const v=m.geometry.attributes.position,points=[];
   for(let i=0;i<v.count;i++){const p=new THREE.Vector3().fromBufferAttribute(v,i).applyMatrix4(m.matrixWorld).project(editor.camera);points.push([p.x*r.width/2,p.y*r.height/2]);}
   return {width:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),far:c.far,near:c.near};
  });
  assert(markerStats.width>20&&markerStats.width<75,'camera stays a small readable marker at zoomed-out distance');
  assert.equal(markerStats.far,1e10);assert.equal(markerStats.near,.001,'marker never changes real camera clipping');
  const angle=await page.evaluate(()=>editor.camera.getWorldDirection(new THREE.Vector3()).toArray());
  await page.locator('#outliner .option').filter({hasText:'另一个相机'}).dblclick();
  await page.waitForFunction(()=>editor.controls.center.distanceTo(new THREE.Vector3(4,2,0))<1e-6);
  assert(await page.evaluate(a=>editor.camera.getWorldDirection(new THREE.Vector3()).dot(new THREE.Vector3(...a))>1-1e-9,angle),'focus preserves the viewing angle');
  // Framing the scene includes camera locations but never their clipping volumes.
  await page.evaluate(()=>{editor.deselect();editor.controls.focus(editor.scene);editor.controls.update(.5);});
  assert(await page.evaluate(()=>editor.camera.position.distanceTo(editor.controls.center)<30));
  assert(await page.evaluate(()=>editor.scene.children.filter(c=>c.isCamera).every(c=>{const p=c.getWorldPosition(new THREE.Vector3()).project(editor.camera);return Math.abs(p.x)<.9&&Math.abs(p.y)<.9;})));
  // Focus while previewing a scene camera returns to the working camera.
  await page.evaluate(()=>editor.setViewportCamera(editor.scene.getObjectByName('另一个相机').uuid));
  await page.locator('#outliner .option').filter({hasText:'远裁剪相机'}).dblclick();
  await page.waitForFunction(()=>editor.controls.enabled&&editor.viewportCamera===editor.camera&&editor.controls.center.distanceTo(new THREE.Vector3(-4,2,0))<1e-6);
  // Hide/show both the object and helpers, including a camera under a hidden parent.
  assert(await page.evaluate(()=>{const c=editor.scene.getObjectByName('远裁剪相机'),h=editor.helpers[c.id];c.visible=false;editor.signals.objectChanged.dispatch(c);const hidden=!h.visible;c.visible=true;editor.signals.objectChanged.dispatch(c);return hidden&&h.visible;}));
  assert(await page.evaluate(()=>{editor.signals.showHelpersChanged.dispatch({gridHelper:true,cameraHelpers:false,lightHelpers:true,skeletonHelpers:true});editor.sceneHelpers.updateMatrixWorld(true);return editor.scene.children.filter(c=>c.isCamera).every(c=>!editor.helpers[c.id].visible);}));
  await page.evaluate(()=>editor.signals.showHelpersChanged.dispatch({gridHelper:true,cameraHelpers:true,lightHelpers:true,skeletonHelpers:true}));
  assert(await page.evaluate(()=>{const parent=new THREE.Group();parent.position.set(3,4,5);parent.scale.set(2,3,4);const c=new THREE.PerspectiveCamera();c.position.set(1,0,0);parent.add(c);editor.addObject(parent);const h=editor.helpers[c.id];h.update();const at=h.getWorldPosition(new THREE.Vector3()).distanceTo(c.getWorldPosition(new THREE.Vector3()))<1e-8;parent.visible=false;h.update();const hidden=!h.visible;let disposed=0;for(const resource of [h,h.geometry,h.material])resource.addEventListener('dispose',()=>disposed++);editor.removeObject(parent);return at&&hidden&&disposed===3;}),'camera markers respect parent transform and visibility');
  assert(await page.evaluate(()=>{const m=editor.helpers[editor.scene.getObjectByName('远裁剪相机').id],v=m.geometry.attributes.position.version;for(let i=0;i<30;i++)m.update();return m.geometry.attributes.position.version===v;}),'camera marker navigation never rewrites GPU geometry');

  await page.evaluate(()=>{editor.setCameraType('orthographic');editor.controls.focus(editor.scene);editor.controls.update(.5);});
  assert(await page.evaluate(()=>editor.scene.children.filter(c=>c.isCamera).every(c=>{const p=c.getWorldPosition(new THREE.Vector3()).project(editor.camera);return Math.abs(p.x)<.9&&Math.abs(p.y)<.9;})),'orthographic scene framing includes both cameras');
  await page.locator('#outliner .option').first().dblclick();
  assert(await page.evaluate(()=>editor.viewportCamera===editor.camera),'working camera row double-click frames the scene');
  await page.evaluate(()=>{editor.setCameraType('perspective');editor.controls.focus(editor.scene);editor.controls.update(.5);});
  await page.screenshot({path:path.join(root,'.build_tmp/cameras.png')});
  assert.deepEqual(errors,[]);console.log('PASS: compact fixed-screen-size camera markers, unchanged clipping, zoomed-out picking, camera/scene framing, stable angle, preview exit, helper visibility, perspective/orthographic; console errors=0', result, markerStats);
 } finally {if(browser)await browser.close();server.kill('SIGTERM');}
})().catch(e=>{console.error(e);process.exitCode=1;});
