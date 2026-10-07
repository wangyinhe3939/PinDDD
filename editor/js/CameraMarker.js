import * as THREE from 'three';

// A camera location marker, not its potentially kilometre-long clipping volume.
class CameraMarker extends THREE.LineSegments {

	constructor( camera, editor ) {
		const vertices = [];
		const back = [ [ -.4, -.28, .35 ], [ .4, -.28, .35 ], [ .4, .28, .35 ], [ -.4, .28, .35 ] ];
		const lens = back.map( ( [ x, y ] ) => [ x * 1.5, y * 1.5, -.65 ] );
		for ( let i = 0; i < 4; i ++ ) vertices.push( ...back[ i ], ...back[ ( i + 1 ) % 4 ], ...lens[ i ], ...lens[ ( i + 1 ) % 4 ], ...back[ i ], ...lens[ i ] );
		vertices.push( -.2, .28, .35, 0, .55, .35, 0, .55, .35, .2, .28, .35 );
		super( new THREE.BufferGeometry().setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) ),
			new THREE.LineBasicMaterial( { color: 0x91a8be, toneMapped: false, depthTest: false, depthWrite: false } ) );
		this.type = 'CameraHelper';
		this.camera = camera;
		this.enabled = true;
		this.matrixAutoUpdate = false;
		this.renderOrder = 998;
		const position = new THREE.Vector3(), eye = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
		this.updateMatrixWorld = force => {
			camera.updateWorldMatrix( true, false );
			camera.matrixWorld.decompose( position, rotation, scale );
			const view = editor.viewportCamera;
			view.getWorldPosition( eye );
			const height = Math.max( document.getElementById( 'viewport' )?.clientHeight || 800, 1 );
			const span = view.isOrthographicCamera ? ( view.top - view.bottom ) / view.zoom
				: 2 * eye.distanceTo( position ) * Math.tan( THREE.MathUtils.degToRad( view.getEffectiveFOV() / 2 ) );
			this.matrix.compose( position, rotation, scale.setScalar( Math.max( span * 32 / height, 1e-6 ) ) );
			let ancestor = camera;
			while ( ancestor && ancestor.visible ) ancestor = ancestor.parent;
			this.visible = this.enabled && ! ancestor;
			this.material.color.setHex( editor.selected === camera ? 0xe9c65b : 0x91a8be );
			super.updateMatrixWorld( force );
		};
	}

	update() { this.updateMatrixWorld( true ); }
	dispose() { super.dispose(); this.geometry.dispose(); this.material.dispose(); }

}
export { CameraMarker };
