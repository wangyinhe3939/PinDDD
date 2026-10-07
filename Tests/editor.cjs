const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const persistence = process.argv.includes('--persistence');
function fixture() {
 const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:'拖入模型'}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-1,0,-1],max:[1,2,1]}]};
 const text=Buffer.from(JSON.stringify(json));const n=Math.ceil(text.length/4)*4;
 const out=Buffer.alloc(28+n+36);[0x46546c67,2,out.length,n,0x4e4f534a].forEach((v,i)=>out.writeUInt32LE(v,i*4));
 out.fill(32,20,20+n);text.copy(out,20);out.writeUInt32LE(36,20+n);out.writeUInt32LE(0x004e4942,24+n);
 [-1,0,-1,1,0,-1,0,2,1].forEach((v,i)=>out.writeFloatLE(v,28+n+i*4));return Array.from(out);
}
(async()=>{
 const server=spawn('python3',['serve.py','--port','0'],{cwd:root,stdio:['ignore','pipe','pipe']});
 let browser;
 let serverLog="";server.stderr.on("data",chunk=>{serverLog=(serverLog+chunk).slice(-4000);});
 try {
  const origin=await new Promise((resolve,reject)=>{server.stdout.on('data',data=>{const m=String(data).match(/http:\/\/127\.0\.0\.1:\d+/);if(m)resolve(m[0]);});server.on('error',reject);server.on('exit',code=>reject(new Error('server exited '+code)));});
  browser=await chromium.launch({channel:'chrome',headless:true,timeout:6000,args:['--enable-unsafe-swiftshader'],downloadsPath:path.join(root,'.build_tmp/downloads')});
  const context=await browser.newContext({viewport:{width:1440,height:940},colorScheme:'light',acceptDownloads:true});
  const page=await context.newPage();page.setDefaultTimeout(2200);
  const errors=[],badRequests=[],remote=[],pendingRequests=new Set();
  page.on('request',request=>pendingRequests.add(request.url()));
  page.on('response',response=>pendingRequests.delete(response.url()));
  page.on('pageerror',error=>{errors.push(error.message);console.error('PAGE ERROR:',error.message);});
  page.on('console',msg=>{if(msg.type()==='error'){errors.push(msg.text());console.error('CONSOLE ERROR:',msg.text());}});
  page.on('requestfailed',request=>badRequests.push(request.url()));
  page.on('response',response=>{if(response.status()>=400)badRequests.push(response.status()+' '+response.url());});
  await context.route('**/*',route=>{const url=route.request().url();if(!url.startsWith(origin+'/')&&!url.startsWith('blob:')&&!url.startsWith('data:')){remote.push(url);return route.abort();}return route.continue();});
  console.log('CHECK: local server ready');
  const entry=await page.goto(origin+'/editor/',{waitUntil:'commit',timeout:2500});
  assert.equal(entry.headers()['cache-control'],'no-cache','entry revalidates on refresh');
  const moduleResponse=await context.request.get(origin+'/editor/js/Viewport.Controls.js');
  assert.equal(moduleResponse.headers()['cache-control'],'no-cache','UI modules revalidate too');
  await page.waitForFunction(()=>window.editor?.placement&&editor.session&&!editor.session.loading&&document.querySelector('#viewport canvas'),null,{timeout:6000});
  console.log('CHECK: editor WebGL ready');
  assert.equal(await page.title(),'Double One DD·万元户');
  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('select option')].map(x=>x.textContent).filter(x=>/^[A-Za-z][A-Za-z ]+$/.test(x))),[],'all dropdown labels are Chinese');
  assert.equal(await page.evaluate(()=>editor.placement.translationSnap),0.1);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(24, 26, 29)');
  assert.equal(await page.locator('body').innerText().then(s=>s.includes('???')),false);

  if (process.argv.includes('--resources')) {
   // Import every retained optional module, including geometry panels loaded by type.
   const modules = [
    ...fs.readdirSync(path.join(root,'examples/jsm'),{recursive:true})
     .filter(file=>file.endsWith('.js')&&!file.startsWith('libs/'))
     .map(file=>'../examples/jsm/'+file),
    ...fs.readdirSync(path.join(root,'editor/js'))
     .filter(file=>/^Sidebar\.Geometry\..*\.js$/.test(file)).map(file=>'./js/'+file),
    'three/webgpu', 'three/tsl'
   ];
   await page.evaluate(async modules=>{
    await Promise.all(modules.map(file=>import(file)));
    const {FontLoader}=await import('three/addons/loaders/FontLoader.js');
    const {TextGeometry}=await import('three/addons/geometries/TextGeometry.js');
    const font=await new FontLoader().loadAsync('../examples/fonts/helvetiker_bold.typeface.json');
    const text=new TextGeometry('DDD',{font,size:1,depth:.1});
    if(!text.attributes.position.count)throw Error('Text geometry missing');
    text.dispose();
    // Round-trip a compressed mesh so worker/WASM resources are exercised too.
    const {DRACOExporter}=await import('three/addons/exporters/DRACOExporter.js');
    const {DRACOLoader}=await import('three/addons/loaders/DRACOLoader.js');
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
    const encoded=await new DRACOExporter().parseAsync(mesh);
    for(const folder of ['../examples/jsm/libs/draco/','../examples/jsm/libs/draco/gltf/']){
     const loader=new DRACOLoader().setDecoderPath(folder);
     try{
      const geometry=await new Promise((resolve,reject)=>loader.parse(encoded.slice().buffer,resolve,reject));
      if(!geometry.attributes.position.count)throw Error('Draco decode failed');
      geometry.dispose();
     }finally{loader.dispose();}
    }
    const {KTX2Loader}=await import('three/addons/loaders/KTX2Loader.js');
    const ktx=new KTX2Loader().setTranscoderPath('../examples/jsm/libs/basis/');
    try{await ktx.init();}finally{ktx.dispose();}
    mesh.geometry.dispose();mesh.material.dispose();
   },modules);
   assert.deepEqual(errors,[],'optional module errors');
   assert.deepEqual(badRequests,[],'optional resource paths');
   assert.deepEqual(remote,[],'offline optional dependencies');
   console.log('PASS: '+modules.length+' optional modules, text font, two Draco worker round-trips, KTX2 initialization; no missing resources');
   return;
  }
  if (!persistence) {
  const help=page.locator('#viewport-shortcuts'),helpButton=help.locator('summary');
  assert.equal(await help.evaluate(e=>e.open),false,'shortcut help starts closed');
  assert.equal(await page.locator('#toolbar').isVisible(),false,'idle canvas has no hint toolbar');
  const hb=await helpButton.boundingBox(),cameraControls=await page.locator('#viewport-controls').boundingBox();
  assert(hb.width<=85&&hb.height<=28&&Math.abs(hb.y-cameraControls.y)<4,'help is a compact button beside the camera controls');
  assert.equal(await helpButton.innerText(),'快捷键','help has a visible label');
  await helpButton.click();assert(await page.getByRole('region',{name:'画布快捷键'}).isVisible());
  await help.getByText('空格 + 左键拖动',{exact:true}).waitFor({state:'visible'});
  await page.keyboard.press('Escape');assert.equal(await help.evaluate(e=>e.open),false);
  await helpButton.press('Space');assert(await page.getByRole('region',{name:'画布快捷键'}).isVisible(),'help supports keyboard opening');
  await page.mouse.click(450,260);assert.equal(await help.evaluate(e=>e.open),false,'outside click closes help');
  // Exercise the native add/clone/undo/redo menu through actual DOM events.
  await page.locator('#menubar .menu > .title').getByText('添加',{exact:true}).hover();
  await page.locator('.submenu-title').filter({hasText:'基础形状'}).hover();
  await page.locator('.option').getByText('立方体',{exact:true}).click();
  await page.waitForFunction(()=>editor.selected?.name==='立方体');
  assert(await page.locator('#scene-section').evaluate(e=>e.open),'scene list stays available while editing');
  assert(await page.locator('#object-section').evaluate(e=>e.open),'selection opens the placement section');
  await page.locator('#material-section > summary').click();
  assert.equal(await page.locator('#object-section').evaluate(e=>e.open),false,'property sections are exclusive');
  const roughness=page.locator('#material-section .Row').filter({has:page.getByText('粗糙度',{exact:true})}).locator('input');
  await roughness.fill('0.42');await roughness.press('Tab');
  assert(Math.abs(await page.evaluate(()=>editor.selected.material.roughness)-.42)<1e-7,'folded material controls still edit the real model');
  await page.locator('#geometry-section > summary').click();assert.equal(await page.locator('#material-section').evaluate(e=>e.open),false);
  await page.locator('#object-section > summary').click();
  await page.evaluate(()=>editor.placement.grab(editor.selected));
  await helpButton.click();assert(await page.evaluate(()=>editor.placement.object!==null),'reading help preserves a grabbed model');
  await page.keyboard.press('Escape');assert(await page.evaluate(()=>editor.placement.object!==null),'first Esc only closes help');
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>editor.placement.object),null,'next Esc still cancels the grab');
  console.log('PASS: compact camera help, keyboard/outside dismissal, grab preservation, exclusive accordions and live material editing');
  await page.locator('#menubar .menu > .title').getByText('编辑',{exact:true}).hover();
  await page.locator('.option').getByText('克隆',{exact:true}).click();
  await page.evaluate(()=>{editor.undo();editor.redo();});
  assert.equal(await page.evaluate(()=>editor.scene.children.length),2);
  // Real GLB drop into the page, then accept the native localized import dialog.
  await page.evaluate(bytes=>{const transfer=new DataTransfer();transfer.items.add(new File([new Uint8Array(bytes)],'example.glb',{type:'model/gltf-binary'}));document.dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));},fixture());
  await page.locator('.Dialog .Button').getByText('确定',{exact:true}).click();
  await page.waitForFunction(()=>editor.scene.children.length===3);
  // Exercise the native batch file input with a separate OBJ file.
  await page.locator('input[type=file][multiple]').setInputFiles({name:'示例.obj',mimeType:'text/plain',buffer:Buffer.from('o OBJ样件\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')});
  await page.waitForFunction(()=>editor.scene.children.length===4);
  // Actual file download plus nested world-transform basis conversion.
  await page.evaluate(()=>{const g=new THREE.Group();g.name='父组';g.position.set(1,2,3);g.rotation.y=.3;const box=editor.scene.children[0];editor.scene.remove(box);g.add(box);box.position.set(.2,.4,.6);editor.addObject(g);});
  await page.locator('#menubar .menu > .title').getByText('文件',{exact:true}).hover();
  const sceneDownload=page.waitForEvent('download');
  await page.getByRole('menuitem',{name:'导出场景 JSON',exact:true}).click();
  const sceneFile=await sceneDownload;assert.equal(JSON.parse(fs.readFileSync(await sceneFile.path(),'utf8')).object.type,'Scene');
  const pending=page.waitForEvent('download');
  await page.getByRole('menuitem',{name:'导出 Blender 坐标 JSON',exact:true}).click();
  console.log('CHECK: imports completed');
  const download=await pending;assert.equal(download.suggestedFilename(),'layout.json');
  const layout=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.equal(layout.coordinateSystem,'Blender-Z-Up');assert.equal(layout.objects.length,7);
  const result=await page.evaluate(async data=>{
   const {blenderLayout}=await import('./js/BlenderLayout.js');
   const g=editor.scene.getObjectByName('父组');const obj=g.children[0];obj.updateWorldMatrix(true,false);
   const expected=new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);const actual=data.objects.find(x=>x.id===obj.uuid);
   if(Math.abs(actual.position[0]-expected.x)>1e-7||Math.abs(actual.position[1]+expected.z)>1e-7||Math.abs(actual.position[2]-expected.y)>1e-7)throw Error('world position conversion');
   const C=new THREE.Matrix4().makeRotationX(Math.PI/2),R=C.clone().multiply(obj.matrixWorld).multiply(C.clone().invert());
   const rebuilt=new THREE.Matrix4().compose(new THREE.Vector3().fromArray(actual.position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...actual.rotation,'XYZ')),new THREE.Vector3().fromArray(actual.scale));
   if(R.elements.some((v,i)=>Math.abs(v-rebuilt.elements[i])>1e-7))throw Error('Euler and scale conversion');
   if(blenderLayout(editor.scene).objects.length!==data.objects.length)throw Error('all scene objects');
   return true;
  },layout);assert(result);
  }
  // Native preference controls, persisted bookmarks, safe links and deletion.
  await page.locator('#preferences-section > summary').click();
  await page.getByLabel('网格大小（米）',{exact:true}).fill('12');await page.getByLabel('网格大小（米）',{exact:true}).press('Tab');
  await page.getByLabel('吸附步长（米）',{exact:true}).fill('0.2');await page.getByLabel('吸附步长（米）',{exact:true}).press('Tab');
  assert.equal(await page.evaluate(()=>editor.placement.translationSnap),0.2);
  await page.getByLabel('环境光强度',{exact:true}).fill('0.7');await page.getByLabel('环境光强度',{exact:true}).press('Tab');
  assert.equal(await page.evaluate(()=>editor.scene.environmentIntensity),.7);
  await page.locator('#history-section > summary').click();await page.locator('#renderer-section > summary').click();
  assert.equal(await page.locator('#history-section').evaluate(e=>e.open),false,'advanced preferences fold independently');
  await page.locator('#renderer-section > summary').click();
  assert.equal(await page.locator('.station-card').count(),4);
  assert.equal(await page.evaluate(()=>editor.scene.environmentIntensity),.7);
  await page.getByText('+ 添加常用站点',{exact:true}).click();await page.getByLabel('站点名称',{exact:true}).fill('常用素材');await page.getByLabel('站点链接',{exact:true}).fill('https://example.com/assets');await page.getByRole('button',{name:'添加书签',exact:true}).click();
  assert.equal(await page.locator('.station-card').count(),5);
  assert.equal(await page.locator('.station-card a').last().getAttribute('target'),'_blank');
  if (persistence) {
   console.log('CHECK: preferences and bookmarks saved');
   await page.reload({waitUntil:'commit',timeout:2500});
   await page.waitForFunction(()=>window.editor?.placement&&editor.session&&!editor.session.loading&&document.querySelector('#viewport canvas'),null,{timeout:6000});
   console.log('CHECK: reloaded editor WebGL ready');
   assert.equal(await page.locator('.station-card').count(),5);
   assert.equal(await page.evaluate(()=>editor.placement.translationSnap),.2);
   assert.equal(await page.evaluate(()=>editor.config.getKey('canvas/gridSize')),12);
  }
  await page.getByRole('button',{name:'删除 常用素材',exact:true}).click();assert.equal(await page.locator('.station-card').count(),4);
  if(!await page.locator('#scene-section').evaluate(e=>e.open))await page.locator('#scene-section > summary').click();
  await page.evaluate(()=>{if(editor.scene.children.length)editor.select(editor.scene.children[0]);});
  if(!persistence){
   await page.locator('#viewport-shortcuts > summary').click();
   await page.screenshot({path:path.join(root,'.build_tmp/shortcuts.png')});
   await page.keyboard.press('Escape');
  }
  await page.screenshot({path:path.join(root,'.build_tmp/editor.png')});
  assert.deepEqual(errors,[],'console errors');assert.deepEqual(badRequests,[],'missing assets');assert.deepEqual(remote,[],'external startup dependencies');
  console.log('PASS: actual local server + WebGL; console errors=0, failed resources=0, external requests=0');
  if (!persistence) console.log('PASS: Chinese menus, add/clone/history, real GLB drop + OBJ import, scene/Blender downloads and nested basis conversion');
  console.log('PASS: canvas preferences, snap, environment intensity, bookmark add/delete, safe new-tab links' + (persistence ? ' and reload persistence' : ''));
 } catch(error) {console.error('SERVER TAIL:',serverLog);throw error;} finally {if(browser)await browser.close();server.kill('SIGTERM');}
})().catch(error=>{console.error(error);process.exitCode=1;});
