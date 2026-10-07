const assert = require('node:assert/strict');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const close = (a, b, eps=1e-7) => a.every((x, i) => Math.abs(x - b[i]) < eps);
(async () => {
 const server = spawn('python3', ['serve.py','--port','0'], {cwd:root, stdio:['ignore','pipe','pipe']});
 let browser;
 try {
  const origin = await new Promise((resolve,reject) => {
   server.stdout.on('data', data => {const m=String(data).match(/http:\/\/127\.0\.0\.1:\d+/);if(m)resolve(m[0]);});
   server.on('error',reject);
  });
  browser = await chromium.launch({channel:'chrome',headless:true,timeout:6000,args:['--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport:{width:1440,height:940}});page.setDefaultTimeout(1800);
  const errors=[],failed=[],external=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('requestfailed',request=>failed.push(request.url()));
  page.on('response',response=>{if(response.status()>=400)failed.push(response.url());});
  page.on('request',request=>{if(!request.url().startsWith(origin+'/')&&!request.url().startsWith('blob:')&&!request.url().startsWith('data:'))external.push(request.url());});
  await page.goto(origin+'/editor/',{waitUntil:'commit'});
  await page.waitForFunction(()=>window.editor?.placement&&editor.session&&!editor.session.loading&&document.querySelector('#viewport canvas'),null,{timeout:6000});
  await page.evaluate(()=>{
   editor.placement.setMovementMode('surface');
   const material=new THREE.MeshStandardMaterial({color:0xb8a9d8});
   const model=new THREE.Group();model.name='整体模型';model.position.set(-2,-1,0);model.scale.set(1,2,3);
   const assembly=new THREE.Group();assembly.name='子组';assembly.position.set(.3,.7,.2);model.add(assembly);
   for(const [name,x] of [['左部件',-.4],['右部件',.4]]){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(.6,.4,.4),material);mesh.name=name;mesh.position.x=x;assembly.add(mesh);
   }
   const table=new THREE.Group();table.name='桌子';
   const top=new THREE.Mesh(new THREE.BoxGeometry(3.6,.2,3.6),material);top.position.set(2,1.4,0);table.add(top);
   for(const x of [.4,3.6])for(const z of [-1.6,1.6]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.1,1.3,.1),material);leg.position.set(x,.65,z);table.add(leg);}
   model.children[0].children[0].userData.object='模型自身的元数据';
   model.children[0].children[1].userData.object={isObject3D:true,label:'元数据'};
   editor.addObject(model);editor.addObject(table);editor.select(model);
   editor.camera.position.set(9,10,16);editor.controls.center.set(0,.8,0);editor.camera.lookAt(editor.controls.center);editor.signals.cameraChanged.dispatch(editor.camera);
   window.originalMaterial=material;window.savedSamples=[];
   const save=editor.storage.set.bind(editor.storage);editor.storage.set=json=>{savedSamples.push(json);save(json);};
  });
  const project = xyz => page.evaluate(xyz=>{
   const v=new THREE.Vector3(...xyz).project(editor.camera),r=document.querySelector('#viewport canvas').getBoundingClientRect();
   return {x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2};
  },xyz);
  const modelPoint = name=>page.evaluate(name=>{
   const object=editor.scene.getObjectByName(name);const v=new THREE.Box3().setFromObject(object,true).getCenter(new THREE.Vector3()).project(editor.camera);
   const r=document.querySelector('#viewport canvas').getBoundingClientRect();return{x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2};
  },name);
  const move = async xyz=>{const p=await project(xyz);await page.mouse.move(p.x,p.y);};
  const state = name=>page.evaluate(name=>{
   const model=editor.scene.getObjectByName(name),box=new THREE.Box3().setFromObject(model,true);
   return {position:model.position.toArray(),scale:model.scale.toArray(),rotation:model.quaternion.toArray(),bottom:box.min.y,top:box.max.y,center:box.getCenter(new THREE.Vector3()).toArray(),local:model.children[0]?.children.map(x=>x.position.toArray()),count:editor.history.undos.length};
  },name);
  assert(await page.evaluate(()=>!editor.transformControls&&!editor.sceneHelpers.children.some(x=>x.isTransformControlsRoot)),'no gizmo is created');
  assert.equal(await page.locator('#toolbar img').count(),0,'axis toolbar removed');
  const initial=await state('整体模型');
  let p=await modelPoint('左部件');await page.mouse.click(p.x,p.y);
  assert.equal(await page.evaluate(()=>editor.placement.object?.name),'整体模型','leaf click grabs entire model');
  assert(await page.evaluate(()=>editor.scene.getObjectByName('左部件').material.opacity===.45&&originalMaterial.opacity===1&&editor.scene.getObjectByName('桌子').children[0].material===originalMaterial),'ghost does not modify a shared material');
  await page.waitForTimeout(1150);
  assert(await page.evaluate(()=>savedSamples.every(x=>!x.scene.materials?.some(m=>m.opacity===.45))),'autosave never persists ghost material');
  await move([2,1.5,0]);const tabled=await state('整体模型');
  assert(Math.abs(tabled.bottom-1.5)<1e-7,'bottom sits on actual table top');
  assert(close([tabled.center[0],tabled.center[2]],[2,0]),'center follows cursor with grid snap');
  assert.deepEqual(tabled.local,initial.local);assert(close(tabled.scale,initial.scale));
  const camera=await page.evaluate(()=>editor.camera.position.toArray());
  await page.keyboard.press('r');const rotated=await state('整体模型');
  assert(Math.abs(rotated.rotation[1]-Math.sin(Math.PI/24))<1e-7,'R rotates by the default 15-degree increment without snapping');assert(Math.abs(rotated.bottom-1.5)<1e-7);
  await page.keyboard.press('Space');
  assert(close((await state('整体模型')).rotation,rotated.rotation),'Space is a pan modifier, never a rotation');
  await page.keyboard.press('r');
  await page.mouse.wheel(0,100);await page.waitForTimeout(30);
  const wheeled=await state('整体模型');assert(Math.abs(wheeled.rotation[1]-Math.sin(25*Math.PI/180))<1e-7,'wheel rotates continuously by 20 degrees');
  assert(close(camera,await page.evaluate(()=>editor.camera.position.toArray())),'holding wheel never zooms camera');
  // Preserve the established 135-degree fixture for later edge/jitter raycasts.
  await page.evaluate(()=>editor.placement.rotate(1,85));
  assert(Math.abs((await state('整体模型')).rotation[1]-Math.sin(3*Math.PI/8))<1e-7);

  await page.getByRole('button',{name:'放大 10%',exact:true}).click();
  assert.equal(await page.evaluate(()=>editor.placement.object?.name),'整体模型','size button keeps the grab active');
  assert(await page.getByLabel('X · 模型大小（倍数）',{exact:true}).isDisabled(),'individual axis sizes are read-only');
  let scaled=await state('整体模型');
  assert(close(scaled.scale,initial.scale.map(x=>x*1.1)),'all axes grow ten percent');assert(Math.abs(scaled.bottom-1.5)<1e-7);
  await page.keyboard.press('BracketLeft');scaled=await state('整体模型');assert(close(scaled.scale,initial.scale.map(x=>x*.99)),'all axes shrink ten percent');
  await page.mouse.click(...Object.values(await project([2,1.5,0])));
  assert.equal(await page.evaluate(()=>editor.placement.object),null);assert(await page.evaluate(()=>editor.scene.getObjectByName('左部件').material===originalMaterial),'material restored');
  const placed=await state('整体模型');await page.evaluate(()=>editor.undo());assert(close((await state('整体模型')).position,initial.position));
  await page.evaluate(()=>editor.redo());assert(close((await state('整体模型')).position,placed.position));
  console.log('PASS: actual clicks grab entire model; ghost material isolation/autosave, cursor/table support, R/wheel rotation and Space modifier, 10% uniform size, confirm and history');
  // Clone is provisional at the same pose; one undo removes the completed clone.
  p=await modelPoint('右部件');await page.keyboard.down('Alt');await page.mouse.click(p.x,p.y);await page.keyboard.up('Alt');
  assert.equal(await page.evaluate(()=>editor.placement.object?.name),'整体模型 · 副本');
  assert(close((await state('整体模型 · 副本')).position,placed.position),'clone starts at source pose');
  assert(await page.evaluate(()=>editor.scene.getObjectByName('右部件').material===originalMaterial),'original stays opaque');
  await move([2,placed.top,0]);const stacked=await state('整体模型 · 副本');
  assert(Math.abs(stacked.bottom-placed.top)<1e-7,'clone snaps to another model top, excluding its own meshes');
  assert(close([stacked.center[0],stacked.center[2]],[2,0]),'bottom-center follows the cursor even across a gap between model parts');
  await page.mouse.click(...Object.values(await project([2,placed.top,0])));
  assert.equal((await state('整体模型 · 副本')).count,placed.count+1,'clone placement is one history command');
  await page.evaluate(()=>editor.undo());assert.equal(await page.evaluate(()=>editor.scene.getObjectByName('整体模型 · 副本')===undefined),true);
  await page.evaluate(()=>editor.redo());
  // A 90-degree assembly gap still stacks; a truly empty frame cannot support it.
  await page.evaluate(()=>{
   const source=editor.scene.getObjectByName('整体模型'),copy=editor.scene.getObjectByName('整体模型 · 副本');
   window.gapFixture={source,copy,position:source.position.clone(),quaternion:source.quaternion.clone()};copy.visible=false;
   const before=new THREE.Box3().setFromObject(source,true).getCenter(new THREE.Vector3());source.rotation.set(0,Math.PI/2,0);
   const after=new THREE.Box3().setFromObject(source,true).getCenter(new THREE.Vector3());source.position.add(before.sub(after));source.updateMatrixWorld(true);
   editor.signals.objectChanged.dispatch(source);editor.placement.grab(source,true);
  });
  await move([2,placed.top,0]);
  assert(await page.evaluate(y=>editor.placement.valid&&Math.abs(new THREE.Box3().setFromObject(editor.placement.object,true).min.y-y)<1e-7,placed.top),'90-degree gap stack uses real footprint support');
  await page.evaluate(()=>{
   const frame=new THREE.Group();frame.name='空洞支撑';frame.position.set(-4,0,3);
   for(const axis of ['x','z'])for(const sign of [-1,1]){
    const bar=new THREE.Mesh(new THREE.BoxGeometry(axis==='x'?.2:8.2,.8,axis==='z'?.2:8.2),originalMaterial);bar.position[axis]=sign*4;bar.position.y=.4;frame.add(bar);
   }
   editor.addObject(frame);
  });
  await move([-4,0,3]);assert(await page.evaluate(()=>editor.placement.valid&&Math.abs(new THREE.Box3().setFromObject(editor.placement.object,true).min.y)<1e-7),'empty root bounding box is never used as a floating support');
  await page.evaluate(()=>{editor.placement.cancel();editor.removeObject(editor.scene.getObjectByName('空洞支撑'));const f=gapFixture;f.source.position.copy(f.position);f.source.quaternion.copy(f.quaternion);f.copy.visible=true;editor.signals.objectChanged.dispatch(f.source);});
  console.log('PASS: 90-degree assembly-gap stack and empty-frame rejection');
  p=await modelPoint('整体模型 · 副本');await page.mouse.click(p.x,p.y);
  await move([0,0,4]);assert(Math.abs((await state('整体模型 · 副本')).bottom)<1e-7,'ground fallback Y=0');
  await page.keyboard.press('Delete');assert.equal(await page.evaluate(()=>editor.scene.getObjectByName('整体模型 · 副本')===undefined),true);
  await page.evaluate(()=>editor.undo());assert(Math.abs((await state('整体模型 · 副本')).bottom-placed.top)<1e-7,'delete undo restores the last committed placement');
  // A support thinner than any fixed ray sampling grid must still block penetration.
  await page.evaluate(()=>{
   const spike=new THREE.Mesh(new THREE.BoxGeometry(.015,.8,.015),originalMaterial);spike.name='细窄支撑';spike.position.set(.371,.4,3.213);editor.addObject(spike);
  });
  p=await modelPoint('整体模型 · 副本');await page.mouse.click(p.x,p.y);await move([0,0,3]);
  assert(Math.abs((await state('整体模型 · 副本')).bottom-.8)<1e-7,'entire footprint catches narrow support between probe positions');
  await page.keyboard.press('Escape');assert(Math.abs((await state('整体模型 · 副本')).bottom-placed.top)<1e-7,'Esc cancels without committing');
  // Scaling a placed selection stays grounded and entering text cannot remove models.
  await page.evaluate(()=>editor.select(editor.scene.getObjectByName('整体模型')));await page.keyboard.press('BracketRight');
  assert(Math.abs((await state('整体模型')).bottom-1.5)<1e-7);await page.evaluate(()=>editor.undo());
  await page.evaluate(()=>{const input=document.createElement('input');input.id='typing-check';input.style.cssText='position:fixed;left:400px;top:60px;z-index:99';document.body.append(input);});
  await page.locator('#typing-check').fill('abc');await page.keyboard.press('Backspace');await page.keyboard.press('Delete');await page.keyboard.type('r [] ');
  assert.equal(await page.evaluate(()=>editor.scene.getObjectByName('整体模型')!==undefined),true,'typing never deletes selected model');
  assert(close((await state('整体模型')).scale,placed.scale));await page.evaluate(()=>document.querySelector('#typing-check').remove());
  // A click after editing text must reclaim keyboard focus for placement.
  await page.evaluate(()=>{const input=document.createElement('input');input.id='focus-check';input.style.cssText='position:fixed;left:400px;top:60px;z-index:99';document.body.append(input);input.focus();});
  p=await modelPoint('整体模型');await page.mouse.click(p.x,p.y);
  assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('#viewport canvas')),true,'canvas reclaims keyboard focus');
  await page.keyboard.press('Escape');await page.evaluate(()=>document.querySelector('#focus-check').remove());
  // Sloped and instanced supports, with no support inferred from a bounding-box gap.
  const supports=await page.evaluate(()=>{
   editor.select(editor.scene.getObjectByName('整体模型'));
   const ramp=new THREE.Mesh(new THREE.PlaneGeometry(4,4,2,2),originalMaterial);ramp.rotation.x=-Math.PI/2;ramp.rotateOnWorldAxis(new THREE.Vector3(0,0,1),.2);ramp.position.set(-4,1,4);editor.addObject(ramp);
   const instances=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.5,1),originalMaterial,1);instances.setMatrixAt(0,new THREE.Matrix4().makeTranslation(5,.75,4));editor.addObject(instances);
   const placement=editor.placement;placement.collectColliders();
   const query=new THREE.Box3(new THREE.Vector3(-4.5,0,3.5),new THREE.Vector3(-3.5,0,4.5));
   const y=placement.supportHeight(query);
   const expected=1+Math.abs(Math.tan(.2))*.5;
   if(Math.abs(y-expected)>1e-6)throw Error('clipped sloped footprint '+y+' vs '+expected);
   const instanceHeight=placement.supportHeight(new THREE.Box3(new THREE.Vector3(4.8,0,3.8),new THREE.Vector3(5.2,0,4.2)));
   if(Math.abs(instanceHeight-1)>1e-7)throw Error('instance support transform');
   const gap=placement.supportHeight(new THREE.Box3(new THREE.Vector3(-1,.0,6),new THREE.Vector3(-.9,0,6.1)));
   if(gap!==0)throw Error('empty footprint must stay at ground');
   const dense=new THREE.Mesh(new THREE.PlaneGeometry(6,6,128,128),originalMaterial);dense.rotation.x=-Math.PI/2;dense.position.y=.1;editor.addObject(dense);placement.collectColliders();
   const q=new THREE.Box3(new THREE.Vector3(-1.4,0,-2.4),new THREE.Vector3(-.6,0,-1.6)),begin=performance.now();
   for(let i=0;i<3;i++)placement.supportHeight(q);
   const ms=(performance.now()-begin)/3;
   editor.removeObject(dense);editor.removeObject(ramp);editor.removeObject(instances);
   const overhead=new THREE.Mesh(new THREE.BoxGeometry(2,.2,2),originalMaterial);overhead.position.set(6,4,4);editor.addObject(overhead);placement.collectColliders();
   const under=new THREE.Box3(new THREE.Vector3(5.6,0,3.6),new THREE.Vector3(6.4,.8,4.4));
   if(placement.supportHeight(under,0)!==0)throw Error('overhead surface attracted an object that fits underneath');
   if(Math.abs(placement.supportHeight(under,4.1)-4.1)>1e-7)throw Error('overhead top cannot support placement');
   editor.removeObject(overhead);
   return ms;
  });
  console.log('PROFILE: exact support on 32768-triangle mesh, mean '+supports.toFixed(2)+' ms');
  // Masked GLB materials remain visible as ghosts; cancelling a provisional clone leaves no scene residue.
  p=await modelPoint('整体模型');await page.keyboard.down('Alt');await page.mouse.click(p.x,p.y);await page.keyboard.up('Alt');
  const cloneCount=await page.evaluate(()=>editor.scene.children.length);await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>editor.scene.children.length),cloneCount-1,'cancel removes provisional clone');
  await page.evaluate(()=>{originalMaterial.alphaTest=.5;});
  p=await modelPoint('整体模型');await page.mouse.click(p.x,p.y);
  assert(await page.evaluate(()=>editor.placement.materials.every(({mesh})=>(Array.isArray(mesh.material)?mesh.material:[mesh.material]).every(m=>m.alphaTest===0))),'masked ghosts are not discarded by alpha test');
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>originalMaterial.alphaTest),.5);
  await page.evaluate(()=>{originalMaterial.alphaTest=0;});
  // Camera gestures never pick models, open menus, or alter a held preview.
  const openMenu=async name=>{const point=await modelPoint(name);await page.mouse.click(point.x,point.y,{button:'right'});assert.equal(await page.evaluate(()=>editor.placement.contextMenu.object?.name),name==='左部件'?'整体模型':name);};
  const action=async id=>{await page.locator('#scene-context-menu button[data-action="'+id+'"]').click();};
  const restoreCamera=async()=>page.evaluate(()=>{editor.camera.position.set(9,10,16);editor.controls.center.set(0,.8,0);editor.camera.lookAt(editor.controls.center);editor.signals.cameraChanged.dispatch(editor.camera);});
  await restoreCamera();
  p=await modelPoint('左部件');const cameraBefore=await page.evaluate(()=>({p:editor.camera.position.toArray(),c:editor.controls.center.toArray()}));
  await page.keyboard.down('Space');await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+38,p.y+20);await page.mouse.up();await page.keyboard.up('Space');
  const cameraAfter=await page.evaluate(()=>({p:editor.camera.position.toArray(),c:editor.controls.center.toArray()}));
  assert(!close(cameraBefore.p,cameraAfter.p));assert(close(cameraAfter.p.map((x,i)=>x-cameraBefore.p[i]),cameraAfter.c.map((x,i)=>x-cameraBefore.c[i])),'pan translates camera and target equally');
  assert.equal(await page.evaluate(()=>editor.placement.object),null,'Space drag on a model never grabs it');
  assert.equal(await page.evaluate(()=>editor.placement.contextMenu.object),null);
  await restoreCamera();p=await modelPoint('左部件');await page.mouse.click(p.x,p.y);await move([2,1.5,0]);
  const preview=await state('整体模型');
  await page.keyboard.down('Space');await page.mouse.down();await page.mouse.move(p.x+18,p.y+12);await page.mouse.up();await page.keyboard.up('Space');
  assert.equal(await page.evaluate(()=>editor.placement.object?.name),'整体模型');assert(close((await state('整体模型')).position,preview.position),'Space pan leaves held model in world space');
  await restoreCamera();
  await page.mouse.down({button:'right'});await page.mouse.move(p.x+28,p.y+16);await page.mouse.up({button:'right'});
  assert.equal(await page.evaluate(()=>editor.placement.object?.name),'整体模型');assert(close((await state('整体模型')).position,preview.position),'orbit leaves held model in world space');
  assert.equal(await page.evaluate(()=>editor.placement.contextMenu.object),null,'right drag never opens menu');
  await page.mouse.click(p.x+28,p.y+16,{button:'right'});
  assert.equal(await page.evaluate(()=>editor.placement.object),null);assert(close((await state('整体模型')).position,placed.position),'right click restores pre-grab position');
  assert.equal(await page.evaluate(()=>editor.placement.contextMenu.object),null,'cancel click never also opens menu');
  await restoreCamera();p=await modelPoint('左部件');const clickCamera=await page.evaluate(()=>editor.camera.position.toArray());
  await page.mouse.move(p.x,p.y);await page.mouse.down({button:'right'});await page.mouse.move(p.x+2,p.y+1);await page.mouse.up({button:'right'});
  assert.equal(await page.evaluate(()=>editor.placement.contextMenu.object?.name),'整体模型');assert(close(clickCamera,await page.evaluate(()=>editor.camera.position.toArray())),'click jitter never orbits');
  await page.waitForTimeout(140);assert(await page.getByRole('menu',{name:'模型操作'}).isVisible(),'menu survives its opening transition');
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>editor.placement.contextMenu.object),null);
  await openMenu('左部件');await action('lock');
  assert(await page.evaluate(()=>editor.scene.getObjectByName('整体模型').userData.isLocked===true));
  assert.equal(await page.evaluate(()=>editor.sceneHelpers.children.filter(o=>o.name==='locked-outline'&&o.visible).length),1);
  p=await modelPoint('左部件');await page.mouse.click(p.x,p.y);assert.equal(await page.evaluate(()=>editor.placement.object),null,'locked root cannot be grabbed');
  assert(await page.evaluate(()=>editor.placement.scale(1.1)===false),'locked root cannot be keyboard resized');
  await page.evaluate(()=>{editor.placement.collectColliders();});
  assert(await page.evaluate(()=>editor.placement.colliders.some(m=>editor.selector.getModelRoot(m).userData.isLocked)),'locked model remains a support collider');
  await openMenu('左部件');assert.equal(await page.locator('#scene-context-menu button[data-action=lock]').textContent(),'解锁位置');
  await action('lock');assert.equal(await page.evaluate(()=>editor.sceneHelpers.children.filter(o=>o.name==='locked-outline').length),0);
  await page.evaluate(()=>editor.undo());assert(await page.evaluate(()=>editor.scene.getObjectByName('整体模型').userData.isLocked===true),'lock undo recreates the outline');
  await page.evaluate(()=>editor.redo());
  console.log('PASS: Space pan on models, right orbit while holding, right-click cancel, click-jitter/menu separation, Esc fade, lock/unlock/history and support retention');
  // Every menu action operates on the whole root and leaves one undo step.
  const baseScale=(await state('整体模型')).scale;
  await openMenu('左部件');await action('mirrorX');assert(close((await state('整体模型')).scale,[-baseScale[0],baseScale[1],baseScale[2]]));
  await openMenu('左部件');await action('mirrorZ');assert(close((await state('整体模型')).scale,[-baseScale[0],baseScale[1],-baseScale[2]]));
  await page.evaluate(()=>{editor.undo();editor.undo();});assert(close((await state('整体模型')).scale,baseScale));
  const baseRotation=(await state('整体模型')).rotation;
  await page.evaluate(()=>{const o=editor.scene.getObjectByName('整体模型');o.rotation.set(.2,.4,.6);editor.signals.objectChanged.dispatch(o);});
  const tilted=(await state('整体模型')).rotation;
  await openMenu('左部件');await action('resetRotation');assert(close((await state('整体模型')).rotation,[0,0,0,1]));
  await page.evaluate(()=>editor.undo());assert(close((await state('整体模型')).rotation,tilted));
  await page.evaluate(q=>{const o=editor.scene.getObjectByName('整体模型');o.quaternion.fromArray(q);editor.signals.objectChanged.dispatch(o);},baseRotation);
  await page.evaluate(()=>{
   editor.removeObject(editor.scene.getObjectByName('整体模型 · 副本'));
   const o=editor.scene.getObjectByName('整体模型');o.position.y+=2;editor.signals.objectChanged.dispatch(o);
   const ceiling=new THREE.Mesh(new THREE.BoxGeometry(4,.2,4),originalMaterial);ceiling.name='上方悬板';ceiling.position.set(2,6,0);editor.addObject(ceiling);
  });
  await openMenu('左部件');await action('ground');assert(Math.abs((await state('整体模型')).bottom-1.5)<1e-7,'re-ground chooses the table below, excluding self and an overhead panel');
  await page.evaluate(()=>editor.undo());assert(Math.abs((await state('整体模型')).bottom-3.5)<1e-7,'re-ground undo restores floating pose');
  await page.evaluate(()=>{editor.redo();editor.removeObject(editor.scene.getObjectByName('上方悬板'));});
  const tablePosition=(await state('整体模型')).position;
  await page.evaluate(()=>{const o=editor.scene.getObjectByName('整体模型');o.position.x-=6;o.position.z-=3;o.position.y+=1;editor.signals.objectChanged.dispatch(o);});
  await openMenu('左部件');await action('ground');assert(Math.abs((await state('整体模型')).bottom)<1e-7,'re-ground outside the table chooses Y=0');
  await page.evaluate(v=>{const o=editor.scene.getObjectByName('整体模型');o.position.fromArray(v);editor.signals.objectChanged.dispatch(o);},tablePosition);
  await openMenu('左部件');await action('lock');
  assert(await page.evaluate(()=>new THREE.ObjectLoader().parse(editor.scene.toJSON()).getObjectByName('整体模型').userData.isLocked===true),'lock flag survives native scene serialization');
  assert(await page.evaluate(()=>!JSON.stringify(editor.scene.toJSON()).includes('locked-outline')),'gray helpers stay out of scene exports');
  const beforeClone=await page.evaluate(()=>editor.scene.children.length);
  await openMenu('左部件');await action('clone');assert.equal(await page.evaluate(()=>editor.placement.object?.name),'整体模型 · 副本');
  assert(await page.evaluate(()=>!editor.placement.object.userData.isLocked),'a locked source produces a movable copy');
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>editor.scene.children.length),beforeClone);
  await openMenu('左部件');await action('clone');await move([0,0,3]);await page.mouse.click(...Object.values(await project([0,0,3])));
  assert.equal(await page.evaluate(()=>editor.scene.children.length),beforeClone+1);await page.evaluate(()=>editor.undo());assert.equal(await page.evaluate(()=>editor.scene.children.length),beforeClone,'menu clone has one placement undo');
  await openMenu('左部件');await action('delete');assert.equal(await page.evaluate(()=>editor.scene.getObjectByName('整体模型')),undefined);assert.equal(await page.evaluate(()=>editor.sceneHelpers.children.filter(o=>o.name==='locked-outline').length),0);
  await page.evaluate(()=>editor.undo());assert(await page.evaluate(()=>editor.scene.getObjectByName('整体模型').userData.isLocked),'delete undo restores the whole locked model');
  await openMenu('左部件');await page.mouse.click(350,65);assert.equal(await page.evaluate(()=>editor.placement.contextMenu.object),null,'outside canvas click closes menu');
  await page.evaluate(()=>editor.placement.contextMenu.show(editor.scene.getObjectByName('整体模型'),innerWidth-2,innerHeight-2));
  const bounds=await page.locator('#scene-context-menu').boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=1440&&bounds.y+bounds.height<=940,'menu is clamped to the window');
  await page.screenshot({path:path.join(root,'.build_tmp/context-menu.png')});
  await page.keyboard.press('Escape');
  console.log('PASS: actual mirror X/Z, reset rotation, downward table/floor re-ground, locked-source clone and delete, single-step history, serialization, outside/Esc dismissal and window-edge menu');
  const cp=await project([0,0,-2]);const oldCamera=await page.evaluate(()=>editor.camera.position.toArray());
  await page.mouse.move(cp.x,cp.y);await page.mouse.down({button:'right'});await page.mouse.move(cp.x+25,cp.y+10);await page.mouse.up({button:'right'});
  assert(!close(oldCamera,await page.evaluate(()=>editor.camera.position.toArray())),'right button still orbits camera');
  assert.equal(await page.evaluate(()=>editor.placement.object),null);
  await page.screenshot({path:path.join(root,'.build_tmp/interactions.png')});
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(external,[]);
  console.log('PASS: Alt clone in place, multi-model stacking, single-step clone history, grounded placement, Delete/undo, exact narrow-footprint collision, Esc, placed-object scale, input protection, right-button camera; console errors=0, missing assets=0, external requests=0');
 } finally {if(browser)await browser.close();server.kill('SIGTERM');}
})().catch(error=>{console.error(error);process.exitCode=1;});
