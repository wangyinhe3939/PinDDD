// Native builds use atomic files; the browser keeps the existing IndexedDB store.
function Storage() {
	let database, opening, recoveredPrevious = false;
	const native = () => window.webkit?.messageHandlers?.pinDDDStore;
	function open() {
		return opening ||= new Promise( ( resolve, reject ) => {
			if ( ! window.indexedDB ) { reject( new Error( '此环境无法使用本地保存，请导出项目文件。' ) ); return; }
			const request = indexedDB.open( 'pinddd-creator-editor', 1 );
			request.onupgradeneeded = () => { if ( ! request.result.objectStoreNames.contains( 'states' ) ) request.result.createObjectStore( 'states' ); };
			request.onsuccess = () => { database = request.result; resolve(); };
			request.onerror = () => reject( request.error );
			request.onblocked = () => reject( new Error( '本地保存被其他窗口占用，请关闭其他编辑器窗口。' ) );
		} );
	}
	async function transact( mode, action ) {
		await open();
		return new Promise( ( resolve, reject ) => {
			const transaction = database.transaction( [ 'states' ], mode );
			const request = action( transaction.objectStore( 'states' ) );
			transaction.oncomplete = () => resolve( request?.result );
			transaction.onabort = transaction.onerror = () => reject( transaction.error || new Error( '本地写入未完成。' ) );
		} );
	}
	return {
		async init( callback ) { if ( ! native() ) await open(); callback?.(); },
		async get( callback, previous = false ) {
			let state;
			if ( previous ) recoveredPrevious = true;
			if ( native() ) {
				const text = await native().postMessage( { operation: 'read', previous } );
				if ( text ) state = JSON.parse( text );
				else if ( ! previous ) state = await transact( 'readonly', store => store.get( 0 ) ); // Migrate existing app sessions.
			} else state = await transact( 'readonly', store => store.get( previous ? 1 : 0 ) );
			await callback?.( state ); return state;
		},
		async set( data ) {
			if ( native() ) return native().postMessage( { operation: 'write', text: JSON.stringify( data ) } );
			await transact( 'readwrite', store => {
				const previous = store.get( 0 );
				previous.onsuccess = () => { if ( ! recoveredPrevious && previous.result !== undefined ) store.put( previous.result, 1 ); store.put( data, 0 ); };
			} );
			recoveredPrevious = false;
		},
		async clear() { return transact( 'readwrite', store => store.clear() ); }
	};
}
export { Storage };
