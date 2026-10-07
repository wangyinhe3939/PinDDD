const assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=spawn('python3',['serve.py','--port','0'],{cwd:root,stdio:['ignore','pipe','pipe']});let browser;
 try{
  const origin=await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{const m=String(d).match(/http:\/\/127\.0\.0\.1:\d+/);if(m)resolve(m[0]);});server.on('error',reject);});
  browser=await chromium.launch({channel:'chrome',headless:true,timeout:6000,args:['--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:940}});page.setDefaultTimeout(1800);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(origin+'/editor/',{waitUntil:'commit'});
  await page.waitForFunction(()=>window.editor?.session&&!editor.session.loading,null,{timeout:6000});
  await page.evaluate(async()=>{
   const check=(v,m)=>{if(!v)throw Error(m)},e=editor,s=e.session;
   e.config.setKey('autosave',false);
   const box=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());box.name='可靠保存样件';e.addObject(box);
   const save=e.storage.set.bind(e.storage);let release;
   e.storage.set=data=>new Promise(resolve=>{release=()=>save(data).then(resolve)});
   const writing=s.flush();await new Promise(r=>setTimeout(r,0));
   check(s.state==='正在保存…'&&s.savedRevision!==s.revision,'no success before disk transaction');
   e.storage.set=save;box.position.x=3;e.signals.objectChanged.dispatch(box);release();await writing;
   check((await e.storage.get()).scene.object.children[0].matrix[12]===3,'edits during save are queued');
   check(s.state==='已自动保存','success follows committed transaction');
   box.position.y=2;e.signals.objectChanged.dispatch(box);e.storage.set=async()=>{throw new DOMException('测试空间不足','QuotaExceededError')};
   let blocked=false;try{await s.prepareToClose()}catch{blocked=true}
   check(blocked&&s.state.startsWith('保存失败'),'save failure keeps close blocked');
   check((await e.storage.get()).scene.object.children[0].matrix[13]===0,'failure retains prior data');
   check(JSON.parse(await s.snapshot()).scene.object.children[0].matrix[13]===2,'manual export remains available after recovery write failure');
   e.storage.set=save;await s.flush(true);check(!s.error,'retry clears failure');
   let invalid=false;try{await s.load({scene:{}})}catch{invalid=true}
   check(invalid&&e.scene.getObjectByName('可靠保存样件')===box,'invalid project cannot clear scene');
   const project=e.toJSON();project.scene.object.children[0].name='重新打开的项目';await s.load(project);
   check(e.scene.children.length===1&&e.scene.children[0].name==='重新打开的项目','project replaces instead of duplicating');
   e.scene.children[0].name='最新场景';e.signals.objectChanged.dispatch(e.scene.children[0]);await s.prepareToClose();
  });
  await page.reload({waitUntil:'commit'});await page.waitForFunction(()=>window.editor?.session&&!editor.session.loading,null,{timeout:6000});
  assert.equal(await page.evaluate(()=>editor.scene.children[0].name),'最新场景','reload restores committed scene');
  await page.evaluate(async()=>{
   // Corrupt only the current snapshot; the preceding complete transaction must survive.
   const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('pinddd-creator-editor',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
   await new Promise((resolve,reject)=>{const t=db.transaction(['states'],'readwrite');t.objectStore('states').put({broken:true},0);t.oncomplete=resolve;t.onerror=()=>reject(t.error)});db.close();
  });
  await page.reload({waitUntil:'commit'});await page.waitForFunction(()=>window.editor?.session&&!editor.session.loading,null,{timeout:6000});
  assert.equal(await page.evaluate(()=>editor.scene.children[0].name),'重新打开的项目');
  assert.equal(await page.locator('#save-status').textContent(),'已恢复上一份有效存档');
  await page.evaluate(async()=>{
   await editor.session.flush(true);
   if((await editor.storage.get(null,true)).scene.object.children[0].name!=='重新打开的项目')throw Error('recovery must not rotate corrupt current over good previous');
   const db=await new Promise(resolve=>{const r=indexedDB.open('pinddd-creator-editor',1);r.onsuccess=()=>resolve(r.result)});
   await new Promise(resolve=>{const t=db.transaction(['states'],'readwrite');t.objectStore('states').put({broken:true},0);t.objectStore('states').put({broken:true},1);t.oncomplete=resolve});db.close();
  });
  await page.reload({waitUntil:'commit'});await page.waitForFunction(()=>window.editor?.session&&!editor.session.loading,null,{timeout:6000});
  assert.equal(await page.evaluate(async()=>{
   editor.addObject(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()));
   try{await editor.session.flush(true);return false}catch{return !!editor.session.recoveryError&&(await editor.storage.get()).broken===true}
  }),true,'unresolved recovery must never overwrite saved data');
  assert.deepEqual(errors,[]);
  console.log('PASS: transaction acknowledgement, edits queued during save, injected write failure/close protection/manual export/retry, invalid project preservation, replace/open, reload and previous-snapshot recovery; console errors=0');
 }finally{if(browser)await browser.close();server.kill('SIGTERM')}
})().catch(e=>{console.error(e);process.exitCode=1});
