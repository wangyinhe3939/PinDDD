import { createIcon } from './Icons.js';
import * as THREE from 'three';
import { UIPanel } from './libs/ui.js';

class ViewHelper {

	constructor( editor, container ) {

		this.camera = editor.camera;
		const orientation = new THREE.Quaternion();
		const panel = new UIPanel().setId( 'viewHelper' );
		panel.dom.setAttribute( 'data-placement-action', '' );
		panel.dom.setAttribute( 'aria-label', '拖拽环绕视角，点击轴面切换机位' );
		panel.dom.setAttribute( 'role', 'group' );
		panel.dom.tabIndex = 0;
		panel.dom.title = '拖拽环绕视角；方向键旋转';
		container.add( panel );

		// Classic thin axes with small endpoints. SVG avoids a separate WebGL render pass.
		const axes = document.createElementNS( 'http://www.w3.org/2000/svg', 'svg' );
		axes.setAttribute( 'viewBox', '0 0 128 128' ); axes.setAttribute( 'aria-hidden', 'true' );
		panel.dom.append( axes );
		const faces = [ [ 'X', 1, 0, 0, '#ef6461' ], [ 'Y', 0, 1, 0, '#e9c65b' ], [ 'Z', 0, 0, 1, '#7ac785' ] ].flatMap( ( [ axis, x, y, z, color ] ) => {
			const line = document.createElementNS( axes.namespaceURI, 'line' );
			line.setAttribute( 'x1', '64' ); line.setAttribute( 'y1', '64' ); line.setAttribute( 'stroke', color ); axes.append( line );
			return [ 1, -1 ].map( sign => {
				const label = ( sign > 0 ? '+' : '−' ) + axis;
				const button = document.createElement( 'button' );
				button.type = 'button'; button.textContent = sign > 0 ? axis : ''; button.dataset.axis = label;
				button.dataset.sign = sign > 0 ? 'positive' : 'negative';
				button.setAttribute( 'aria-label', label + ' 轴视图' ); button.title = label + ' 轴视图';
				button.style.setProperty( '--axis-color', color );
				const direction = new THREE.Vector3( x, y, z ).multiplyScalar( sign );
				button.addEventListener( 'click', event => {
					if ( dragged && event.detail !== 0 ) return;
					activate(); editor.controls.orient( direction );
				} );
				panel.dom.append( button );
				return { direction, button, line: sign > 0 ? line : null, point: new THREE.Vector3() };
			} );
		} );
		let lastOrientation = null;
		this.render = () => {
			orientation.copy( this.camera.quaternion ).invert();
			if ( lastOrientation?.equals( orientation ) ) return;
			if ( lastOrientation === null ) lastOrientation = new THREE.Quaternion();
			lastOrientation.copy( orientation );
			for ( const face of faces ) {
				face.point.copy( face.direction ).applyQuaternion( orientation );
				face.x = 64 + face.point.x * 36; face.y = 64 - face.point.y * 36;
			}
			// Separate only overlapping hit targets, preserving access to both axial directions.
			for ( let i = 0; i < faces.length; i ++ ) for ( let j = 0; j < i; j ++ ) {
				if ( Math.hypot( faces[ i ].x - faces[ j ].x, faces[ i ].y - faces[ j ].y ) < 20 ) {
					faces[ i ].x += 12; faces[ j ].x -= 12;
				}
			}
			for ( const face of faces ) {
				face.button.style.left = face.x + 'px'; face.button.style.top = face.y + 'px';
				face.button.style.opacity = face.point.z < - 0.01 ? '0.5' : '1';
				face.button.style.zIndex = Math.round( ( face.point.z + 1 ) * 10 ) + 1;
				if ( face.line ) { face.line.setAttribute( 'x2', face.x ); face.line.setAttribute( 'y2', face.y ); }
			}
		};

		const navigation = document.createElement( 'div' ); navigation.id = 'viewport-navigation';
		for ( const [ mode, icon, label ] of [ [ 'pan', 'hand', '视角平移：按住拖拽，或用方向键' ], [ 'zoom', 'search', '视角缩放：上下拖拽，或用上下键' ], [ 'frame', 'focus', '画面居中：选中物件或整个场景' ] ] ) {
			const button = document.createElement( 'button' ); button.type = 'button';
			button.append( createIcon( icon ) ); button.dataset.nav = mode; button.title = label; button.setAttribute( 'aria-label', label );
			if ( mode === 'frame' ) button.addEventListener( 'click', () => {
				activate(); editor.controls.focus( editor.selected?.visible && editor.selected !== editor.camera ? editor.selected : editor.scene );
			} );
			navigation.append( button );
		}
		panel.dom.append( navigation );
		function activate() { if ( editor.viewportCamera !== editor.camera ) editor.setViewportCamera( editor.camera.uuid ); editor.controls.stop(); }
		let gesture = null, dragged = false;
		const delta = new THREE.Vector3();
		panel.dom.addEventListener( 'pointerdown', event => {
			if ( event.button !== 0 || event.isPrimary === false ) return;
			dragged = false;
			const mode = event.target.closest( '[data-nav]' )?.dataset.nav || 'orbit';
			if ( mode === 'frame' ) return;
			event.preventDefault(); activate(); event.target.focus( { preventScroll: true } );
			gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, mode, target: event.target };
			event.target.setPointerCapture( event.pointerId );
		} );
		panel.dom.addEventListener( 'pointermove', event => {
			if ( ! gesture || event.pointerId !== gesture.id ) return;
			if ( Math.hypot( event.clientX - gesture.startX, event.clientY - gesture.startY ) >= 5 ) dragged = true;
			if ( dragged ) {
				const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
				if ( gesture.mode === 'pan' ) editor.controls.pan( delta.set( - dx, dy, 0 ) );
				else if ( gesture.mode === 'zoom' ) editor.controls.zoom( delta.set( 0, 0, dy * 2 ) );
				else editor.controls.rotate( delta.set( - dx, - dy, 0 ) );
			}
			gesture.x = event.clientX; gesture.y = event.clientY;
		} );
		const end = () => { if ( gesture?.target.hasPointerCapture( gesture.id ) ) gesture.target.releasePointerCapture( gesture.id ); gesture = null; };
		panel.dom.addEventListener( 'pointerup', end );
		panel.dom.addEventListener( 'pointercancel', () => { dragged = true; end(); } );
		panel.dom.addEventListener( 'lostpointercapture', end );
		window.addEventListener( 'blur', end );
		panel.dom.addEventListener( 'keydown', event => {
			if ( ! [ 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown' ].includes( event.key ) ) return;
			event.preventDefault(); event.stopPropagation(); activate();
			const x = event.key === 'ArrowLeft' ? 20 : event.key === 'ArrowRight' ? - 20 : 0;
			const y = event.key === 'ArrowUp' ? 20 : event.key === 'ArrowDown' ? - 20 : 0;
			const mode = event.target.dataset.nav;
			if ( mode === 'pan' ) editor.controls.pan( delta.set( x, - y, 0 ) );
			else if ( mode === 'zoom' ) editor.controls.zoom( delta.set( 0, 0, - y * 2 ) );
			else editor.controls.rotate( delta.set( x, y, 0 ) );
		} );

	}

}
export { ViewHelper };
