import * as THREE from 'three';

class EditorControls extends THREE.EventDispatcher {

	constructor( object ) {

		super();

		// API

		this.enabled = true;
		this.center = new THREE.Vector3();
		this.panSpeed = 0.002;
		this.zoomSpeed = 0.002;
		this.rotationSpeed = 0.005;

		// internals

		var scope = this;
		var vector = new THREE.Vector3();
		var delta = new THREE.Vector3();
		var box = new THREE.Box3();

		var center = this.center;
		var normalMatrix = new THREE.Matrix3();
		var spherical = new THREE.Spherical();
		var sphere = new THREE.Sphere();
		var childBox = new THREE.Box3();


		var domElement = null;

		// events

		var changeEvent = { type: 'change' };
		var zoomRemaining = 0;
		var focusTime = - 1;
		var orbitTransition = false;
		var focusStartPosition = new THREE.Vector3();
		var focusStartCenter = new THREE.Vector3();
		var focusStartQuaternion = new THREE.Quaternion();
		var focusPosition = new THREE.Vector3();
		var focusCenter = new THREE.Vector3();
		var focusQuaternion = new THREE.Quaternion();
		var focusStartZoom = 1;
		var focusZoom = 1;
		var focusMatrix = new THREE.Matrix4();

		this.stop = function () {

			focusTime = - 1;
			zoomRemaining = 0;

		};

		this.setCamera = function ( camera ) {

			scope.stop();
			object = camera;

		};

		function beginTransition( orbit = false ) {

			focusStartPosition.copy( object.position );
			focusStartCenter.copy( center );
			focusStartQuaternion.copy( object.quaternion );
			focusStartZoom = object.zoom;
			focusTime = 0;
			orbitTransition = orbit;

		}

		this.orient = function ( direction ) {

			scope.stop();
			focusCenter.copy( center );
			focusPosition.copy( center ).addScaledVector( direction.clone().normalize(), Math.max( object.position.distanceTo( center ), 0.1 ) );
			const up = Math.abs( direction.x ) + Math.abs( direction.z ) < 1e-8
				? new THREE.Vector3( 0, 0, direction.y > 0 ? - 1 : 1 ) : object.up;
			focusQuaternion.setFromRotationMatrix( focusMatrix.lookAt( focusPosition, focusCenter, up ) );
			focusZoom = object.zoom;
			beginTransition( true );

		};

		this.focus = function ( target ) {

			scope.stop();
			if ( target.isScene ) {

				box.makeEmpty(); target.updateMatrixWorld( true );
				target.traverseVisible( child => {
					if ( child.isCamera ) {
						child.getWorldPosition( vector );
						box.union( childBox.setFromCenterAndSize( vector, delta.setScalar( 3 ) ) );
					}
					if ( ! child.geometry ) return;
					if ( child.boundingBox !== undefined ) {
						if ( child.boundingBox === null ) child.computeBoundingBox();
					} else if ( child.geometry.boundingBox === null ) child.geometry.computeBoundingBox();
					box.union( childBox.copy( child.boundingBox || child.geometry.boundingBox ).applyMatrix4( child.matrixWorld ) );
				} );

			} else if ( target.isCamera ) {
				target.getWorldPosition( vector );
				box.setFromCenterAndSize( vector, delta.setScalar( 3 ) );
			} else box.setFromObject( target, true );

			var radius = 0.1;
			if ( ! box.isEmpty() ) {

				box.getCenter( focusCenter );
				radius = Math.max( box.getBoundingSphere( sphere ).radius, 0.01 );

			} else {

				target.getWorldPosition( focusCenter );
				if ( target.isScene ) {
					focusPosition.set( 10, 12, 10 ).add( focusCenter );
					focusQuaternion.setFromRotationMatrix( focusMatrix.lookAt( focusPosition, focusCenter, object.up ) );
					focusZoom = 1; beginTransition(); return;
				}

			}

			var distance = radius * 4;
			focusZoom = object.zoom;
			if ( object.isPerspectiveCamera ) {

				var halfFOV = THREE.MathUtils.degToRad( object.getEffectiveFOV() / 2 );
				var halfHorizontalFOV = Math.atan( Math.tan( halfFOV ) * object.aspect );
				distance = radius * 1.2 / Math.sin( Math.min( halfFOV, halfHorizontalFOV ) );

			} else if ( object.isOrthographicCamera ) {

				focusZoom = Math.min( object.top - object.bottom, object.right - object.left ) / ( radius * 2.4 );

			}

			// Keep the viewer's angle; selecting a rotated model or camera must not swing the horizon.
			delta.copy( object.position ).sub( center );
			if ( delta.lengthSq() < 1e-10 ) delta.set( 10, 12, 10 );
			delta.normalize();
			focusPosition.copy( focusCenter ).addScaledVector( delta, Math.max( distance, object.near + radius ) );
			focusQuaternion.setFromRotationMatrix( focusMatrix.lookAt( focusPosition, focusCenter, object.up ) );
			beginTransition();

		};

		this.update = function ( elapsed ) {

			if ( scope.enabled === false ) return;

			if ( focusTime >= 0 ) {

				focusTime += elapsed;
				var t = Math.min( focusTime / 0.4, 1 );
				var eased = t * t * ( 3 - 2 * t );
				object.position.lerpVectors( focusStartPosition, focusPosition, eased );
				center.lerpVectors( focusStartCenter, focusCenter, eased );
				object.quaternion.slerpQuaternions( focusStartQuaternion, focusQuaternion, eased );
				if ( orbitTransition ) object.position.set( 0, 0, 1 ).applyQuaternion( object.quaternion )
					.multiplyScalar( focusPosition.distanceTo( focusCenter ) ).add( center );
				if ( object.isOrthographicCamera ) {

					object.zoom = THREE.MathUtils.lerp( focusStartZoom, focusZoom, eased );
					object.updateProjectionMatrix();

				}
				if ( t === 1 ) focusTime = - 1;
				scope.dispatchEvent( changeEvent );

			} else if ( zoomRemaining !== 0 ) {

				var step = zoomRemaining * ( 1 - Math.exp( - 16 * elapsed ) );
				if ( Math.abs( zoomRemaining ) < 0.00001 ) step = zoomRemaining;
				zoomRemaining -= step;
				if ( object.isOrthographicCamera ) {

					object.zoom = THREE.MathUtils.clamp( object.zoom * Math.exp( - step ), 0.0001, 10000 );
					object.updateProjectionMatrix();

				} else {

					vector.copy( object.position ).sub( center );
					var distance = vector.length();
					if ( distance === 0 ) vector.set( 0, 0, 1 ).applyQuaternion( object.quaternion );
					distance = THREE.MathUtils.clamp( distance * Math.exp( step ), Math.max( object.near * 2, 0.01 ), object.far * 0.8 );
					object.position.copy( center ).add( vector.normalize().multiplyScalar( distance ) );

				}
				scope.dispatchEvent( changeEvent );

			}

		};

		this.pan = function ( delta ) {

			focusTime = - 1;

			var distance = object.isOrthographicCamera
				? ( object.top - object.bottom ) / object.zoom
				: object.position.distanceTo( center );

			delta.multiplyScalar( distance * scope.panSpeed );
			delta.applyMatrix3( normalMatrix.getNormalMatrix( object.matrix ) );

			object.position.add( delta );
			center.add( delta );

			scope.dispatchEvent( changeEvent );

		};

		this.zoom = function ( delta ) {

			focusTime = - 1;
			var amount = THREE.MathUtils.clamp( delta.z, - 100, 100 ) * scope.zoomSpeed;
			zoomRemaining = THREE.MathUtils.clamp( zoomRemaining + amount, - 1.5, 1.5 );

		};

		this.rotate = function ( delta ) {

			scope.stop();

			vector.copy( object.position ).sub( center );

			spherical.setFromVector3( vector );

			spherical.theta += delta.x * scope.rotationSpeed;
			spherical.phi += delta.y * scope.rotationSpeed;

			spherical.makeSafe();

			vector.setFromSpherical( spherical );

			object.position.copy( center ).add( vector );

			object.lookAt( center );

			scope.dispatchEvent( changeEvent );

		};

		//

		// Mouse navigation is dispatched by ScenePlacement's click/drag gate.

		function onMouseWheel( event ) {

			if ( scope.enabled === false ) return;

			event.preventDefault();

			// Pixel, line and page wheels share the same bounded, damped zoom path.
			var pixels = event.deltaY * ( event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? domElement.clientHeight : 1 );
			scope.zoom( delta.set( 0, 0, pixels ) );

		}

		this.connect = function ( element ) {

			if ( domElement !== null ) this.disconnect();

			domElement = element;

			domElement.addEventListener( 'wheel', onMouseWheel, { passive: false } );

		};

		this.disconnect = function () {

			domElement.removeEventListener( 'wheel', onMouseWheel );

			domElement = null;
			scope.stop();

		};


	}

	fromJSON( json ) {

		if ( json.center !== undefined ) this.center.fromArray( json.center );

	}

	toJSON() {

		return {
			center: this.center.toArray()
		};

	}

}

export { EditorControls };
