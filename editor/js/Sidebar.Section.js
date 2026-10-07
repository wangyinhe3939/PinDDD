import { UIElement } from './libs/ui.js';

function SidebarSection( id, label, panel, group = 'inspector' ) {
	const details = document.createElement( 'details' );
	details.id = id; details.className = 'sidebar-section';
	if ( group ) details.setAttribute( 'name', group );
	const summary = document.createElement( 'summary' );
	summary.textContent = label;
	details.append( summary, panel.dom );
	// Keep exclusive groups working in browsers without details[name] support.
	details.addEventListener( 'toggle', () => {
		if ( ! details.open || ! group ) return;
		for ( const other of details.closest( '#sidebar' )?.querySelectorAll( 'details[name]' ) || [] ) {
			if ( other !== details && other.getAttribute( 'name' ) === group ) other.open = false;
		}
	} );
	return new UIElement( details );
}

export { SidebarSection };
