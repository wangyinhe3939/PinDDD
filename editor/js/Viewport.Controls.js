import { createIcon } from './Icons.js';
import * as THREE from 'three';
import { UIPanel, UISelect, UIElement } from './libs/ui.js';

function ViewportControls( editor ) {

	const signals = editor.signals;

	const container = new UIPanel().setId( 'viewport-controls' );
	container.setPosition( 'absolute' );
	container.setRight( '10px' );
	container.setTop( '10px' );

	// Presets share the same damped editor camera, including while holding a model.
	const presets = document.createElement( 'div' );
	presets.id = 'camera-presets'; presets.setAttribute( 'data-placement-action', '' );
	presets.setAttribute( 'role', 'group' ); presets.setAttribute( 'aria-label', '快速机位' );
	for ( const [ label, direction, icon ] of [ [ '45°鸟瞰', [ 10, 12, 10 ], 'box' ], [ '纯顶视', [ 0, 1, 0 ], 'arrow-down-to-line' ], [ '正视', [ 0, 0, 1 ], 'arrow-right-to-line' ], [ '侧视', [ 1, 0, 0 ], 'arrow-left-to-line' ] ] ) {
		const button = document.createElement( 'button' ); button.type = 'button'; button.append( createIcon( icon ), document.createTextNode( label ) );
		button.addEventListener( 'click', () => {
			if ( editor.viewportCamera !== editor.camera ) editor.setViewportCamera( editor.camera.uuid );
			editor.controls.orient( new THREE.Vector3( ...direction ) );
		} );
		presets.append( button );
	}
	container.add( new UIElement( presets ) );

	// Always visible: movement mode must not be hidden in a selected object's inspector.
	const movement = new UISelect().setId( 'viewport-movement' );
	movement.setOptions( { screen: '自由移动 · 可离地', surface: '吸附摆放 · 贴表面' } );
	movement.dom.setAttribute( 'aria-label', '画布移动方式' );
	movement.dom.setAttribute( 'data-placement-action', 'mode' );
	movement.dom.title = '自由移动：随鼠标在画面上下左右移动，不改变镜头深度、不吸附；吸附摆放：贴地或堆到物体表面';
	movement.setValue( editor.config.getKey( 'canvas/movementMode' ) === 'surface' ? 'surface' : 'screen' );
	movement.onChange( () => editor.placement.setMovementMode( movement.getValue() ) );
	signals.placementChanged.add( () => {
		if ( movement.getValue() !== editor.placement.movementMode ) movement.setValue( editor.placement.movementMode );
	} );
	container.add( movement );

	// camera

	const cameraSelect = new UISelect();
	cameraSelect.setMarginRight( '0px' );
	cameraSelect.onChange( function () {

		editor.setViewportCamera( this.getValue() );

	} );
	container.add( cameraSelect );
	signals.viewportCameraChanged.add( () => cameraSelect.setValue( editor.viewportCamera.uuid ) );

	signals.cameraAdded.add( update );
	signals.cameraRemoved.add( update );
	signals.objectChanged.add( function ( object ) {

		if ( object.isCamera ) {

			updateCameraList();

		}

	} );

	// shading

	const shadingSelect = new UISelect();
	shadingSelect.setOptions( { 'realistic': 'realistic', 'solid': 'solid', 'normals': 'normals', 'wireframe': 'wireframe' } );
	shadingSelect.setValue( 'solid' );
	shadingSelect.onChange( function () {

		editor.setViewportShading( this.getValue() );

	} );
	container.add( shadingSelect );

	// Compact, on-demand help beside the camera controls.
	const help = document.createElement( 'details' );
	help.id = 'viewport-shortcuts'; help.setAttribute( 'data-placement-action', '' );
	const trigger = document.createElement( 'summary' );
	trigger.title = '快捷键提示'; trigger.setAttribute( 'aria-label', '快捷键提示' );
	trigger.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h1m3 0h1m3 0h1M7 12h1m3 0h1m3 0h1M8 15h8"/></svg>';
	trigger.append( document.createTextNode( '快捷键' ) );
	const card = document.createElement( 'div' );
	card.className = 'shortcut-popover'; card.setAttribute( 'role', 'region' ); card.setAttribute( 'aria-label', '画布快捷键' );
	help.append( trigger, card ); container.add( new UIElement( help ) );
	help.addEventListener( 'toggle', () => {
		if ( ! help.open ) return;
		card.replaceChildren();
		const focus = editor.config.getKey( 'settings/shortcuts/focus' ).toUpperCase();
		const undo = editor.config.getKey( 'settings/shortcuts/undo' ).toUpperCase();
		const modifier = navigator.platform.toUpperCase().includes( 'MAC' ) ? '⌘' : 'Ctrl';
		for ( const [ title, rows ] of [
			[ '镜头移动', [ [ '旋转视角', '右键拖动' ], [ '平移画布', '空格 + 左键拖动' ], [ '缩放视角', '滚轮（未抓取）' ], [ '聚焦物件', focus + ' / 列表双击' ] ] ],
			[ '物件摆放', [ [ '抓起 / 放下', '左键单击' ], [ '自由移动 / 吸附摆放', '画布顶部 → 移动方式' ], [ '按设定角度旋转', 'R（抓取中）' ], [ '连续旋转 / 精细旋转', '滚轮 / Shift + 滚轮' ], [ '等比缩放 10%', '[ 缩小 · ] 放大' ], [ '复制并抓起', 'Option / Alt + 点击' ], [ '取消抓取', '右键单击 / Esc' ], [ '删除物件', 'Delete / Backspace' ], [ '物件菜单', '右键单击（未抓取）' ] ] ],
			[ '编辑', [ [ '撤销 / 重做', modifier + ' ' + undo + ' / Shift + ' + modifier + ' ' + undo ] ] ]
		] ) {
			const heading = document.createElement( 'h3' ); heading.textContent = title; card.append( heading );
			const list = document.createElement( 'dl' );
			for ( const [ label, key ] of rows ) {
				const row = document.createElement( 'div' ), name = document.createElement( 'dt' ), value = document.createElement( 'dd' );
				name.textContent = label; value.textContent = key; row.append( name, value ); list.append( row );
			}
			card.append( list );
		}
	} );
	document.addEventListener( 'pointerdown', event => { if ( ! help.contains( event.target ) ) help.open = false; }, true );
	document.addEventListener( 'keydown', event => {
		if ( help.open && event.key === 'Escape' ) { event.preventDefault(); event.stopImmediatePropagation(); help.open = false; trigger.focus( { preventScroll: true } ); }
	}, true );

	signals.editorCleared.add( function () {

		editor.setViewportCamera( editor.camera.uuid );

		shadingSelect.setValue( 'solid' );
		editor.setViewportShading( shadingSelect.getValue() );

	} );

	signals.cameraResetted.add( update );

	update();

	//

	function updateCameraList() {

		const options = {};

		const cameras = editor.cameras;

		for ( const key in cameras ) {

			const camera = cameras[ key ];
			options[ camera.uuid ] = camera.name;

		}

		cameraSelect.setOptions( options );

		const selectedCamera = ( editor.viewportCamera.uuid in options )
			? editor.viewportCamera
			: editor.camera;

		cameraSelect.setValue( selectedCamera.uuid );

		return selectedCamera;

	}

	function update() {

		const selectedCamera = updateCameraList();
		editor.setViewportCamera( selectedCamera.uuid );

	}

	return container;

}

export { ViewportControls };
