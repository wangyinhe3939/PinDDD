import * as THREE from 'three';

import { UIPanel, UIText, UIButton } from './libs/ui.js';
import { UIBoolean } from './libs/ui.three.js';

function MenubarStatus( editor ) {

	const strings = editor.strings;

	const container = new UIPanel();
	container.setClass( 'menu right' );

	const autosave = new UIBoolean( editor.config.getKey( 'autosave' ), strings.getKey( 'menubar/status/autosave' ) );
	autosave.text.setColor( '#888' );
	autosave.onChange( function () {

		const value = this.getValue();

		editor.config.setKey( 'autosave', value );

		if ( value === true ) {

			editor.signals.sceneGraphChanged.dispatch();

		}

	} );
	container.add( autosave );

	editor.signals.savingStarted.add( function () {

		autosave.text.setTextDecoration( 'underline' );

	} );

	editor.signals.savingFinished.add( function () {

		autosave.text.setTextDecoration( 'none' );

	} );

	const state = new UIButton( '正在恢复…' ).setId( 'save-status' );
	state.dom.setAttribute( 'role', 'status' ); state.dom.setAttribute( 'aria-live', 'polite' );
	state.onClick( () => editor.session.flush( true ).catch( () => {} ) );
	editor.signals.saveStateChanged.add( ( text, error ) => {
		state.setTextContent( text ); state.dom.title = error ? error.message : '本地恢复副本；点击立即保存';
		state.dom.classList.toggle( 'save-error', Boolean( error ) );
		autosave.text.setTextDecoration( 'none' );
	} );
	container.add( state );

	const version = new UIText( 'Double One DD·万元户' );
	version.setClass( 'title' );
	version.setOpacity( 0.5 );
	container.add( version );

	return container;

}

export { MenubarStatus };
