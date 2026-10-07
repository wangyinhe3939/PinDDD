import * as THREE from 'three';
import { PMREMGenerator } from 'three/webgpu';

import { ScenePlacement } from './ScenePlacement.js';

import { UIPanel } from './libs/ui.js';

import { EditorControls } from './EditorControls.js';

import { ViewportControls } from './Viewport.Controls.js';
import { ViewportInfo } from './Viewport.Info.js';

import { ViewHelper } from './Viewport.ViewHelper.js';
import { XR } from './Viewport.XR.js';

import { ColorEnvironment } from 'three/addons/environments/ColorEnvironment.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ViewportPathtracer } from './Viewport.Pathtracer.js';

function Viewport( editor ) {

	const selector = editor.selector;
	const signals = editor.signals;

	const container = new UIPanel();
	container.setId( 'viewport' );
	container.setPosition( 'absolute' );

	container.add( new ViewportControls( editor ) );
	container.add( new ViewportInfo( editor ) );

	//

	let renderer = null;
	let pmremGenerator = null;
	let pathtracer = null;

	let camera = editor.camera;
	const scene = editor.scene;
	const sceneHelpers = editor.sceneHelpers;

	// helpers

	const GRID_COLORS_LIGHT = [ 0x292c30, 0x3b3e43 ];
	const GRID_COLORS_DARK = GRID_COLORS_LIGHT;

	const grid = new THREE.Group();

	const grid1 = new THREE.GridHelper( editor.config.getKey( 'canvas/gridSize' ), Math.round( editor.config.getKey( 'canvas/gridSize' ) * 10 ) );
	grid1.material.color.setHex( GRID_COLORS_LIGHT[ 0 ] );
	grid1.material.vertexColors = false;
	grid.add( grid1 );

	const grid2 = new THREE.GridHelper( editor.config.getKey( 'canvas/gridSize' ), Math.round( editor.config.getKey( 'canvas/gridSize' ) ) );
	grid2.material.color.setHex( GRID_COLORS_LIGHT[ 1 ] );
	grid2.material.vertexColors = false;
	grid.add( grid2 );

	signals.gridSizeChanged.add( function ( size ) {
		for ( const [ helper, divisions ] of [ [ grid1, Math.round( size * 10 ) ], [ grid2, Math.round( size ) ] ] ) {
			const replacement = new THREE.GridHelper( size, divisions );
			helper.geometry.dispose(); helper.geometry = replacement.geometry;
			replacement.material.dispose();
		}
		render();
	} );

	const viewHelper = new ViewHelper( editor, container );

	//

	const box = new THREE.Box3();

	const selectionBox = new THREE.Box3Helper( box, 0xc4b5fd );
	selectionBox.material.depthTest = false;
	selectionBox.material.depthWrite = false;
	selectionBox.renderOrder = 1000;
	selectionBox.material.transparent = true;
	selectionBox.visible = false;
	sceneHelpers.add( selectionBox );

	const lockedBoxes = new Map();
	function updateLockedBoxes() {
		for ( const [ object, helper ] of lockedBoxes ) {
			if ( object.parent !== scene || ! object.userData.isLocked ) {
				sceneHelpers.remove( helper ); helper.geometry.dispose(); helper.material.dispose(); lockedBoxes.delete( object );
			}
		}
		for ( const object of scene.children ) {
			if ( ! object.userData.isLocked ) continue;
			if ( ! lockedBoxes.has( object ) ) {
				const helper = new THREE.Box3Helper( new THREE.Box3(), 0x71717a );
				helper.name = 'locked-outline'; helper.material.transparent = true; helper.material.opacity = 0.55;
				helper.material.depthTest = false; helper.material.depthWrite = false; helper.renderOrder = 999;
				lockedBoxes.set( object, helper ); sceneHelpers.add( helper );
			}
			const helper = lockedBoxes.get( object ); helper.box.setFromObject( object, true );
			helper.visible = object.visible && ! helper.box.isEmpty();
		}
		selectionBox.material.color.setHex( selector.selection.length && selector.selection.every( object => object.userData.isLocked ) ? 0x71717a : 0xc4b5fd );
	}

	const xr = new XR( editor ); // eslint-disable-line no-unused-vars

	// events

	function updateAspectRatio() {

		for ( const uuid in editor.cameras ) {

			const camera = editor.cameras[ uuid ];

			const aspect = container.dom.offsetWidth / container.dom.offsetHeight;

			if ( camera.isPerspectiveCamera ) {

				camera.aspect = aspect;

			} else {

				const frustumHeight = camera.top - camera.bottom;

				camera.left = - frustumHeight * aspect / 2;
				camera.right = frustumHeight * aspect / 2;

			}

			camera.updateProjectionMatrix();

			const cameraHelper = editor.helpers[ camera.id ];
			if ( cameraHelper ) cameraHelper.update();

		}

	}

	// ScenePlacement dispatches clicks, right-button orbit and Space+left-button pan.

	const controls = new EditorControls( camera );
	controls.addEventListener( 'change', function () {

		signals.cameraChanged.dispatch( camera );
		signals.refreshSidebarObject3D.dispatch( camera );

	} );
	viewHelper.center = controls.center;

	editor.controls = controls;
	const placement = new ScenePlacement( editor, controls );
	editor.placement = placement;

	// signals

	signals.editorCleared.add( function () {

		updateLockedBoxes();

		controls.center.set( 0, 0, 0 );
		if ( pathtracer ) pathtracer.reset();

		initPT();

		signals.sceneEnvironmentChanged.dispatch( editor.environmentType );

	} );

	signals.rendererUpdated.add( function () {

		scene.traverse( function ( child ) {

			if ( child.material !== undefined ) {

				child.material.needsUpdate = true;

			}

		} );

		render();

	} );

	signals.rendererCreated.add( function ( newRenderer ) {

		if ( renderer !== null ) {

			renderer.setAnimationLoop( null );

			try {

				pmremGenerator.dispose();

			} catch ( e ) {

				console.warn( 'PMREMGenerator dispose error:', e );

			}

			renderer.dispose();

			container.dom.removeChild( renderer.domElement );

		}

		placement.connect( newRenderer.domElement );
		controls.connect( newRenderer.domElement );

		renderer = newRenderer;

		renderer.setAnimationLoop( animate );
		renderer.setClearColor( 0x181a1d );
		updateGridColors( grid1, grid2, GRID_COLORS_DARK );

		renderer.getClearColor( editor.viewportColor );

		renderer.setPixelRatio( window.devicePixelRatio );
		renderer.setSize( container.dom.offsetWidth, container.dom.offsetHeight );

		if ( renderer.isWebGLRenderer ) {

			pmremGenerator = new THREE.PMREMGenerator( renderer );
			pmremGenerator.compileEquirectangularShader();

			pathtracer = new ViewportPathtracer( renderer );

		} else {

			pmremGenerator = new PMREMGenerator( renderer );

			pathtracer = null;

		}

		container.dom.appendChild( renderer.domElement );

		signals.sceneEnvironmentChanged.dispatch( editor.environmentType );

		render();

	} );

	signals.rendererDetectKTX2Support.add( function ( ktx2Loader ) {

		ktx2Loader.detectSupport( renderer );

	} );

	signals.sceneGraphChanged.add( function () {

		updateLockedBoxes();

		initPT();
		render();

	} );

	signals.cameraChanged.add( function () {

		if ( pathtracer ) pathtracer.reset();

		// The active animation frame renders after controls.update(); avoid drawing twice.

	} );

	signals.objectSelected.add( function ( object ) {

		updateLockedBoxes();

		selectionBox.visible = false;
		if ( selector.selection.length > 0 && object !== scene && object !== camera ) {

			selector.getSelectionBox( box );
			selectionBox.visible = ! box.isEmpty();

		}
		render();

	} );

	signals.objectFocused.add( function ( object ) {

		if ( editor.viewportCamera !== editor.camera ) editor.setViewportCamera( editor.camera.uuid );
		controls.focus( object === editor.camera ? scene : object );

	} );

	signals.geometryChanged.add( function () {

		updateLockedBoxes();

		if ( selector.selection.length ) { selector.getSelectionBox( box ); selectionBox.visible = ! box.isEmpty(); }
		initPT();
		render();

	} );

	signals.objectChanged.add( function ( object ) {

		updateLockedBoxes();

		if ( selector.selection.length ) { selector.getSelectionBox( box ); selectionBox.visible = ! box.isEmpty(); }

		if ( object.isPerspectiveCamera || object.isOrthographicCamera ) {

			object.updateProjectionMatrix();

		}

		const helper = editor.helpers[ object.id ];

		if ( helper !== undefined && helper.isSkeletonHelper !== true ) {

			helper.update();

		}

		// update light helper when light target is changed

		for ( const id in editor.helpers ) {

			const helper = editor.helpers[ id ];

			if ( helper.light && helper.light.target === object ) {

				helper.update();

			}

		}

		initPT();
		render();

	} );

	signals.materialChanged.add( function () {

		updatePTMaterials();
		render();

	} );

	// background

	signals.sceneBackgroundChanged.add( function ( backgroundType, backgroundColor, backgroundTexture, backgroundEquirectangularTexture, backgroundColorSpace, backgroundBlurriness, backgroundIntensity, backgroundRotation ) {

		editor.backgroundType = backgroundType;

		scene.background = null;

		switch ( backgroundType ) {

			case 'Color':

				scene.background = new THREE.Color( backgroundColor );

				break;

			case 'Texture':

				if ( backgroundTexture ) {

					backgroundTexture.colorSpace = backgroundColorSpace;
					backgroundTexture.needsUpdate = true;

					scene.background = backgroundTexture;

				}

				break;

			case 'Equirectangular':

				if ( backgroundEquirectangularTexture ) {

					backgroundEquirectangularTexture.mapping = THREE.EquirectangularReflectionMapping;
					backgroundEquirectangularTexture.colorSpace = backgroundColorSpace;
					backgroundEquirectangularTexture.needsUpdate = true;

					scene.background = backgroundEquirectangularTexture;
					scene.backgroundBlurriness = backgroundBlurriness;
					scene.backgroundIntensity = backgroundIntensity;
					scene.backgroundRotation.y = backgroundRotation * THREE.MathUtils.DEG2RAD;

				}

				break;

		}

		if ( useBackgroundAsEnvironment ) {

			signals.sceneEnvironmentChanged.dispatch( editor.environmentType );

		}

		updatePTBackground();
		render();

	} );

	// environment

	let useBackgroundAsEnvironment = false;

	signals.sceneEnvironmentChanged.add( function ( environmentType, environmentEquirectangularTexture ) {

		editor.environmentType = environmentType;

		scene.environment = null;

		useBackgroundAsEnvironment = false;

		switch ( environmentType ) {

			case 'Equirectangular':

				if ( environmentEquirectangularTexture ) {

					scene.environment = environmentEquirectangularTexture;
					scene.environment.mapping = THREE.EquirectangularReflectionMapping;

				}

				break;

			case 'Default':

				useBackgroundAsEnvironment = true;

				if ( scene.background !== null ) {

					if ( scene.background.isColor ) {

						scene.environment = pmremGenerator.fromScene( new ColorEnvironment( scene.background ), 0.04 ).texture;

					} else if ( scene.background.isTexture ) {

						scene.environment = scene.background;
						scene.environment.mapping = THREE.EquirectangularReflectionMapping;
						scene.environmentRotation.y = scene.backgroundRotation.y;

					}

				} else {

					scene.environment = pmremGenerator.fromScene( new RoomEnvironment(), 0.04 ).texture;

				}

				break;

		}

		updatePTEnvironment();
		render();

	} );

	// fog

	signals.sceneFogChanged.add( function ( fogType, fogColor, fogNear, fogFar, fogDensity ) {

		switch ( fogType ) {

			case 'None':
				scene.fog = null;
				break;
			case 'Fog':
				scene.fog = new THREE.Fog( fogColor, fogNear, fogFar );
				break;
			case 'FogExp2':
				scene.fog = new THREE.FogExp2( fogColor, fogDensity );
				break;

		}

		render();

	} );

	signals.sceneFogSettingsChanged.add( function ( fogType, fogColor, fogNear, fogFar, fogDensity ) {

		switch ( fogType ) {

			case 'Fog':
				scene.fog.color.setHex( fogColor );
				scene.fog.near = fogNear;
				scene.fog.far = fogFar;
				break;
			case 'FogExp2':
				scene.fog.color.setHex( fogColor );
				scene.fog.density = fogDensity;
				break;

		}

		render();

	} );

	signals.viewportCameraChanged.add( function () {

		const viewportCamera = editor.viewportCamera;

		if ( viewportCamera.isPerspectiveCamera || viewportCamera.isOrthographicCamera ) {

			updateAspectRatio();

		}

		// disable EditorControls when setting a user camera

		placement.cancel();
		controls.enabled = ( viewportCamera === editor.camera );

		initPT();
		render();

	} );

	signals.viewportShadingChanged.add( function () {

		const viewportShading = editor.viewportShading;

		switch ( viewportShading ) {

			case 'realistic':
				if ( pathtracer ) pathtracer.init( scene, editor.viewportCamera );
				break;

			case 'solid':
				scene.overrideMaterial = null;
				break;

			case 'normals':
				scene.overrideMaterial = new THREE.MeshNormalMaterial();
				break;

			case 'wireframe':
				scene.overrideMaterial = new THREE.MeshBasicMaterial( { color: 0x000000, wireframe: true } );
				break;

		}

		render();

	} );

	//

	signals.windowResize.add( function () {

		updateAspectRatio();

		if ( renderer === null ) return;

		renderer.setSize( container.dom.offsetWidth, container.dom.offsetHeight );
		if ( pathtracer ) pathtracer.setSize( container.dom.offsetWidth, container.dom.offsetHeight );

		render();

	} );

	signals.showHelpersChanged.add( function ( appearanceStates ) {

		grid.visible = appearanceStates.gridHelper;

		sceneHelpers.traverse( function ( object ) {

			switch ( object.type ) {

				case 'CameraHelper':

				{

					object.enabled = appearanceStates.cameraHelpers;
					object.visible = appearanceStates.cameraHelpers;
					break;

				}

				case 'PointLightHelper':
				case 'DirectionalLightHelper':
				case 'SpotLightHelper':
				case 'HemisphereLightHelper':

				{

					object.visible = appearanceStates.lightHelpers;
					break;

				}

				case 'SkeletonHelper':

				{

					object.visible = appearanceStates.skeletonHelpers;
					break;

				}

				default:

				{

					// not a helper, skip.

				}

			}

		} );


		render();

	} );

	signals.cameraResetted.add( function () {

		if ( camera !== editor.camera ) {

			camera = editor.camera;

			controls.setCamera( camera );
			viewHelper.camera = camera;

		}

		updateAspectRatio();
		render();

	} );

	// animations

	let prevActionsInUse = 0;

	const timer = new THREE.Timer(); // only used for animations

	function animate() {

		timer.update();

		const mixer = editor.mixer;
		const delta = timer.getDelta();

		controls.update( delta );

		// Animations

		const actions = mixer.stats.actions;

		if ( actions.inUse > 0 || prevActionsInUse > 0 ) {

			prevActionsInUse = actions.inUse;

			mixer.update( delta );

			if ( editor.selected !== null ) {

				editor.selected.updateWorldMatrix( false, true ); // avoid frame late effect for certain skinned meshes (e.g. Michelle.glb)
				selectionBox.box.setFromObject( editor.selected, true ); // selection box should reflect current animation state

			}

			updateLockedBoxes();
			signals.morphTargetsUpdated.dispatch();

		}

		render(); // Keep drawing every animation frame, including while idle.

		updatePT();

	}

	function initPT() {

		if ( pathtracer && editor.viewportShading === 'realistic' ) {

			pathtracer.init( scene, editor.viewportCamera );

		}

	}

	function updatePTBackground() {

		if ( pathtracer && editor.viewportShading === 'realistic' ) {

			pathtracer.setBackground( scene.background, scene.backgroundBlurriness );

		}

	}

	function updatePTEnvironment() {

		if ( pathtracer && editor.viewportShading === 'realistic' ) {

			pathtracer.setEnvironment( scene.environment );

		}

	}

	function updatePTMaterials() {

		if ( pathtracer && editor.viewportShading === 'realistic' ) {

			pathtracer.updateMaterials();

		}

	}

	function updatePT() {

		if ( pathtracer && editor.viewportShading === 'realistic' ) {

			pathtracer.update();
			editor.signals.pathTracerUpdated.dispatch( pathtracer.getSamples() );

		}

	}

	//

	let startTime = 0;
	let endTime = 0;

	function render() {

		if ( renderer === null ) return;

		startTime = performance.now();

		renderer.setViewport( 0, 0, container.dom.offsetWidth, container.dom.offsetHeight );
		renderer.render( scene, editor.viewportCamera );

		if ( camera === editor.viewportCamera ) {

			renderer.autoClear = false;
			if ( grid.visible === true ) renderer.render( grid, camera );
			if ( sceneHelpers.visible === true ) renderer.render( sceneHelpers, camera );
			if ( renderer.xr.isPresenting !== true ) viewHelper.render( renderer );
			renderer.autoClear = true;

		}

		endTime = performance.now();
		editor.signals.sceneRendered.dispatch( endTime - startTime );

	}

	return container;

}

function updateGridColors( grid1, grid2, colors ) {

	grid1.material.color.setHex( colors[ 0 ] );
	grid2.material.color.setHex( colors[ 1 ] );

}

export { Viewport };
