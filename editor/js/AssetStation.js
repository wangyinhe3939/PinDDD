const key = 'pinddd.asset-station';
const presets = [
 {name:'Poly Pizza',url:'https://poly.pizza/',description:'低多边形 · 免费模型'},
 {name:'Kenney',url:'https://kenney.nl/assets',description:'免费开源 · 游戏资产包'},
 {name:'Poly Haven',url:'https://polyhaven.com/',description:'免费模型 · 材质与 HDR'},
 {name:'Sketchfab',url:'https://sketchfab.com/',description:'写实与精细模型'}
];
function valid( site ) {
 if ( ! site || typeof site.name !== 'string' || ! site.name.trim() || site.name.length > 48 || typeof site.url !== 'string' ) return false;
 try { return ['http:', 'https:'].includes( new URL( site.url ).protocol ); } catch { return false; }
}
export function AssetStation() {
 const panel = document.createElement( 'aside' ); panel.id = 'asset-station'; panel.setAttribute( 'aria-label', '资产补给站' );
 const drawer = document.createElement( 'details' ); drawer.open = true;
 const title = document.createElement( 'summary' ); title.textContent = '资产补给站'; drawer.append( title );
 const content = document.createElement( 'div' ); content.className = 'station-content'; drawer.append( content );
 const intro = document.createElement( 'p' ); intro.className = 'station-intro'; intro.textContent = '找素材，让想法落地。'; content.append( intro );
 const list = document.createElement( 'div' ); list.className = 'station-list'; content.append( list );
 const status = document.createElement( 'p' ); status.className = 'station-status'; status.setAttribute( 'role', 'status' );
 let sites = presets.map( site => ( {...site} ) );
 try { const saved = JSON.parse( localStorage.getItem( key ) ); if ( Array.isArray( saved ) ) sites = saved.filter( valid ).slice(0,100); } catch { status.textContent = '书签数据未能读取，已显示预置站点。'; }
 function save() {
  try { localStorage.setItem( key, JSON.stringify( sites ) ); return true; }
  catch { status.textContent = '浏览器未允许保存书签，本次修改只保留在当前窗口。'; return false; }
 }
 function render() {
  list.replaceChildren();
  sites.forEach( ( site, index ) => {
   const row = document.createElement( 'div' ); row.className = 'station-card';
   const link = document.createElement( 'a' ); link.href = site.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
   const name = document.createElement( 'strong' ); name.textContent = site.name;
   const caption = document.createElement( 'span' ); caption.textContent = site.description || new URL( site.url ).hostname;
   link.append( name, caption );
   const remove = document.createElement( 'button' ); remove.type = 'button'; remove.textContent = '×'; remove.title = '删除 '+site.name; remove.setAttribute( 'aria-label', remove.title );
   remove.addEventListener( 'click', () => { sites.splice( index, 1 ); save(); render(); } );
   row.append( link, remove ); list.append( row );
  } );
 }
 const add = document.createElement( 'details' ); add.className = 'station-add';
 const addTitle = document.createElement( 'summary' ); addTitle.textContent = '+ 添加常用站点'; add.append( addTitle );
 const form = document.createElement( 'form' );
 const name = document.createElement( 'input' ); name.placeholder = '站点名称'; name.setAttribute('aria-label','站点名称'); name.required = true; name.maxLength = 48;
 const url = document.createElement( 'input' ); url.type = 'url'; url.placeholder = 'https://…'; url.setAttribute('aria-label','站点链接'); url.required = true;
 const submit = document.createElement( 'button' ); submit.type = 'submit'; submit.textContent = '添加书签';
 form.append( name, url, submit );
 form.addEventListener( 'submit', event => {
  event.preventDefault(); const site = { name:name.value.trim(), url:url.value.trim() };
  if ( ! valid(site) ) { status.textContent = '请填写名称和 http / https 网站链接。'; return; }
  if ( sites.length >= 100 ) { status.textContent = '最多保存 100 个站点，请先删除不常用的书签。'; return; }
  if ( sites.some( item => item.url === new URL(site.url).href ) ) { status.textContent = '这个链接已经在补给站里了。'; return; }
  site.url = new URL(site.url).href; sites.push(site); if (save()) status.textContent = '书签已保存'; render(); form.reset(); add.open = false;
 } );
 add.append( form ); content.append( add, status );
 const tip = document.createElement( 'p' ); tip.className = 'station-tip'; tip.textContent = '从网站下载的 .glb 模型，直接拖进此窗口即可摆放';
 content.append( tip ); panel.append( drawer ); render(); return panel;
}
