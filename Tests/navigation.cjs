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
  page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await page.goto(origin+'/editor/',{waitUntil:'commit'});
  await page.waitForFunction(()=>window.editor?.placement&&editor.session&&!editor.session.loading&&document.querySelector('#viewport canvas'),null,{timeout:6000});
  assert.equal(await page.locator('#viewport-navigation .ui-icon').count(),3);
  assert(await page.locator('#viewport-navigation .ui-icon').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).maskImage.includes('/editor/images/icons/')&&n.getBoundingClientRect().width===18)),'navigation uses local monochrome SVG masks');
  assert.equal(await page.locator('#viewport-controls, #viewport-navigation, #toolbar').evaluateAll(nodes=>nodes.some(n=>/\p{Extended_Pictographic}/u.test(n.textContent))),false,'controls contain no emoji icons');
  assert.deepEqual(await page.evaluate(()=>editor.camera.position.toArray()),[10,12,10]);
  assert.deepEqual(await page.evaluate(()=>editor.controls.center.toArray()),[0,0,0]);
  const aligned = direction => page.waitForFunction(d=>editor.camera.position.clone().sub(editor.controls.center).normalize().dot(new THREE.Vector3(...d).normalize())>1-1e-9,direction);
  assert.deepEqual(await page.locator('#viewHelper > button[data-sign=positive]').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).backgroundColor)),['rgb(239, 100, 97)','rgb(233, 198, 91)','rgb(122, 199, 133)']);
  assert.equal(await page.locator('#viewHelper > svg line').count(),3,'classic gyro uses three thin SVG axes');
  assert.deepEqual(await page.locator('#viewHelper > button[data-sign=positive]').evaluateAll(nodes=>nodes.map(n=>[n.textContent,n.offsetWidth])),[['X',18],['Y',18],['Z',18]]);
  assert(await page.locator('#viewHelper > button[data-sign=negative]').evaluateAll(nodes=>nodes.every(n=>n.textContent===''&&n.offsetWidth===8)),'rear endpoints stay small, with full labelled hit targets');
  assert.equal(await page.evaluate(()=>editor.viewportColor.getHexString()),'181a1d');
  await page.locator('#outliner .option').first().click({button:'right'});
  await page.locator('#scene-context-menu [data-action=delete]').click();
  assert(await page.evaluate(()=>editor.scene.userData.editorCameraHidden&&!Array.from(document.querySelectorAll('#outliner .option')).some(e=>e.value===editor.camera.id)),'working camera row can be removed without destroying the viewport');
  await page.evaluate(()=>editor.undo());
  assert(await page.evaluate(()=>Array.from(document.querySelectorAll('#outliner .option')).some(e=>e.value===editor.camera.id)),'undo restores the working camera row');
  await page.evaluate(()=>{const c=new THREE.PerspectiveCamera();c.name='可删除相机';editor.addObject(c);editor.setViewportCamera(c.uuid);});
  await page.locator('#outliner .option').filter({hasText:'可删除相机'}).click({button:'right'});
  await page.locator('#scene-context-menu [data-action=delete]').click();
  assert(await page.evaluate(()=>!editor.scene.getObjectByName('可删除相机')&&editor.viewportCamera===editor.camera&&editor.controls.enabled),'deleting the active scene camera restores navigation');
  await page.evaluate(()=>editor.undo());assert(await page.evaluate(()=>!!editor.scene.getObjectByName('可删除相机')));
  assert(await page.locator('#outliner').evaluate(e=>{const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});e.dispatchEvent(event);return event.defaultPrevented;}),'outliner never opens the browser menu');
  await page.evaluate(async()=>{editor.clear();const json=editor.toJSON();json.scene.object.background=0xaaaaaa;json.backgroundType='Default';await editor.fromJSON(json);});
  assert(await page.evaluate(()=>editor.scene.background===null),'legacy Default background never restores stale light gray');
  const writes=await page.evaluate(async()=>{let n=0;const observer=new MutationObserver(records=>n+=records.length);observer.observe(document.querySelector('#viewHelper'),{subtree:true,attributes:true,attributeFilter:['style','x2','y2']});await new Promise(r=>setTimeout(r,120));observer.disconnect();return n;});
  assert.equal(writes,0,'idle gyro causes no repeated style writes');
  const redraws=await page.evaluate(()=>{let n=0;const count=()=>n++;editor.signals.sceneRendered.add(count);editor.controls.orient(new THREE.Vector3(1,0,0));editor.controls.update(.01);editor.controls.stop();editor.signals.sceneRendered.remove(count);return n;});
  assert.equal(redraws,0,'controls do not draw twice inside one animation frame');
  await page.evaluate(()=>editor.clear());
  console.log('PASS: colored axes, dark default/legacy restore, working/scene camera removal and undo; no native context menu; no redundant gyro DOM writes or control redraws');
  const radius = await page.evaluate(()=>editor.camera.position.length());
  for(const [name,direction] of [['纯顶视',[0,1,0]],['正视',[0,0,1]],['侧视',[1,0,0]],['45°鸟瞰',[10,12,10]]]) {
   await page.locator('#camera-presets button').filter({hasText:name}).click();
   if(name==='纯顶视') {
    await page.waitForTimeout(70);
    assert(await page.evaluate(()=>editor.camera.position.x>0.001&&editor.camera.position.y>12),'camera transitions through intermediate positions');
   }
   await aligned(direction);
   assert(Math.abs(await page.evaluate(()=>editor.camera.position.length())-radius)<1e-6,'presets keep orbit distance');
  }
  for(const [label,direction] of [['+X',[1,0,0]],['−X',[-1,0,0]],['+Y',[0,1,0]],['−Y',[0,-1,0]],['+Z',[0,0,1]],['−Z',[0,0,-1]]]) {
   await page.locator(`[data-axis="${label}"]`).click();await aligned(direction);
   assert(await page.evaluate(()=>editor.camera.getWorldDirection(new THREE.Vector3()).dot(editor.controls.center.clone().sub(editor.camera.position).normalize())>0.99999),'axis faces look at the orbit center');
  }
  console.log('PASS: initial isometric camera, four smooth presets, all six accessible gyro faces');
  await page.evaluate(()=>{const g=new THREE.Group();g.name='导航样件';const m=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshStandardMaterial());m.position.y=1;g.add(m);g.position.set(3,0,2);editor.addObject(g);editor.placement.grab(g);});
  const held = await page.evaluate(()=>editor.placement.object.position.toArray());
  const drag = async(selector,dx,dy) => {
   const r=await page.locator(selector).boundingBox(),x=r.x+r.width/2,y=r.y+(selector==='#viewHelper'?8:r.height/2);
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:5});await page.mouse.up();
  };
  const beforePan=await page.evaluate(()=>editor.controls.center.toArray());
  await drag('[data-nav=pan]',55,30);
  assert.notDeepEqual(await page.evaluate(()=>editor.controls.center.toArray()),beforePan);
  const distance=()=>page.evaluate(()=>editor.camera.position.distanceTo(editor.controls.center));
  const beforeZoom=await distance();await drag('[data-nav=zoom]',0,-60);await page.waitForTimeout(160);assert(await distance()<beforeZoom);
  const beforeOrbit=await page.evaluate(()=>editor.camera.position.toArray());await drag('#viewHelper',-65,25);
  assert.notDeepEqual(await page.evaluate(()=>editor.camera.position.toArray()),beforeOrbit);
  await page.locator('#camera-presets button').first().click();await aligned([10,12,10]);
  assert.deepEqual(await page.evaluate(()=>editor.placement.object?.position.toArray()),held,'all navigation preserves held model world position');
  await page.locator('[data-nav=frame]').click();
  await page.waitForFunction(()=>editor.controls.center.distanceTo(new THREE.Vector3(3,1,2))<1e-6);
  assert(await page.evaluate(()=>editor.placement.object!==null));await page.keyboard.press('Escape');
  console.log('PASS: pan/zoom/orbit drags and framing preserve grabbed model');
  const row=page.locator('#outliner .option').filter({hasText:'导航样件'});
  const menu=async action=>{await row.click({button:'right'});await page.locator(`#scene-context-menu [data-action=${action}]`).click();};
  await menu('visible');assert.equal(await page.evaluate(()=>editor.scene.getObjectByName('导航样件').visible),false);
  assert.equal(await row.evaluate(e=>getComputedStyle(e).opacity),'0.45');
  assert(await page.evaluate(()=>editor.selector.getSelectionBox(new THREE.Box3()).isEmpty()),'hiding also removes selection bounds');
  await row.click({button:'right'});assert.equal(await page.locator('#scene-context-menu button').count(),4);
  assert((await page.locator('#scene-context-menu [data-action=visible]').innerText()).includes('显示'));
  await page.keyboard.press('Escape');await page.evaluate(()=>editor.undo());
  assert(await page.evaluate(()=>editor.scene.getObjectByName('导航样件').visible));
  await menu('lock');assert(await page.evaluate(()=>editor.scene.getObjectByName('导航样件').userData.isLocked));
  await menu('clone');assert(await page.evaluate(()=>editor.placement.source?.name==='导航样件'&&!editor.placement.object.userData.isLocked));
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>editor.scene.children.length),1);
  await menu('delete');assert.equal(await page.evaluate(()=>editor.scene.children.length),0);
  await page.evaluate(()=>editor.undo());assert.equal(await page.evaluate(()=>editor.scene.children.length),1);
  // Hidden far-away objects do not spoil the scene framing distance.
  await page.evaluate(()=>{const far=editor.scene.children[0].clone();far.position.set(10000,0,0);far.visible=false;editor.addObject(far);editor.deselect();});
  await page.locator('[data-nav=frame]').click();await page.waitForTimeout(430);assert(await distance()<20);
  await page.evaluate(()=>{editor.clear();editor.controls.center.set(2,2,2);});
  await page.locator('[data-nav=frame]').click();await page.waitForFunction(()=>editor.camera.position.distanceTo(new THREE.Vector3(10,12,10))<1e-6);
  assert.equal((await page.locator('#sidebar').boundingBox()).width,240);
  const side=await page.locator('#sidebar').boundingBox(),view=await page.locator('#viewport').boundingBox();assert(view.x+view.width<=side.x);
  await page.screenshot({path:path.join(root,'.build_tmp/navigation.png')});
  await page.setViewportSize({width:834,height:1194});
  const presets=await page.locator('#camera-presets').boundingBox(),station=await page.locator('#asset-station').boundingBox();assert(presets.y+presets.height<=station.y,'portrait controls do not overlap assets');
  assert.deepEqual(errors,[]);
  console.log('PASS: scene tree hide/show/lock/clone/delete with undo; frame visible/empty scene; 240px sidebar; desktop/portrait layout; console errors=0');
 } finally {if(browser)await browser.close();server.kill('SIGTERM');}
})().catch(e=>{console.error(e);process.exitCode=1;});
