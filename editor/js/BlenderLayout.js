import { Matrix4, Vector3, Quaternion, Euler } from 'three';
const basis = new Matrix4().makeRotationX( Math.PI / 2 );
const inverse = basis.clone().invert();
export function blenderLayout( scene ) {
 scene.updateMatrixWorld( true );
 const objects = [];
 scene.traverse( object => {
  if ( object === scene ) return;
  const matrix = basis.clone().multiply( object.matrixWorld ).multiply( inverse );
  const position = new Vector3(), quaternion = new Quaternion(), scale = new Vector3();
  matrix.decompose( position, quaternion, scale );
  const rotation = new Euler().setFromQuaternion( quaternion, 'XYZ' );
  const clean = values => values.map( value => {
   if ( ! Number.isFinite( value ) ) throw new Error( '物件变换包含无效数值，请检查「空间摆放」。' );
   return Math.abs( value ) < 1e-12 ? 0 : value;
  } );
  objects.push( {
   id: object.uuid, parent: object.parent === scene ? null : object.parent.uuid,
   name: object.name || object.type, type: object.type,
   position: clean( position.toArray() ), rotation: clean( [ rotation.x, rotation.y, rotation.z ] ), scale: clean( scale.toArray() ),
   matrix: clean( matrix.toArray() )
  } );
 } );
 return { format:'PinDDD.BlenderLayout', version:1, coordinateSystem:'Blender-Z-Up', units:'meters', space:'world', rotationOrder:'XYZ', rotationUnit:'radians', objects };
}
