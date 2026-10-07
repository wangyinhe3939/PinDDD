// One save queue per editor: the UI only confirms a completed storage transaction.
class ProjectSession {
	constructor( editor ) {
		this.editor = editor; this.revision = 0; this.savedRevision = 0; this.fileRevision = - 1; this.exportRevision = - 1;
		this.loading = true; this.pending = null; this.timer = null;
		this.state = '正在恢复…'; this.error = null; this.recoveryError = null;
		this.loadingPanel = document.createElement( 'div' ); this.loadingPanel.id = 'project-loading';
		this.loadingPanel.setAttribute( 'role', 'status' ); this.loadingPanel.textContent = '正在恢复场景…';
		document.body.append( this.loadingPanel );
		window.addEventListener( 'keydown', event => { if ( this.loading ) { event.preventDefault(); event.stopImmediatePropagation(); } }, true );
		const change = () => {
			if ( this.loading || editor.placement.object ) return;
			this.revision ++;
			if ( this.recoveryError ) { this.notify( '恢复失败，请打开项目文件', this.recoveryError ); return; }
			this.notify( '有未保存的修改' );
			clearTimeout( this.timer );
			if ( editor.config.getKey( 'autosave' ) ) this.timer = setTimeout( () => this.flush().catch( () => {} ), 1000 );
		};
		for ( const name of [ 'cameraChanged', 'cameraResetted', 'geometryChanged', 'objectAdded', 'objectChanged', 'objectRemoved', 'materialChanged', 'sceneBackgroundChanged', 'sceneEnvironmentChanged', 'sceneFogChanged', 'sceneGraphChanged', 'scriptChanged', 'historyChanged' ] ) editor.signals[ name ].add( change );
		window.addEventListener( 'beforeunload', event => {
			if ( this.revision !== this.savedRevision || this.error || editor.loader.busy ) { event.preventDefault(); event.returnValue = ''; }
		} );
		document.addEventListener( 'visibilitychange', () => { if ( document.hidden && ! this.loading ) this.flush().catch( () => {} ); } );
		editor.signals.editorCleared.add( () => { if ( ! this.loading ) { this.recoveryError = null; window.webkit?.messageHandlers?.pinDDD?.postMessage( { type: 'newProject' } ); } } );
		this.ready = this.restore();
	}
	notify( text, error = null ) {
		this.state = text; this.error = error;
		this.editor.signals.saveStateChanged.dispatch( text, error );
	}
	async restore() {
		try {
			await this.editor.storage.init();
			let state;
			try {
				state = await this.editor.storage.get();
				if ( state ) await this.editor.fromJSON( state );
			} catch ( error ) {
				state = await this.editor.storage.get( null, true );
				if ( ! state ) throw error;
				await this.editor.fromJSON( state );
				this.notify( '已恢复上一份有效存档' );
			}
			if ( ! state ) this.editor.signals.sceneEnvironmentChanged.dispatch( 'Default' );
			const selected = this.editor.config.getKey( 'selected' );
			if ( selected ) this.editor.selectByUuid( selected );
			if ( this.state === '正在恢复…' ) this.notify( state ? '已恢复上次场景' : '尚无修改' );
		} catch ( error ) { this.recoveryError = error; this.notify( '恢复失败，请打开项目文件', error ); }
		finally { this.loading = false; this.loadingPanel.remove(); }
	}
	async flush( force = false ) {
		await this.ready;
		clearTimeout( this.timer );
		if ( this.loading ) throw new Error( '项目正在打开，请稍候。' );
		if ( this.pending ) { await this.pending; return this.flush( force ); }
		if ( this.editor.placement.object ) throw new Error( '请先放下或取消手中的物品。' );
		if ( ! force && this.savedRevision === this.revision && ! this.error ) return;
		if ( this.recoveryError ) throw this.recoveryError;
		this.pending = ( async () => {
			try {
				do {
					const revision = this.revision;
					this.notify( '正在保存…' ); this.editor.signals.savingStarted.dispatch();
					await this.editor.storage.set( this.editor.toJSON() );
					this.savedRevision = revision;
				} while ( this.savedRevision !== this.revision && ! this.editor.placement.object );
				this.notify( this.savedRevision === this.revision ? '已自动保存' : '有未保存的修改' );
				this.editor.signals.savingFinished.dispatch();
			} catch ( error ) { this.notify( '保存失败 · 点击重试', error ); throw error; }
		} )();
		try { await this.pending; } finally { this.pending = null; }
	}
	async prepareToClose() {
		await this.ready;
		if ( this.editor.loader.busy ) throw new Error( '请等待导入完成，或先取消导入。' );
		this.editor.placement.cancel();
		this.editor.controls.stop();
		try { await this.flush( true ); }
		catch ( error ) { if ( this.fileRevision !== this.revision ) throw error; }
		return true;
	}
	async load( json ) {
		await this.ready;
		this.editor.placement.cancel();
		if ( this.editor.loader.busy ) throw new Error( '请先完成或取消模型导入。' );
		if ( ! this.recoveryError ) await this.flush();
		this.loading = true; this.loadingPanel.textContent = '正在打开项目…'; document.body.append( this.loadingPanel );
		try { await this.editor.fromJSON( json ); this.recoveryError = null; }
		finally { this.loading = false; this.loadingPanel.remove(); }
		this.revision ++; this.notify( '项目已打开' );
		await this.flush( true );
	}
	markFileSaved() {
		this.fileRevision = this.exportRevision;
		this.notify( this.revision === this.fileRevision ? '项目文件已保存' : '文件已保存，仍有新修改' );
	}
	async snapshot() {
		await this.ready;
		if ( this.editor.loader.busy || this.loading ) throw new Error( '请先完成当前导入。' );
		this.editor.placement.cancel();
		this.exportRevision = this.revision;
		return JSON.stringify( this.editor.toJSON() );
	}
}
export { ProjectSession };
