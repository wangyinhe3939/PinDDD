import { UISpan } from './libs/ui.js';
import { SidebarSection } from './Sidebar.Section.js';

import { SidebarProjectApp } from './Sidebar.Project.App.js';
import { SidebarProjectRenderer } from './Sidebar.Project.Renderer.js';
import { SidebarProjectResources } from './Sidebar.Project.Resources.js';

function SidebarProject( editor ) {

	const container = new UISpan();

	container.add( new SidebarSection( 'renderer-section', '渲染与相机', new SidebarProjectRenderer( editor ), 'preferences-advanced' ) );

	container.add( new SidebarSection( 'app-section', '应用与播放', new SidebarProjectApp( editor ), 'preferences-advanced' ) );

	container.add( new SidebarSection( 'resources-section', '场景资源', new SidebarProjectResources( editor ), 'preferences-advanced' ) );

	return container;

}

export { SidebarProject };
