import { UIDiv } from './libs/ui.js';
import { SidebarSection } from './Sidebar.Section.js';
import { SidebarObject } from './Sidebar.Object.js';
import { SidebarGeometry } from './Sidebar.Geometry.js';
import { SidebarMaterial } from './Sidebar.Material.js';
import { SidebarScript } from './Sidebar.Script.js';

function SidebarProperties( editor ) {
	const strings = editor.strings;
	const container = new UIDiv().setId( 'properties' );
	const objectSection = new SidebarSection( 'object-section', strings.getKey( 'sidebar/properties/object' ), new SidebarObject( editor ) );
	const geometry = new SidebarSection( 'geometry-section', strings.getKey( 'sidebar/properties/geometry' ), new SidebarGeometry( editor ) );
	const material = new SidebarSection( 'material-section', strings.getKey( 'sidebar/properties/material' ), new SidebarMaterial( editor ) );
	const script = new SidebarSection( 'script-section', strings.getKey( 'sidebar/properties/script' ), new SidebarScript( editor ) );
	const sections = [ objectSection, geometry, material, script ];
	container.add( ...sections );

	function update( object ) {
		container.setHidden( object === null );
		if ( object === null ) { for ( const section of sections ) section.dom.open = false; return; }
		geometry.setHidden( ! object.geometry );
		material.setHidden( ! object.material );
		script.setHidden( object === editor.camera );
		for ( const section of sections ) if ( section.isHidden() ) section.dom.open = false;
		if ( ! sections.some( section => section.dom.open ) ) objectSection.dom.open = true;
	}

	editor.signals.objectSelected.add( update );
	update( editor.selected );
	return container;
}

export { SidebarProperties };
