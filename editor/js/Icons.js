// Lucide 0.468.0, local SVG assets. License: ../images/icons/LICENSE.
function createIcon( name ) {
	const icon = document.createElement( 'span' );
	icon.className = 'ui-icon'; icon.setAttribute( 'aria-hidden', 'true' );
	icon.style.setProperty( '--icon', `url("${ new URL( '../images/icons/' + name + '.svg', import.meta.url ).href }")` );
	return icon;
}
export { createIcon };
