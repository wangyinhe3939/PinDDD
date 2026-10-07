import { UIDiv, UISpan } from './libs/ui.js';
import { SidebarSection } from './Sidebar.Section.js';
import { SidebarScene } from './Sidebar.Scene.js';
import { SidebarProperties } from './Sidebar.Properties.js';
import { SidebarProject } from './Sidebar.Project.js';
import { SidebarSettings } from './Sidebar.Settings.js';

function Sidebar( editor ) {
	const container = new UIDiv().setId( 'sidebar' );
	const scene = new SidebarSection( 'scene-section', editor.strings.getKey( 'sidebar/scene' ), new SidebarScene( editor ), null );
	scene.dom.open = true;
	container.add( scene, new SidebarProperties( editor ) );
	container.add( new SidebarSection( 'preferences-section', editor.strings.getKey( 'sidebar/project' ), new UISpan().add( new SidebarSettings( editor ), new SidebarProject( editor ) ) ) );
	return container;
}

export { Sidebar };
