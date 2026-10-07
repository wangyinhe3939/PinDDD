import { blenderLayout } from './BlenderLayout.js';
import { UIPanel, UIRow, UIHorizontalRule } from './libs/ui.js';
import { FileLoader, PropertyBinding } from 'three';

function MenubarFile( editor ) {

	const strings = editor.strings;

	const saveArrayBuffer = editor.utils.saveArrayBuffer;
	const saveString = editor.utils.saveString;

	const container = new UIPanel();
	container.setClass( 'menu' );

	const title = new UIPanel();
	title.setClass( 'title' );
	title.setTextContent( strings.getKey( 'menubar/file' ) );
	container.add( title );

	const options = new UIPanel();
	options.setClass( 'options' );
	container.add( options );

	const sceneExport = new UIRow().setTextContent( '导出场景 JSON' ).setClass( 'option' );
	sceneExport.onClick( () => saveString( JSON.stringify( editor.scene.toJSON(), null, 2 ), 'scene.json' ) );
	options.add( sceneExport );

	const blenderExport = new UIRow().setTextContent( '导出 Blender 坐标 JSON' ).setClass( 'option' );
	blenderExport.dom.setAttribute( 'role', 'menuitem' );
	blenderExport.dom.tabIndex = 0;
	function exportBlender() {
		try { saveString( JSON.stringify( blenderLayout( editor.scene ), null, 2 ), 'layout.json' ); }
		catch ( error ) { alert( error.message ); }
	}
	blenderExport.onClick( exportBlender );
	blenderExport.dom.addEventListener( 'keydown', event => {
		if ( event.key === 'Enter' || event.key === ' ' ) { event.preventDefault(); exportBlender(); }
	} );
	options.add( blenderExport );
	options.add( new UIHorizontalRule() );

	// New Project

	const newProjectSubmenuTitle = new UIRow().setTextContent( strings.getKey( 'menubar/file/new' ) ).addClass( 'option' ).addClass( 'submenu-title' );
	newProjectSubmenuTitle.onMouseOver( function () {

		const { top, right } = this.dom.getBoundingClientRect();
		const { paddingTop } = getComputedStyle( this.dom );
		newProjectSubmenu.setLeft( right + 'px' );
		newProjectSubmenu.setTop( top - parseFloat( paddingTop ) + 'px' );
		newProjectSubmenu.setDisplay( 'block' );

	} );
	newProjectSubmenuTitle.onMouseOut( function () {

		newProjectSubmenu.setDisplay( 'none' );

	} );
	options.add( newProjectSubmenuTitle );

	const newProjectSubmenu = new UIPanel().setPosition( 'fixed' ).addClass( 'options' ).setDisplay( 'none' );
	newProjectSubmenuTitle.add( newProjectSubmenu );

	// New Project / Empty

	let option = new UIRow().setTextContent( strings.getKey( 'menubar/file/new/empty' ) ).setClass( 'option' );
	option.onClick( async function () {

		if ( confirm( strings.getKey( 'prompt/file/open' ) ) ) {

			try { await editor.session.prepareToClose(); editor.clear(); }
			catch ( error ) { alert( '新建前保存失败：' + error.message ); }

		}

	} );
	newProjectSubmenu.add( option );

	//

	newProjectSubmenu.add( new UIHorizontalRule() );

	// New Project / ...

	const examples = [
		{ title: 'menubar/file/new/Arkanoid', file: 'arkanoid.app.json' },
		{ title: 'menubar/file/new/Camera', file: 'camera.app.json' },
		{ title: 'menubar/file/new/Particles', file: 'particles.app.json' },
		{ title: 'menubar/file/new/Pong', file: 'pong.app.json' },
		{ title: 'menubar/file/new/Shaders', file: 'shaders.app.json' }
	];

	const loader = new FileLoader();

	for ( let i = 0; i < examples.length; i ++ ) {

		( function ( i ) {

			const example = examples[ i ];

			const option = new UIRow();
			option.setClass( 'option' );
			option.setTextContent( strings.getKey( example.title ) );
			option.onClick( function () {

				if ( confirm( strings.getKey( 'prompt/file/open' ) ) ) {

					loader.load( 'examples/' + example.file, async function ( text ) {

						try { await editor.session.load( JSON.parse( text ) ); } catch ( error ) { alert( error.message ); }

					} );

				}

			} );
			newProjectSubmenu.add( option );

		} )( i );

	}

	// Open

	const openProjectForm = document.createElement( 'form' );
	openProjectForm.style.display = 'none';
	document.body.appendChild( openProjectForm );

	const openProjectInput = document.createElement( 'input' );
	openProjectInput.multiple = false;
	openProjectInput.type = 'file';
	openProjectInput.accept = '.pinddd,.json';
	openProjectInput.addEventListener( 'change', async function () {

		const file = openProjectInput.files[ 0 ];

		if ( file === undefined ) return;

		try { await editor.session.load( JSON.parse( await file.text() ) ); }
		catch ( error ) { alert( '打开项目失败：' + error.message ); }
		finally { openProjectForm.reset(); }

	} );

	openProjectForm.appendChild( openProjectInput );

	option = new UIRow()
		.addClass( 'option' )
		.setTextContent( strings.getKey( 'menubar/file/open' ) )
		.onClick( function () {

			if ( window.webkit?.messageHandlers?.pinDDD ) window.webkit.messageHandlers.pinDDD.postMessage( { type: 'openProject' } );
			else if ( confirm( strings.getKey( 'prompt/file/open' ) ) ) openProjectInput.click();

		} );

	options.add( option );

	// Save

	option = new UIRow()
		.addClass( 'option' )
		.setTextContent( strings.getKey( 'menubar/file/save' ) )
		.onClick( async function () {
			if ( window.webkit?.messageHandlers?.pinDDD ) { window.webkit.messageHandlers.pinDDD.postMessage( { type: 'saveProject' } ); return; }
			try { await editor.utils.save( new Blob( [ await editor.session.snapshot() ], { type: 'application/json' } ), 'project.pinddd' ); }
			catch ( error ) { alert( '保存项目失败：' + error.message ); }
		} );

	options.add( option );

	//

	options.add( new UIHorizontalRule() );

	if ( window.webkit?.messageHandlers?.pinDDD ) {
		for ( const [ label, type ] of [ [ '项目另存为…', 'saveProjectAs' ], [ '最近打开的项目', 'recentProjects' ] ] ) {
			options.add( new UIRow().setClass( 'option' ).setTextContent( label ).onClick( () => window.webkit.messageHandlers.pinDDD.postMessage( { type } ) ) );
		}
	}

	// Import

	const form = document.createElement( 'form' );
	form.style.display = 'none';
	document.body.appendChild( form );

	const fileInput = document.createElement( 'input' );
	fileInput.multiple = true;
	fileInput.type = 'file';
	fileInput.addEventListener( 'change', function () {

		editor.loader.loadFiles( fileInput.files );
		form.reset();

	} );
	form.appendChild( fileInput );
	editor.importModels = () => {
		const native = window.webkit?.messageHandlers?.pinDDD;
		if ( native ) native.postMessage( { type: 'import' } );
		else fileInput.click();
	};

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( strings.getKey( 'menubar/file/import' ) );
	option.onClick( function () {

		editor.importModels();

	} );
	options.add( option );

	// Export

	const fileExportSubmenuTitle = new UIRow().setTextContent( strings.getKey( 'menubar/file/export' ) ).addClass( 'option' ).addClass( 'submenu-title' );
	fileExportSubmenuTitle.onMouseOver( function () {

		const { top, right } = this.dom.getBoundingClientRect();
		const { paddingTop } = getComputedStyle( this.dom );
		fileExportSubmenu.setLeft( right + 'px' );
		fileExportSubmenu.setTop( top - parseFloat( paddingTop ) + 'px' );
		fileExportSubmenu.setDisplay( 'block' );

	} );
	fileExportSubmenuTitle.onMouseOut( function () {

		fileExportSubmenu.setDisplay( 'none' );

	} );
	options.add( fileExportSubmenuTitle );

	const fileExportSubmenu = new UIPanel().setPosition( 'fixed' ).addClass( 'options' ).setDisplay( 'none' );
	fileExportSubmenuTitle.add( fileExportSubmenu );

	// Export DRC

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( 'DRC' );
	option.onClick( async function () {

		const object = editor.selected;

		if ( object === null || object.isMesh === undefined ) {

			alert( strings.getKey( 'prompt/file/export/noMeshSelected' ) );
			return;

		}

		const { DRACOExporter } = await import( 'three/addons/exporters/DRACOExporter.js' );

		const exporter = new DRACOExporter();

		const options = {
			decodeSpeed: 5,
			encodeSpeed: 5,
			encoderMethod: DRACOExporter.MESH_EDGEBREAKER_ENCODING,
			quantization: [ 16, 8, 8, 8, 8 ],
			exportUvs: true,
			exportNormals: true,
			exportColor: object.geometry.hasAttribute( 'color' )
		};

		const result = await exporter.parseAsync( object, options );
		saveArrayBuffer( result, 'model.drc' );

	} );
	fileExportSubmenu.add( option );

	// Export GLB

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( 'GLB' );
	option.onClick( async function () {

		const scene = editor.scene;

		if ( needsUniqueNames( scene ) ) { // see #25179

			if ( confirm( strings.getKey( 'prompt/file/export/duplicateNames' ) ) === false ) return;

			ensureUniqueNames( scene );

		}

		const animations = getAnimations( scene );

		const optimizedAnimations = [];

		for ( const animation of animations ) {

			optimizedAnimations.push( animation.clone().optimize() );

		}

		const { GLTFExporter } = await import( 'three/addons/exporters/GLTFExporter.js' );

		const exporter = new GLTFExporter();

		exporter.parse( scene, function ( result ) {

			saveArrayBuffer( result, 'scene.glb' );

		}, undefined, { binary: true, animations: optimizedAnimations } );

	} );
	fileExportSubmenu.add( option );

	// Export GLTF

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( 'GLTF' );
	option.onClick( async function () {

		const scene = editor.scene;

		if ( needsUniqueNames( scene ) ) { // see #25179

			if ( confirm( strings.getKey( 'prompt/file/export/duplicateNames' ) ) === false ) return;

			ensureUniqueNames( scene );

		}

		const animations = getAnimations( scene );

		const optimizedAnimations = [];

		for ( const animation of animations ) {

			optimizedAnimations.push( animation.clone().optimize() );

		}

		const { GLTFExporter } = await import( 'three/addons/exporters/GLTFExporter.js' );

		const exporter = new GLTFExporter();

		exporter.parse( scene, function ( result ) {

			saveString( JSON.stringify( result, null, 2 ), 'scene.gltf' );

		}, undefined, { animations: optimizedAnimations } );


	} );
	fileExportSubmenu.add( option );

	// Export OBJ

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( 'OBJ' );
	option.onClick( async function () {

		const object = editor.selected;

		if ( object === null ) {

			alert( strings.getKey( 'prompt/file/export/noObjectSelected' ) );
			return;

		}

		const { OBJExporter } = await import( 'three/addons/exporters/OBJExporter.js' );

		const exporter = new OBJExporter();

		saveString( exporter.parse( object ), 'model.obj' );

	} );
	fileExportSubmenu.add( option );

	// Export PLY (ASCII)

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( 'PLY' );
	option.onClick( async function () {

		const { PLYExporter } = await import( 'three/addons/exporters/PLYExporter.js' );

		const exporter = new PLYExporter();

		exporter.parse( editor.scene, function ( result ) {

			saveArrayBuffer( result, 'model.ply' );

		} );

	} );
	fileExportSubmenu.add( option );

	// Export PLY (BINARY)

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( 'PLY（二进制）' );
	option.onClick( async function () {

		const { PLYExporter } = await import( 'three/addons/exporters/PLYExporter.js' );

		const exporter = new PLYExporter();

		exporter.parse( editor.scene, function ( result ) {

			saveArrayBuffer( result, 'model-binary.ply' );

		}, { binary: true } );

	} );
	fileExportSubmenu.add( option );

	// Export STL (ASCII)

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( 'STL' );
	option.onClick( async function () {

		const { STLExporter } = await import( 'three/addons/exporters/STLExporter.js' );

		const exporter = new STLExporter();

		saveString( exporter.parse( editor.scene ), 'model.stl' );

	} );
	fileExportSubmenu.add( option );

	// Export STL (BINARY)

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( 'STL（二进制）' );
	option.onClick( async function () {

		const { STLExporter } = await import( 'three/addons/exporters/STLExporter.js' );

		const exporter = new STLExporter();

		saveArrayBuffer( exporter.parse( editor.scene, { binary: true } ), 'model-binary.stl' );

	} );
	fileExportSubmenu.add( option );

	// Export USDZ

	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( 'USDZ' );
	option.onClick( async function () {

		const { USDZExporter } = await import( 'three/addons/exporters/USDZExporter.js' );

		const exporter = new USDZExporter();

		saveArrayBuffer( await exporter.parseAsync( editor.scene ), 'model.usdz' );

	} );
	fileExportSubmenu.add( option );

	//

	function getAnimations( scene ) {

		const animations = [];

		scene.traverse( function ( object ) {

			animations.push( ... object.animations );

		} );

		return animations;

	}

	function needsUniqueNames( scene ) {

		const usedNames = new Set();
		let duplicate = false;
		let animated = false;

		scene.traverse( function ( object ) {

			if ( object.animations.length > 0 ) animated = true;

			if ( object.name === '' ) return;

			if ( usedNames.has( object.name ) ) duplicate = true;

			usedNames.add( object.name );

		} );

		return duplicate && animated;

	}

	// Gives every object a unique name and keeps the animation tracks that
	// reference them by name in sync. The renamed scene mirrors the result of a
	// glTF round-trip, where the loader makes all names unique, too.

	function ensureUniqueNames( scene ) {

		// Resolve each track's target object up front, scoped to the object that
		// owns the clip. This disambiguates colliding names before they change.

		const trackBindings = [];

		scene.traverse( function ( owner ) {

			for ( const clip of owner.animations ) {

				for ( const track of clip.tracks ) {

					const nodeName = PropertyBinding.parseTrackName( track.name ).nodeName;
					const target = PropertyBinding.findNode( owner, nodeName );

					// References by UUID stay valid, so only track name-based ones.

					if ( target !== null && target.name === nodeName ) {

						trackBindings.push( { track, target, nodeName } );

					}

				}

			}

		} );

		// Assign a unique name to every named object.

		let changed = false;
		const usedNames = new Set();

		scene.traverse( function ( object ) {

			if ( object.name === '' ) return;

			if ( usedNames.has( object.name ) ) {

				let suffix = 1, name;
				do {

					name = object.name + '_' + ( suffix ++ );

				} while ( usedNames.has( name ) );

				object.name = name;
				changed = true;

			}

			usedNames.add( object.name );

		} );

		if ( changed === false ) return;

		// Point the affected tracks at their renamed targets.

		for ( const { track, target, nodeName } of trackBindings ) {

			if ( target.name !== nodeName ) {

				track.name = target.name + track.name.slice( nodeName.length );

			}

		}

		editor.signals.sceneGraphChanged.dispatch();

	}

	return container;

}

export { MenubarFile };
