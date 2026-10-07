import { UIPanel, UIRow, UISpan, UIText, UINumber, UICheckbox } from './libs/ui.js';

import { SidebarSection } from './Sidebar.Section.js';

import { SidebarSettingsShortcuts } from './Sidebar.Settings.Shortcuts.js';
import { SidebarSettingsHistory } from './Sidebar.Settings.History.js';

function SidebarSettings( editor ) {

	const config = editor.config;

	const container = new UISpan();

	const settings = new UIPanel();
	settings.setBorderTop( '0' );
	settings.setPaddingTop( '20px' );
	container.add( settings );

	function numberRow( label, key, min, max, change ) {
		const input = new UINumber( config.getKey( key ) ).setRange( min, max ).setWidth( '100px' ).onChange( function () {
			const value = this.getValue();
			if ( ! Number.isFinite( value ) ) { this.setValue( config.getKey( key ) ); return; }
			config.setKey( key, value ); change( value );
		} );
		input.dom.setAttribute( 'aria-label', label );
		settings.add( new UIRow().add( new UIText( label ).setClass( 'Label' ), input ) );
	}
	numberRow( '网格大小（米）', 'canvas/gridSize', 1, 100, value => editor.signals.gridSizeChanged.dispatch( value ) );
	numberRow( '吸附步长（米）', 'canvas/snap', 0.001, 10, value => {
		editor.signals.snapChanged.dispatch( config.getKey( 'canvas/snapEnabled' ) ? value : null );
	} );
	const enabled = new UICheckbox( config.getKey( 'canvas/snapEnabled' ) ).onChange( function () {
		config.setKey( 'canvas/snapEnabled', this.getValue() );
		editor.signals.snapChanged.dispatch( this.getValue() ? config.getKey( 'canvas/snap' ) : null );
	} );
	enabled.dom.setAttribute( 'aria-label', '水平网格吸附' );
	settings.add( new UIRow().add( new UIText( '水平网格吸附' ).setClass( 'Label' ), enabled ) );
	const intensity = new UINumber( editor.scene.environmentIntensity ).setRange( 0, 10 ).setWidth( '100px' ).onChange( function () {
		const value = this.getValue();
		if ( ! Number.isFinite( value ) ) { this.setValue( editor.scene.environmentIntensity ); return; }
		editor.scene.environmentIntensity = value; editor.signals.objectChanged.dispatch( editor.scene );
	} );
	intensity.dom.setAttribute( 'aria-label', '环境光强度' );
	settings.add( new UIRow().add( new UIText( '环境光强度' ).setClass( 'Label' ), intensity ) );
	editor.signals.sceneGraphChanged.add( () => intensity.setValue( editor.scene.environmentIntensity ) );
	settings.add( new UIRow().add( new UIText( '表面高度始终自动吸附 · 水平网格可关闭' ) ) );

	//

	container.add( new SidebarSection( 'shortcut-settings-section', '自定义按键', new SidebarSettingsShortcuts( editor ), 'preferences-advanced' ) );
	container.add( new SidebarSection( 'history-section', '操作历史', new SidebarSettingsHistory( editor ), 'preferences-advanced' ) );

	return container;

}

export { SidebarSettings };
