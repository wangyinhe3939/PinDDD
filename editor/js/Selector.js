import * as THREE from 'three';

const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

const _objectBox = new THREE.Box3();
const _vector = new THREE.Vector3();

class Selector {

	constructor( editor ) {

		const signals = editor.signals;

		this.editor = editor;
		this.signals = signals;

		this.selection = [];

		// signals

		signals.intersectionsDetected.add( ( intersects, shiftKey ) => {

			if ( intersects.length > 0 ) {

				const object = this.getModelRoot( intersects[ 0 ].object );

				if ( shiftKey === true && this.selection.length > 0 && editor.selected !== editor.scene && editor.selected !== editor.camera ) {

					this.toggle( object );

				} else {

					this.select( object );

				}

			} else {

				if ( shiftKey !== true ) this.select( null ); // keep the selection when shift-clicking empty space

			}

		} );

	}

	getModelRoot( object ) {

		if ( object.userData.object instanceof THREE.Object3D ) object = object.userData.object;

		while ( object.parent !== null && object.parent !== this.editor.scene ) {

			object = object.parent;

		}

		return object;

	}

	getIntersects( raycaster ) {

		const objects = [];

		this.editor.scene.traverseVisible( function ( child ) {

			objects.push( child );

		} );

		this.editor.sceneHelpers.traverseVisible( function ( child ) {

			if ( child.name === 'picker' || child.userData.object !== undefined ) objects.push( child );

		} );

		return raycaster.intersectObjects( objects, false );

	}

	getPointerIntersects( point, camera ) {

		mouse.set( ( point.x * 2 ) - 1, - ( point.y * 2 ) + 1 );

		raycaster.setFromCamera( mouse, camera );

		return this.getIntersects( raycaster );

	}

	getSelectionBox( target ) {

		target.makeEmpty();

		for ( let i = 0; i < this.selection.length; i ++ ) {

			const object = this.selection[ i ];
			let ancestor = object;
			while ( ancestor && ancestor.visible ) ancestor = ancestor.parent;
			if ( ancestor ) continue;

			_objectBox.setFromObject( object, true );
			if ( _objectBox.isEmpty() ) _objectBox.expandByPoint( object.getWorldPosition( _vector ) );
			target.union( _objectBox );

		}

		return target;

	}

	select( object ) {

		this.setSelection( object === null ? [] : [ object ] );

	}

	toggle( object ) {

		const selection = this.selection.slice();

		const index = selection.indexOf( object );

		if ( index === - 1 ) {

			selection.push( object );

		} else {

			selection.splice( index, 1 );

		}

		this.setSelection( selection );

	}

	setSelection( objects ) {

		const editor = this.editor;

		if ( objects.length === this.selection.length && objects.every( ( object, i ) => object === this.selection[ i ] ) ) return;

		this.selection = objects.slice();

		const object = objects.length === 1 ? objects[ 0 ] : null;
		editor.selected = object;
		editor.config.setKey( 'selected', object !== null ? object.uuid : null );
		this.signals.objectSelected.dispatch( object );

	}

	deselect() {

		this.select( null );

	}

}

export { Selector };
