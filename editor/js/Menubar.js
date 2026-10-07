import { UIPanel, UIButton } from './libs/ui.js';

import { MenubarAdd } from './Menubar.Add.js';
import { MenubarEdit } from './Menubar.Edit.js';
import { MenubarFile } from './Menubar.File.js';
import { MenubarView } from './Menubar.View.js';
import { MenubarRender } from './Menubar.Render.js';
import { MenubarHelp } from './Menubar.Help.js';
import { MenubarStatus } from './Menubar.Status.js';

function Menubar( editor ) {

	const container = new UIPanel();
	container.setId( 'menubar' );

	container.add( new MenubarFile( editor ) );
	container.add( new UIButton( '+ 导入' ).setId( 'quick-import' ).onClick( () => editor.importModels() ) );
	container.add( new MenubarEdit( editor ) );
	container.add( new MenubarAdd( editor ) );
	container.add( new MenubarView( editor ) );
	container.add( new MenubarRender( editor ) );
	container.add( new MenubarHelp( editor ) );

	container.add( new MenubarStatus( editor ) );

	container.dom.querySelectorAll( '.menu > .title, .option' ).forEach( element => {
		element.tabIndex = 0;
		element.setAttribute( 'role', element.classList.contains( 'title' ) ? 'button' : 'menuitem' );
		element.addEventListener( 'keydown', event => {
			if ( event.key === 'Escape' ) document.activeElement.blur();
			if ( event.key === 'Enter' || event.key === ' ' ) { event.preventDefault(); element.click(); }
		} );
		if ( element.classList.contains( 'submenu-title' ) ) {
			element.addEventListener( 'focus', () => element.dispatchEvent( new MouseEvent( 'mouseover' ) ) );
			element.addEventListener( 'focusout', event => { if ( !element.contains(event.relatedTarget) ) element.dispatchEvent( new MouseEvent( 'mouseout' ) ); } );
		}
	} );
	return container;

}

export { Menubar };
