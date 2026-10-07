import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { AddObjectCommand } from './commands/AddObjectCommand.js';
import { RemoveObjectCommand } from './commands/RemoveObjectCommand.js';
import { SetPositionCommand } from './commands/SetPositionCommand.js';
import { SetRotationCommand } from './commands/SetRotationCommand.js';
import { SetScaleCommand } from './commands/SetScaleCommand.js';
import { MultiCmdsCommand } from './commands/MultiCmdsCommand.js';
import { SetValueCommand } from './commands/SetValueCommand.js';
import { SceneContextMenu } from './SceneContextMenu.js';

const up = new THREE.Vector3( 0, 1, 0 );
const ground = new THREE.Plane( up, 0 );
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const projected = new THREE.Triangle(), barycentric = new THREE.Vector3(), corner = new THREE.Vector3();

// The maximum of an affine triangle lies on a vertex of its clipped footprint.
function triangleHeight( bounds ) {
	let height = 0;
	const vertices = [ a, b, c ];
	for ( let i = 0; i < 3; i ++ ) {
		const v = vertices[ i ], w = vertices[ ( i + 1 ) % 3 ];
		if ( v.x >= bounds.min.x && v.x <= bounds.max.x && v.z >= bounds.min.z && v.z <= bounds.max.z ) height = Math.max( height, v.y );
		for ( const axis of [ 'x', 'z' ] ) {
			const other = axis === 'x' ? 'z' : 'x';
			if ( Math.abs( w[ axis ] - v[ axis ] ) < 1e-12 ) continue;
			for ( const limit of [ bounds.min[ axis ], bounds.max[ axis ] ] ) {
				const t = ( limit - v[ axis ] ) / ( w[ axis ] - v[ axis ] );
				const coordinate = v[ other ] + t * ( w[ other ] - v[ other ] );
				if ( t >= 0 && t <= 1 && coordinate >= bounds.min[ other ] && coordinate <= bounds.max[ other ] ) height = Math.max( height, v.y + t * ( w.y - v.y ) );
			}
		}
	}
	projected.a.set( a.x, 0, a.z ); projected.b.set( b.x, 0, b.z ); projected.c.set( c.x, 0, c.z );
	for ( const x of [ bounds.min.x, bounds.max.x ] ) {
		for ( const z of [ bounds.min.z, bounds.max.z ] ) {
			if ( projected.getBarycoord( corner.set( x, 0, z ), barycentric ) && Math.min( barycentric.x, barycentric.y, barycentric.z ) >= - 1e-9 ) {
				height = Math.max( height, a.y * barycentric.x + b.y * barycentric.y + c.y * barycentric.z );
			}
		}
	}
	return height;
}

class ScenePlacement {
	constructor( editor, controls ) {
		this.editor = editor;
		this.controls = controls;
		this.object = null;
		this.domElement = null;
		this.translationSnap = editor.config.getKey( 'canvas/snapEnabled' ) ? editor.config.getKey( 'canvas/snap' ) : null;
		this.pointer = new THREE.Vector2();
		this.raycaster = new THREE.Raycaster();
		this.box = new THREE.Box3();
		this.colliderBox = new THREE.Box3();
		this.normalMatrix = new THREE.Matrix3();
		this.matrix = new THREE.Matrix4();
		this.instanceMatrix = new THREE.Matrix4();
		this.point = new THREE.Vector3();
		this.center = new THREE.Vector3();
		this.position = new THREE.Vector3();
		this.offset = new THREE.Vector3();
		this.materials = [];
		this.colliders = [];
		this.valid = false;
		this.moved = false;
		this.rotationStep = 15;
		this.movementMode = editor.config.getKey( 'canvas/movementMode' ) === 'surface' ? 'surface' : 'screen';
		this.screenPlane = new THREE.Plane();
		this.screenOffset = new THREE.Vector3();
		this.screenCamera = new THREE.Matrix4();
		this.screenProjection = new THREE.Matrix4();
		this.screenReady = false;

		this.gesture = null; this.spacePressed = false;
		this.touches = new Map(); this.touchGesture = null; this.longPress = null;
		this.contextMenu = new SceneContextMenu( editor, this );
		this.onDown = event => {
			if ( event.pointerType === 'touch' ) { this.touchDown( event ); return; }
			if ( event.isPrimary === false || this.gesture || ! [ 0, 1, 2 ].includes( event.button ) ) return;
			event.preventDefault(); event.stopImmediatePropagation(); this.contextMenu.hide();
			this.domElement.focus( { preventScroll: true } );
			const mode = event.button === 2 ? 'orbit' : event.button === 1 || this.spacePressed ? 'pan' : 'click';
			this.gesture = { id: event.pointerId, button: event.button, mode, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false, holding: this.object !== null, duplicate: event.altKey };
			this.controls.stop(); this.domElement.setPointerCapture( event.pointerId );
		};
		this.onUp = event => {
			if ( event.pointerType === 'touch' ) { this.touchUp( event ); return; }
			const gesture = this.gesture;
			if ( ! gesture || gesture.id !== event.pointerId || gesture.button !== event.button ) return;
			event.preventDefault(); event.stopImmediatePropagation(); this.endGesture();
			if ( gesture.moved || ! this.setPointer( event ) ) return;
			if ( gesture.button === 2 ) {
				if ( this.object ) this.cancel();
				else { const object = this.pick(); if ( object ) this.contextMenu.show( object, event.clientX, event.clientY ); }
			} else if ( gesture.mode === 'click' ) {
				if ( gesture.holding ) { this.move(); if ( this.valid ) this.finish(); }
				else { const object = this.pick(); if ( object ) this.grab( object, gesture.duplicate, true ); else editor.deselect(); }
			}
		};
		this.onMove = event => {
			if ( event.pointerType === 'touch' ) { this.touchMove( event ); return; }
			const gesture = this.gesture;
			if ( gesture ) {
				if ( gesture.id !== event.pointerId ) return;
				if ( Math.hypot( event.clientX - gesture.x, event.clientY - gesture.y ) >= 6 ) gesture.moved = true;
				if ( gesture.mode !== 'click' ) {
					if ( gesture.moved && this.controls.enabled ) {
						const delta = this.offset.set( gesture.lastX - event.clientX, gesture.lastY - event.clientY, 0 );
						if ( gesture.mode === 'orbit' ) this.controls.rotate( delta );
						else { delta.y *= - 1; this.controls.pan( delta ); }
						gesture.lastX = event.clientX; gesture.lastY = event.clientY;
					}
					return; // Navigation never picks or moves a held model.
				}
			}
			if ( this.object && ! this.spacePressed && this.setPointer( event ) ) this.move();
		};
		this.onWheel = event => {
			if ( ! this.object ) return;
			event.preventDefault(); event.stopImmediatePropagation();
			const pixels = event.deltaY * ( event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.domElement.clientHeight : 1 );
			// Continuous yaw, with Shift for fine adjustment; no angular snapping.
			this.rotate( 1, THREE.MathUtils.clamp( pixels, - 100, 100 ) * ( event.shiftKey ? 0.02 : 0.2 ) );
		};
		this.onKey = event => {
			if ( this.contextMenu.object || event.target.closest?.( 'input,textarea,select,[contenteditable="true"],.CodeMirror' ) || event.ctrlKey || event.metaKey || event.altKey ) return;
			const key = event.key.toLowerCase();
			if ( ( key === ' ' || key === 'enter' ) && event.target.closest?.( 'button,a[href],summary,[role=button],[role=menuitem]' ) ) return;
			let handled = false;
			if ( key === ' ' ) { this.spacePressed = true; this.changed(); handled = true; }
			else if ( this.object && key === 'r' ) { if ( ! event.repeat ) this.rotate( 1 ); handled = true; }
			else if ( key === '[' || key === ']' ) handled = this.scale( key === '[' ? 0.9 : 1.1 );
			else if ( this.object && ( key === 'delete' || key === 'backspace' ) ) { this.remove(); handled = true; }
			else if ( key === 'escape' && ( this.object || this.gesture ) ) { this.endGesture(); this.cancel(); handled = true; }
			if ( handled ) { event.preventDefault(); event.stopImmediatePropagation(); }
		};
		this.onKeyUp = event => { if ( event.key === ' ' ) { this.spacePressed = false; this.changed(); } };
		this.onCancel = () => { this.endTouch(); this.endGesture(); this.cancel(); };
		this.onBlur = () => { this.spacePressed = false; this.onCancel(); this.contextMenu.hide(); };
		this.onOutside = event => {
			if ( event.target !== this.domElement && ! event.target.closest?.( '#toolbar, [data-placement-action]' ) ) { this.spacePressed = false; this.onCancel(); }
		};
		this.onContext = event => event.preventDefault();
		document.addEventListener( 'keydown', this.onKey, true );
		document.addEventListener( 'keyup', this.onKeyUp, true );
		document.addEventListener( 'pointerdown', this.onOutside, true );
		document.addEventListener( 'focusin', this.onOutside, true );
		window.addEventListener( 'blur', this.onBlur );
		editor.signals.snapChanged.add( value => { this.translationSnap = value; if ( this.object && this.moved ) this.move(); } );
		editor.signals.objectSelected.add( object => { if ( this.object && object !== this.object ) this.cancel(); } );
		editor.signals.objectRemoved.add( object => { if ( object === this.object ) this.release(); } );
		editor.signals.sceneGraphChanged.add( () => { if ( this.object ) this.collectColliders(); } );
		editor.signals.startPlayer.add( () => this.cancel() );
	}

	touchDown( event ) {
		event.preventDefault(); event.stopImmediatePropagation(); this.contextMenu.hide();
		this.domElement.focus( { preventScroll: true } );
		this.controls.stop(); this.domElement.setPointerCapture( event.pointerId );
		this.touches.set( event.pointerId, { x: event.clientX, y: event.clientY } );
		clearTimeout( this.longPress );
		if ( this.touches.size > 1 ) { this.touchGesture.multi = true; return; }
		this.setPointer( event );
		const object = this.pick();
		const gesture = { x: event.clientX, y: event.clientY, moved: false, multi: false, held: !! this.object, object, menu: false };
		this.touchGesture = gesture;
		if ( object ) this.longPress = setTimeout( () => {
			if ( this.touchGesture !== gesture || gesture.moved || gesture.multi ) return;
			gesture.menu = true;
			if ( this.object ) this.cancel();
			if ( object.parent ) this.contextMenu.show( object, gesture.x, gesture.y );
		}, 500 );
	}

	touchMove( event ) {
		if ( ! this.touches.has( event.pointerId ) ) return;
		event.preventDefault(); event.stopImmediatePropagation();
		const old = this.touches.get( event.pointerId ), gesture = this.touchGesture;
		const before = [ ...this.touches.values() ];
		this.touches.set( event.pointerId, { x: event.clientX, y: event.clientY } );
		if ( ! gesture || gesture.menu ) return;
		if ( gesture.multi ) {
			if ( this.touches.size !== 2 || ! this.controls.enabled ) return;
			const after = [ ...this.touches.values() ];
			const distance = points => Math.max( 1, Math.hypot( points[ 0 ].x - points[ 1 ].x, points[ 0 ].y - points[ 1 ].y ) );
			this.controls.pan( this.offset.set( ( before[ 0 ].x + before[ 1 ].x - after[ 0 ].x - after[ 1 ].x ) / 2, ( after[ 0 ].y + after[ 1 ].y - before[ 0 ].y - before[ 1 ].y ) / 2, 0 ) );
			this.controls.zoom( this.offset.set( 0, 0, Math.log( distance( before ) / distance( after ) ) / this.controls.zoomSpeed ) );
			return; // Freeze the model until all navigation fingers have lifted.
		}
		if ( Math.hypot( event.clientX - gesture.x, event.clientY - gesture.y ) >= 8 ) { gesture.moved = true; clearTimeout( this.longPress ); }
		if ( ! gesture.moved ) return;
		if ( gesture.held ) { if ( this.setPointer( event ) ) this.move(); }
		else if ( ! gesture.object && this.controls.enabled ) this.controls.rotate( this.offset.set( old.x - event.clientX, old.y - event.clientY, 0 ) );
	}

	touchUp( event ) {
		if ( ! this.touches.has( event.pointerId ) ) return;
		event.preventDefault(); event.stopImmediatePropagation(); clearTimeout( this.longPress );
		const gesture = this.touchGesture;
		this.touches.delete( event.pointerId );
		if ( this.domElement.hasPointerCapture( event.pointerId ) ) this.domElement.releasePointerCapture( event.pointerId );
		if ( this.touches.size ) return;
		this.touchGesture = null;
		if ( ! gesture || gesture.multi || gesture.menu || gesture.moved || ! this.setPointer( event ) ) return;
		if ( gesture.held ) { this.move(); if ( this.valid ) this.finish(); }
		else if ( gesture.object ) this.grab( gesture.object, false, true );
		else this.editor.deselect();
	}

	endTouch() {
		clearTimeout( this.longPress ); this.touchGesture = null;
		for ( const id of this.touches.keys() ) if ( this.domElement?.hasPointerCapture( id ) ) this.domElement.releasePointerCapture( id );
		this.touches.clear();
	}

	connect( element ) {
		if ( this.domElement ) {
			this.onCancel(); this.contextMenu.hide();
			for ( const [ name, handler ] of this.events() ) this.domElement.removeEventListener( name, handler );
		}
		this.domElement = element;
		element.style.touchAction = 'none';
		element.tabIndex = 0;
		for ( const [ name, handler ] of this.events() ) element.addEventListener( name, handler, { passive: false } );
	}

	events() {
		return [ [ 'pointerdown', this.onDown ], [ 'pointerup', this.onUp ], [ 'pointermove', this.onMove ], [ 'pointercancel', this.onCancel ], [ 'contextmenu', this.onContext ], [ 'wheel', this.onWheel ] ];
	}

	endGesture() {
		const gesture = this.gesture; this.gesture = null;
		if ( gesture && this.domElement.hasPointerCapture( gesture.id ) ) this.domElement.releasePointerCapture( gesture.id );
	}

	pick() {
		this.raycaster.setFromCamera( this.pointer, this.editor.viewportCamera );
		const hit = this.editor.selector.getIntersects( this.raycaster ).find( hit => hit.object.isMesh );
		return hit ? this.editor.selector.getModelRoot( hit.object ) : null;
	}

	setPointer( event ) {
		const rect = this.domElement.getBoundingClientRect();
		this.pointer.set( ( event.clientX - rect.left ) / rect.width * 2 - 1, 1 - ( event.clientY - rect.top ) / rect.height * 2 );
		return Math.abs( this.pointer.x ) <= 1 && Math.abs( this.pointer.y ) <= 1;
	}

	grab( source, duplicate = false, fromPointer = false ) {
		if ( source === this.editor.scene || source.parent === null ) return;
		if ( this.box.setFromObject( source, true ).isEmpty() ) { this.editor.select( source ); return; }
		this.cancel();
		if ( source.userData.isLocked && ! duplicate ) { this.editor.select( source ); return; }
		let object = source;
		if ( duplicate ) {
			object = clone( source ); object.visible = true; object.userData.isLocked = false; object.name = ( source.name || '模型' ) + ' · 副本';
			this.editor.addObject( object );
		}
		this.editor.select( object );
		this.object = object;
		this.source = duplicate ? source : null;
		this.snapshot = { position: object.position.clone(), rotation: object.rotation.clone(), scale: object.scale.clone() };
		this.valid = false; this.moved = false;
		this.controls.stop(); this.controls.enabled = this.editor.viewportCamera === this.editor.camera;
		const previews = new Map();
		object.traverse( mesh => {
			if ( ! mesh.material ) return;
			const preview = material => {
				if ( ! previews.has( material ) ) {
					const ghost = material.clone(); ghost.transparent = true; ghost.opacity = material.opacity * 0.45; ghost.depthWrite = false; ghost.alphaTest = 0;
					previews.set( material, ghost );
				}
				return previews.get( material );
			};
			this.materials.push( { mesh, original: mesh.material } );
			mesh.material = Array.isArray( mesh.material ) ? mesh.material.map( preview ) : preview( mesh.material );
		} );
		this.previews = previews;
		this.collectColliders();
		if ( this.movementMode === 'screen' && fromPointer ) this.valid = this.anchorScreenMove();
		this.changed();
	}

	collectColliders() {
		this.colliders = [];
		this.editor.scene.traverseVisible( mesh => {
			if ( mesh.isMesh && mesh.geometry && this.editor.selector.getModelRoot( mesh ) !== this.object ) this.colliders.push( mesh );
		} );
	}

	isTop( hit ) {
		if ( ! hit.face || hit.point.y < 0 ) return false;
		this.matrix.copy( hit.object.matrixWorld );
		if ( hit.object.isInstancedMesh ) { hit.object.getMatrixAt( hit.instanceId, this.instanceMatrix ); this.matrix.multiply( this.instanceMatrix ); }
		this.normalMatrix.getNormalMatrix( this.matrix );
		return this.center.copy( hit.face.normal ).applyNormalMatrix( this.normalMatrix ).y > 0.05;
	}

	supportHeight( bounds, targetHeight = Infinity, ceiling = Infinity ) {
		let height = 0;
		const size = bounds.max.y - bounds.min.y;
		const candidates = this.colliders.map( mesh => ( { mesh, box: new THREE.Box3().setFromObject( mesh ) } ) );
		candidates.sort( ( a, b ) => a.box.min.y - b.box.min.y );
		// ponytail: exact triangle scan after a bounding-box broad phase; use a BVH if large GLBs exceed the pointer budget.
		for ( const { mesh, box } of candidates ) {
			this.colliderBox.copy( box );
			// An object can fit below an overhead surface; only overlapping supports lift it.
			if ( box.min.y > ceiling || box.min.y >= Math.max( targetHeight, height ) + size - 1e-7 ) continue;
			if ( this.colliderBox.max.x < bounds.min.x || this.colliderBox.min.x > bounds.max.x || this.colliderBox.max.z < bounds.min.z || this.colliderBox.min.z > bounds.max.z || this.colliderBox.max.y <= height ) continue;
			const geometry = mesh.geometry, index = geometry.index;
			const count = index ? index.count : geometry.attributes.position.count;
			const start = geometry.drawRange.start, end = Math.min( count, start + geometry.drawRange.count );
			for ( let instance = 0; instance < ( mesh.isInstancedMesh ? mesh.count : 1 ); instance ++ ) {
				this.matrix.copy( mesh.matrixWorld );
				if ( mesh.isInstancedMesh ) { mesh.getMatrixAt( instance, this.instanceMatrix ); this.matrix.multiply( this.instanceMatrix ); }
				for ( let i = start; i + 2 < end; i += 3 ) {
					mesh.getVertexPosition( index ? index.getX( i ) : i, a ).applyMatrix4( this.matrix );
					mesh.getVertexPosition( index ? index.getX( i + 1 ) : i + 1, b ).applyMatrix4( this.matrix );
					mesh.getVertexPosition( index ? index.getX( i + 2 ) : i + 2, c ).applyMatrix4( this.matrix );
					if ( Math.max( a.x, b.x, c.x ) < bounds.min.x || Math.min( a.x, b.x, c.x ) > bounds.max.x || Math.max( a.z, b.z, c.z ) < bounds.min.z || Math.min( a.z, b.z, c.z ) > bounds.max.z || Math.max( a.y, b.y, c.y ) <= height ) continue;
					const surface = triangleHeight( bounds );
					if ( surface <= ceiling ) height = Math.max( height, surface );
				}
			}
		}
		return height;
	}

	translate( delta ) {
		this.object.getWorldPosition( this.position ).add( delta );
		this.object.position.copy( this.object.parent.worldToLocal( this.position ) );
		this.object.updateWorldMatrix( true, true );
	}

	setMovementMode( mode ) {
		if ( ! [ 'surface', 'screen' ].includes( mode ) || mode === this.movementMode ) return;
		this.movementMode = mode;
		this.editor.config.setKey( 'canvas/movementMode', mode );
		this.screenReady = false; this.valid = false;
		this.changed();
	}

	anchorScreenMove() {
		const camera = this.editor.viewportCamera;
		camera.updateWorldMatrix( true, false );
		this.box.setFromObject( this.object, true ).getCenter( this.center );
		this.screenPlane.setFromNormalAndCoplanarPoint( camera.getWorldDirection( this.offset ), this.center );
		this.raycaster.setFromCamera( this.pointer, camera );
		if ( ! this.raycaster.ray.intersectPlane( this.screenPlane, this.point ) ) return false;
		this.object.getWorldPosition( this.screenOffset ).sub( this.point );
		this.screenCamera.copy( camera.matrixWorld );
		this.screenProjection.copy( camera.projectionMatrix );
		this.screenReady = true;
		return true;
	}

	move( reanchor = false ) {
		if ( ! this.object ) return;
		if ( this.movementMode === 'screen' ) {
			const camera = this.editor.viewportCamera;
			camera.updateWorldMatrix( true, false );
			// Re-anchor after navigation or toolbar edits, without jumping on re-entry.
			if ( reanchor || ! this.screenCamera.equals( camera.matrixWorld ) || ! this.screenProjection.equals( camera.projectionMatrix ) ) this.screenReady = false;
			if ( ! this.screenReady && ! this.anchorScreenMove() ) { this.valid = false; this.changed(); return; }
			this.raycaster.setFromCamera( this.pointer, camera );
			this.valid = this.raycaster.ray.intersectPlane( this.screenPlane, this.point ) !== null;
			if ( this.valid ) {
				this.object.getWorldPosition( this.offset );
				this.point.add( this.screenOffset ).sub( this.offset );
				this.valid = this.point.toArray().every( Number.isFinite );
				if ( this.valid ) { this.translate( this.point ); this.moved = true; }
			}
			this.changed(); return;
		}
		this.editor.scene.updateMatrixWorld( true );
		this.raycaster.setFromCamera( this.pointer, this.editor.viewportCamera );
		const hit = this.raycaster.intersectObjects( this.colliders, false ).find( hit => this.isTop( hit ) );
		const floor = this.raycaster.ray.intersectPlane( ground, this.point );
		if ( ! hit && ! floor ) { this.valid = false; this.changed(); return; }
		if ( hit && ( ! floor || hit.distance < this.raycaster.ray.origin.distanceTo( floor ) ) ) this.point.copy( hit.point );
		// A ray through assembly gaps can hit a lower surface. Verify actual footprint
		// contact before using a model's top plane; an empty bounding box is no support.
		if ( this.raycaster.ray.direction.y < - 1e-6 ) {
			const footprint = new THREE.Box3().setFromObject( this.object, true );
			const center = footprint.getCenter( new THREE.Vector3() );
			const roots = new Set( this.colliders.map( mesh => this.editor.selector.getModelRoot( mesh ) ) );
			const surfaces = [ ...roots ].map( root => new THREE.Box3().setFromObject( root, true ) ).sort( ( a, b ) => b.max.y - a.max.y );
			for ( const surface of surfaces ) {
				if ( surface.max.y <= this.point.y + 1e-6 ) continue;
				const distance = ( surface.max.y - this.raycaster.ray.origin.y ) / this.raycaster.ray.direction.y;
				if ( distance < 0 ) continue;
				const point = this.raycaster.ray.at( distance, new THREE.Vector3() );
				if ( point.x < surface.min.x || point.x > surface.max.x || point.z < surface.min.z || point.z > surface.max.z ) continue;
				const bounds = footprint.clone().translate( new THREE.Vector3( point.x - center.x, 0, point.z - center.z ) );
				if ( Math.abs( this.supportHeight( bounds, surface.max.y ) - surface.max.y ) < 1e-6 ) { this.point.copy( point ); break; }
			}
		}
		this.valid = false;
		// Keep the bottom-center on the cursor ray when a footprint reaches a higher support.
		for ( let attempt = 0; attempt < 16; attempt ++ ) {
			if ( this.translationSnap ) {
				this.point.x = Math.round( this.point.x / this.translationSnap ) * this.translationSnap;
				this.point.z = Math.round( this.point.z / this.translationSnap ) * this.translationSnap;
			}
			this.box.setFromObject( this.object, true ).getCenter( this.center );
			this.translate( this.offset.set( this.point.x - this.center.x, 0, this.point.z - this.center.z ) );
			this.box.setFromObject( this.object, true );
			const height = this.supportHeight( this.box, this.point.y );
			this.translate( this.offset.set( 0, height - this.box.min.y, 0 ) );
			if ( Math.abs( height - this.point.y ) < 1e-6 ) { this.valid = true; break; }
			const distance = ( height - this.raycaster.ray.origin.y ) / this.raycaster.ray.direction.y;
			if ( ! Number.isFinite( distance ) || distance < 0 ) break;
			this.raycaster.ray.at( distance, this.point );
		}
		this.moved = true; this.changed();

	}

	rotate( direction, degrees = this.rotationStep ) {
		const angle = direction * degrees * THREE.MathUtils.DEG2RAD;
		if ( ! Number.isFinite( angle ) || angle === 0 ) return false;
		let object = this.object || this.editor.selected;
		if ( ! object || object === this.editor.scene || object.parent === null ) return false;
		object = this.editor.selector.getModelRoot( object );
		if ( object.userData.isLocked ) return false;
		const box = this.box.setFromObject( object, true );
		if ( box.isEmpty() ) return false;
		this.editor.select( object );
		const center = box.getCenter( new THREE.Vector3() ), bottom = box.min.y;
		const oldPosition = object.position.clone(), oldRotation = object.rotation.clone();
		const parentRotation = object.parent.getWorldQuaternion( new THREE.Quaternion() );
		const localUp = up.clone().applyQuaternion( parentRotation.invert() );
		object.quaternion.premultiply( new THREE.Quaternion().setFromAxisAngle( localUp, angle ) );
		object.updateWorldMatrix( true, true );
		const newCenter = box.setFromObject( object, true ).getCenter( new THREE.Vector3() );
		const world = object.getWorldPosition( new THREE.Vector3() ).add( new THREE.Vector3( center.x - newCenter.x, this.movementMode === 'screen' ? center.y - newCenter.y : bottom - box.min.y, center.z - newCenter.z ) );
		object.position.copy( object.parent.worldToLocal( world ) );
		object.updateWorldMatrix( true, true );
		if ( this.object ) this.move( true );
		else this.editor.execute( new MultiCmdsCommand( this.editor, [
			new SetRotationCommand( this.editor, object, object.rotation, oldRotation ),
			new SetPositionCommand( this.editor, object, object.position, oldPosition )
		] ), '旋转物品' );
		return true;
	}

	scale( factor ) {
		if ( ! Number.isFinite( factor ) || factor <= 0 ) return false;
		let object = this.object || this.editor.selected;
		if ( ! object || object === this.editor.scene || object.parent === null ) return false;
		object = this.editor.selector.getModelRoot( object );
		if ( object.userData.isLocked ) return false;
		const nextScale = object.scale.clone().multiplyScalar( factor );
		if ( ! nextScale.toArray().every( ( value, i ) => Number.isFinite( value ) && ( value !== 0 || object.scale.getComponent( i ) === 0 ) ) ) return false;
		if ( factor === 1 ) return true;
		this.editor.select( object );
		const box = this.box.setFromObject( object, true );
		if ( box.isEmpty() ) return false;
		const oldPosition = object.position.clone(), oldScale = object.scale.clone();
		const center = box.getCenter( new THREE.Vector3() );
		const bottom = box.min.y;
		object.scale.copy( nextScale ); object.updateWorldMatrix( true, true );
		box.setFromObject( object, true );
		if ( ! [ ...box.min.toArray(), ...box.max.toArray() ].every( Number.isFinite ) ) {
			object.scale.copy( oldScale ); object.updateWorldMatrix( true, true ); return false;
		}
		const newCenter = box.getCenter( new THREE.Vector3() );
		const world = object.getWorldPosition( new THREE.Vector3() ).add( new THREE.Vector3( center.x - newCenter.x, this.movementMode === 'screen' ? center.y - newCenter.y : 0, center.z - newCenter.z ) );
		object.position.copy( object.parent.worldToLocal( world ) ); object.updateWorldMatrix( true, true );
		box.setFromObject( object, true );
		if ( this.object ) this.move( true );
		else {
			world.copy( object.getWorldPosition( new THREE.Vector3() ) ); if ( this.movementMode !== 'screen' ) world.y += bottom - box.min.y;
			object.position.copy( object.parent.worldToLocal( world ) );
			this.editor.execute( new MultiCmdsCommand( this.editor, [ new SetScaleCommand( this.editor, object, object.scale, oldScale ), new SetPositionCommand( this.editor, object, object.position, oldPosition ) ] ), '等比调整大小' );
		}
		return true;
	}

	contextAction( action, object ) {
		if ( object === this.editor.camera && action === 'delete' ) {
			// The viewport still needs its working camera; remove only its optional outliner entry.
			this.editor.execute( new MultiCmdsCommand( this.editor, [ new SetValueCommand( this.editor, this.editor.scene, 'userData', { ...this.editor.scene.userData, editorCameraHidden: true } ) ] ), '移除工作相机条目' );
			this.editor.deselect(); return;
		}
		if ( object !== this.editor.camera && object.parent !== this.editor.scene ) return;
		if ( action === 'clone' ) {
			if ( this.box.setFromObject( object, true ).isEmpty() ) {
				const copy = clone( object ); copy.name = ( object.name || '物件' ) + ' · 副本'; copy.userData.isLocked = false;
				this.editor.execute( new AddObjectCommand( this.editor, copy ) );
			} else this.grab( object, true );
			return;
		}
		let command;
		if ( action === 'lock' ) command = new SetValueCommand( this.editor, object, 'userData', { ...object.userData, isLocked: ! object.userData.isLocked } );
		else if ( action === 'visible' ) command = new SetValueCommand( this.editor, object, 'visible', ! object.visible );
		else if ( action === 'delete' ) command = new RemoveObjectCommand( this.editor, object );
		else if ( action === 'mirrorX' || action === 'mirrorZ' ) {
			const scale = object.scale.clone(); scale[ action === 'mirrorX' ? 'x' : 'z' ] *= - 1;
			command = new SetScaleCommand( this.editor, object, scale );
		} else if ( action === 'resetRotation' ) command = new SetRotationCommand( this.editor, object, new THREE.Euler( 0, 0, 0, object.rotation.order ) );
		else if ( action === 'ground' ) {
			this.editor.scene.updateMatrixWorld( true ); this.collectColliders();
			this.colliders = this.colliders.filter( mesh => this.editor.selector.getModelRoot( mesh ) !== object );
			const bounds = new THREE.Box3().setFromObject( object, true );
			if ( bounds.isEmpty() ) { this.colliders = []; return; }
			// Only supports below the current bottom can receive a downward re-ground.
			const height = this.supportHeight( bounds, Infinity, Math.max( 0, bounds.min.y ) + 1e-6 );
			const position = object.getWorldPosition( new THREE.Vector3() ); position.y += height - bounds.min.y;
			command = new SetPositionCommand( this.editor, object, object.parent.worldToLocal( position ) ); this.colliders = [];
		}
		if ( command ) this.editor.execute( new MultiCmdsCommand( this.editor, [ command ] ), {
			lock: object.userData.isLocked ? '解锁位置' : '锁定位置', mirrorX: '水平翻转', mirrorZ: '前后翻转', resetRotation: '旋转归正', ground: '重新贴地', delete: '删除对象', visible: object.visible ? '隐藏对象' : '显示对象'
		}[ action ] );
	}

	changed() {
		if ( this.object ) this.editor.signals.objectChanged.dispatch( this.object );
		if ( this.domElement ) this.domElement.style.cursor = this.spacePressed ? 'grab' : this.object ? ( this.valid ? 'grabbing' : 'crosshair' ) : 'default';
		this.editor.signals.placementChanged.dispatch();
	}

	release() {
		const object = this.object;
		if ( ! object ) return null;
		for ( const { mesh, original } of this.materials ) mesh.material = original;
		for ( const material of this.previews.values() ) material.dispose();
		this.materials = []; this.previews.clear(); this.object = null;
		this.colliders = []; this.source = null; this.snapshot = null; this.valid = false; this.moved = false; this.screenReady = false;
		this.controls.enabled = this.editor.viewportCamera === this.editor.camera;
		this.changed();
		return object;
	}

	finish() {
		if ( ! this.object || ! this.valid ) return;
		const snapshot = this.snapshot, source = this.source, object = this.release();
		if ( source ) {
			this.editor.removeObject( object );
			this.editor.execute( new AddObjectCommand( this.editor, object ), '复制并摆放 ' + object.name );
		} else {
			const commands = [];
			if ( ! object.position.equals( snapshot.position ) ) commands.push( new SetPositionCommand( this.editor, object, object.position, snapshot.position ) );
			if ( ! object.rotation.equals( snapshot.rotation ) ) commands.push( new SetRotationCommand( this.editor, object, object.rotation, snapshot.rotation ) );
			if ( ! object.scale.equals( snapshot.scale ) ) commands.push( new SetScaleCommand( this.editor, object, object.scale, snapshot.scale ) );
			if ( commands.length ) this.editor.execute( new MultiCmdsCommand( this.editor, commands ), '摆放 ' + object.name );
			else this.editor.signals.objectChanged.dispatch( object );
		}
	}

	cancel() {
		if ( ! this.object ) return;
		const object = this.object, source = this.source;
		object.position.copy( this.snapshot.position ); object.rotation.copy( this.snapshot.rotation ); object.scale.copy( this.snapshot.scale );
		object.updateWorldMatrix( true, true );
		this.release();
		if ( source ) {
			const selected = this.editor.selected === object;
			this.editor.removeObject( object );
			if ( selected ) this.editor.select( source );
		}
		else this.editor.signals.objectChanged.dispatch( object );
	}

	remove() {
		const object = this.object, source = this.source;
		if ( ! object ) return;
		this.cancel();
		if ( ! source ) this.editor.execute( new RemoveObjectCommand( this.editor, object ) );
	}
}

export { ScenePlacement };
