const assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),grid=process.argv.includes('--large')?512:256;
(async()=>{
 const server=spawn('python3',['serve.py','--port','0'],{cwd:root,stdio:['ignore','pipe','pipe']});let browser;
 try{
  const origin=await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{const m=String(d).match(/http:\/\/127\.0\.0\.1:\d+/);if(m)resolve(m[0]);});server.on('error',reject)});
  browser=await chromium.launch({channel:'chrome',headless:true,timeout:6000,args:['--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1194,height:834}});page.setDefaultTimeout(2000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(origin+'/editor/',{waitUntil:'commit'});await page.waitForFunction(()=>window.editor?.session&&!editor.session.loading,null,{timeout:6000});
  const bytes=await page.evaluate(n=>{
   editor.config.setKey('autosave',false);
   const vertices=n*n*6,positions=new Float32Array(vertices*3),normals=new Float32Array(vertices*3);
   let k=0;for(let z=0;z<n;z++)for(let x=0;x<n;x++)for(const [dx,dz] of [[0,0],[0,1],[1,0],[1,0],[0,1],[1,1]]){
    positions[k]=(x+dx)/n*8-4;positions[k+2]=(z+dz)/n*8-4;normals[k+1]=1;k+=3;
   }
   const size=positions.byteLength,json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1}}]}],buffers:[{byteLength:size*2}],bufferViews:[{buffer:0,byteLength:size},{buffer:0,byteOffset:size,byteLength:size}],accessors:[{bufferView:0,componentType:5126,count:vertices,type:'VEC3',min:[-4,0,-4],max:[4,0,4]},{bufferView:1,componentType:5126,count:vertices,type:'VEC3'}]};
   const text=new TextEncoder().encode(JSON.stringify(json)),length=Math.ceil(text.length/4)*4;
   const data=new Uint8Array(28+length+size*2),view=new DataView(data.buffer);
   [0x46546c67,2,data.length,length,0x4e4f534a].forEach((v,i)=>view.setUint32(i*4,v,true));data.fill(32,20,20+length);data.set(text,20);view.setUint32(20+length,size*2,true);view.setUint32(24+length,0x004e4942,true);data.set(new Uint8Array(positions.buffer),28+length);data.set(new Uint8Array(normals.buffer),28+length+size);
   window.importFixture=new File([data],'容量样件.glb');return data.length;
  },grid);
  // Cancel the options dialog before reading the large file; no scene insertion or leftover queue.
  await page.evaluate(()=>{window.importResult=editor.loader.loadFiles([importFixture,importFixture]);});
  assert(await page.locator('#import-status').isVisible());await page.locator('.Dialog').getByRole('button',{name:'取消',exact:true}).click();
  assert.equal(await page.evaluate(()=>importResult),false);assert.equal(await page.evaluate(()=>editor.scene.children.length),0);
  // Cancel during the parser stage, including a queued second model.
  await page.evaluate(()=>{
   const observer=new MutationObserver(()=>{if(document.querySelector('#import-status')?.textContent.includes('正在解析')){editor.loader.cancelImport();observer.disconnect();}});
   observer.observe(document.body,{childList:true,subtree:true});window.importResult=editor.loader.loadFiles([importFixture,importFixture]);
  });
  await page.locator('.Dialog').getByRole('button',{name:'确定',exact:true}).click();assert.equal(await page.evaluate(()=>importResult),false);assert.equal(await page.evaluate(()=>editor.scene.children.length),0);
  const start=Date.now();await page.evaluate(()=>{window.importResult=editor.loader.loadFiles([importFixture]);});
  await page.locator('.Dialog').getByRole('button',{name:'确定',exact:true}).click();assert.equal(await page.evaluate(()=>importResult),true);
  const triangles=await page.evaluate(()=>{let n=0;editor.scene.traverse(o=>{if(o.geometry)n+=o.geometry.attributes.position.count/3});return n});assert.equal(triangles,grid*grid*2);
  assert.equal(await page.evaluate(()=>editor.loader.busy),false);assert.equal(await page.locator('#import-status').count(),0);
  const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');const metrics=await cdp.send('Performance.getMetrics');const heap=metrics.metrics.find(x=>x.name==='JSHeapUsedSize')?.value;
  const dialogue=page.waitForEvent('dialog').then(async d=>{assert(d.message().includes('导入'));await d.accept()});
  await page.evaluate(()=>{window.badResult=editor.loader.loadFiles([new File(['invalid'],'损坏.glb')]);});
  await page.locator('.Dialog').getByRole('button',{name:'确定',exact:true}).click();await dialogue;assert.equal(await page.evaluate(()=>badResult),false);
  assert.equal(await page.evaluate(()=>editor.scene.children.length),1,'bad import preserves prior model');
  await page.evaluate(()=>editor.session.prepareToClose());
  assert.equal(await page.evaluate(async()=>Boolean((await editor.storage.get()).scene.object.children.length)),true,'large scene persisted');
  assert.deepEqual(errors,[]);console.log(`PASS: options/parser cancellation stops batch; ${(bytes/1048576).toFixed(2)} MiB GLB, ${triangles} triangles imported and saved in ${Date.now()-start} ms; JS heap ${(heap/1048576).toFixed(1)} MiB (not total process/GPU memory); corrupt-file feedback; console errors=0`);
 }finally{if(browser)await browser.close();server.kill('SIGTERM')}
})().catch(e=>{console.error(e);process.exitCode=1});
