import { UIElement } from './libs/ui.js';

function Resizer( editor ) {

	const signals = editor.signals;

	const dom = document.createElement( 'div' );
	dom.id = 'resizer';

	function onPointerDown( event ) {

		if ( event.isPrimary === false ) return;

		dom.ownerDocument.addEventListener( 'pointermove', onPointerMove );
		dom.ownerDocument.addEventListener( 'pointerup', onPointerUp );

	}

	function onPointerUp( event ) {

		if ( event.isPrimary === false ) return;

		dom.ownerDocument.removeEventListener( 'pointermove', onPointerMove );
		dom.ownerDocument.removeEventListener( 'pointerup', onPointerUp );

	}

	function onPointerMove( event ) {

		// PointerEvent's movementX/movementY are 0 in WebKit

		if ( event.isPrimary === false ) return;

		const offsetWidth = document.body.offsetWidth;
		const clientX = event.clientX;

		const cX = clientX < 0 ? 0 : clientX > offsetWidth ? offsetWidth : clientX;

		const x = Math.min( 240, Math.max( 220, offsetWidth - cX - 12 ) );

		dom.style.right = ( x + 12 ) + 'px';

		document.getElementById( 'sidebar' ).style.width = x + 'px';
		document.getElementById( 'player' ).style.right = ( x + 12 ) + 'px';
		document.getElementById( 'script' ).style.right = ( x + 12 ) + 'px';
		document.getElementById( 'viewport' ).style.right = ( x + 12 ) + 'px';
		document.getElementById( 'animation' ).style.right = ( x + 12 ) + 'px';
		document.getElementById( 'animation-resizer' ).style.right = ( x + 12 ) + 'px';

		// Center toolbar in viewport area
		const toolbar = document.getElementById( 'toolbar' );
		const viewportWidth = offsetWidth - x - 12;
		toolbar.style.left = ( viewportWidth / 2 ) + 'px';

		signals.windowResize.dispatch();

	}

	dom.addEventListener( 'pointerdown', onPointerDown );

	return new UIElement( dom );

}

export { Resizer };
