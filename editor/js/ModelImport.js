import { AddObjectCommand } from './commands/AddObjectCommand.js';
import { SetSceneCommand } from './commands/SetSceneCommand.js';
import { GLTFImportDialog } from './GLTFImportDialog.js';

// GLB/GLTF/OBJ share a sequential, cancellable import path; other upstream formats remain available.
class ModelImport {
	constructor( editor, createGLTFLoader ) { this.editor = editor; this.createGLTFLoader = createGLTFLoader; this.job = null; }
	cancel() {
		if ( ! this.job ) return;
		this.job.cancelled = true; this.job.reader?.abort(); this.job.dialog?.cancel();
	}
	async load( file, manager ) {
		const job = { cancelled: false }, editor = this.editor;
		this.job = job;
		const panel = document.createElement( 'div' ); panel.id = 'import-status'; panel.dataset.placementAction = 'import';
		const label = document.createElement( 'span' ); label.setAttribute( 'role', 'status' ); label.setAttribute( 'aria-live', 'polite' );
		const progress = document.createElement( 'progress' ); progress.max = 1; progress.setAttribute( 'aria-label', '模型读取进度' );
		const cancel = document.createElement( 'button' ); cancel.textContent = '取消导入'; cancel.onclick = () => this.cancel();
		panel.append( label, progress, cancel ); document.body.append( panel );
		let loader, object, committed = false;
		const check = () => { if ( job.cancelled ) throw new DOMException( '已取消导入', 'AbortError' ); };
		try {
			label.textContent = file.name + ' · 等待导入';
			const extension = file.name.split( '.' ).pop().toLowerCase();
			let asScene = false;
			if ( extension !== 'obj' ) {
				job.dialog = new GLTFImportDialog( editor.strings );
				asScene = ( await job.dialog.show() ).asScene; job.dialog = null;
			}
			check();
			const contents = await new Promise( ( resolve, reject ) => {
				const reader = job.reader = new FileReader();
				label.textContent = file.name + ' · 正在读取';
				reader.onprogress = event => { if ( event.lengthComputable ) progress.value = event.loaded / event.total; };
				reader.onerror = () => reject( reader.error ); reader.onabort = () => reject( new DOMException( '已取消导入', 'AbortError' ) );
				reader.onload = () => resolve( reader.result );
				if ( extension === 'glb' ) reader.readAsArrayBuffer( file ); else reader.readAsText( file );
			} );
			check(); label.textContent = file.name + ' · 正在解析'; progress.removeAttribute( 'value' );
			await new Promise( resolve => setTimeout( resolve, 0 ) ); check();
			if ( extension === 'obj' ) {
				const { OBJLoader } = await import( 'three/addons/loaders/OBJLoader.js' );
				check(); object = new OBJLoader( manager ).parse( contents );
			} else {
				loader = await this.createGLTFLoader( manager ); check();
				const result = await loader.parseAsync( contents, '' ); object = result.scene;
				object.animations.push( ...result.animations );
			}
			// Let queued cancel clicks run before inserting a fully parsed model.
			await new Promise( resolve => setTimeout( resolve, 0 ) ); check();
			object.name = file.name;
			editor.execute( asScene ? new SetSceneCommand( editor, object ) : new AddObjectCommand( editor, object ) );
			committed = true;
			return true;
		} catch ( error ) {
			if ( job.cancelled || error.name === 'AbortError' || error.message === 'Import cancelled' ) return false;
			alert( '导入 ' + file.name + ' 失败：' + error.message ); return false;
		} finally {
			loader?.dracoLoader.dispose(); loader?.ktx2Loader.dispose();
			if ( object && ! committed ) {
				const resources = new Set();
				object.traverse( node => {
					if ( node.geometry ) resources.add( node.geometry );
					for ( const material of [ node.material ].flat().filter( Boolean ) ) {
						resources.add( material );
						for ( const value of Object.values( material ) ) if ( value?.isTexture ) resources.add( value );
					}
				} );
				for ( const resource of resources ) { resource.dispose(); if ( resource.isTexture ) resource.image?.close?.(); }
			}
			panel.remove(); this.job = null;
		}
	}
}
export { ModelImport };
