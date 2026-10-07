import { createIcon } from './Icons.js';

class SceneContextMenu {
	constructor( editor, placement ) {
		this.editor = editor; this.placement = placement; this.object = null;
		this.dom = document.createElement( 'div' );
		this.dom.id = 'scene-context-menu'; this.dom.hidden = true;
		this.dom.setAttribute( 'role', 'menu' ); this.dom.setAttribute( 'aria-label', '模型操作' );
		document.body.appendChild( this.dom );
		this.dom.addEventListener( 'contextmenu', e => e.preventDefault() );
		document.addEventListener( 'pointerdown', e => { if ( this.object && ! this.dom.contains( e.target ) ) this.hide(); }, true );
		document.addEventListener( 'keydown', e => {
			if ( ! this.object ) return;
			if ( e.key === 'Tab' ) { this.hide( true ); return; }
			e.stopImmediatePropagation();
			if ( e.key === 'Escape' ) { e.preventDefault(); this.hide( true ); }
			if ( [ 'ArrowDown', 'ArrowUp', 'Home', 'End' ].includes( e.key ) ) {
				e.preventDefault();
				const buttons = [ ...this.dom.querySelectorAll( 'button' ) ];
				const i = buttons.indexOf( document.activeElement );
				const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : ( i + ( e.key === 'ArrowDown' ? 1 : - 1 ) + buttons.length ) % buttons.length;
				buttons[ next ].focus();
			}
		}, true );
		editor.signals.objectSelected.add( o => { if ( this.object && o !== this.object ) this.hide(); } );
		editor.signals.sceneGraphChanged.add( () => { if ( this.object && this.object.parent !== editor.scene ) this.hide(); } );
		editor.signals.startPlayer.add( () => this.hide() );
	}

	show( object, x, y, tree = false ) {
		this.hide(); clearTimeout( this.timer );
		this.editor.select( object ); this.object = object;
		this.dom.replaceChildren();
		const title = document.createElement( 'div' );
		title.className = 'context-title'; title.textContent = object.name || '未命名模型'; this.dom.appendChild( title );
		const items = object === this.editor.camera ? [ [ 'delete', '删除' ], [ 'clone', '复制为场景相机' ] ] : tree ? [
			[ 'delete', '删除' ], [ 'clone', '复制' ],
			[ 'visible', object.visible ? '隐藏' : '显示' ],
			[ 'lock', object.userData.isLocked ? '解锁' : '锁定' ]
		] : [
			[ 'lock', object.userData.isLocked ? '解锁位置' : '锁定位置' ],
			[ 'mirrorX', '水平翻转' ], [ 'mirrorZ', '前后翻转' ], [ 'clone', '原地克隆' ],
			[ 'resetRotation', '旋转归正' ], [ 'ground', '重新贴地' ], [ 'delete', '删除对象' ]
		];
		const icons = {
			delete: 'trash-2', clone: 'copy', visible: object.visible ? 'eye-off' : 'eye',
			lock: object.userData.isLocked ? 'lock-keyhole-open' : 'lock-keyhole',
			mirrorX: 'flip-horizontal-2', mirrorZ: 'flip-vertical-2', resetRotation: 'rotate-ccw', ground: 'arrow-down-to-line'
		};
		for ( const [ action, label ] of items ) {
			const button = document.createElement( 'button' );
			button.type = 'button'; button.append( createIcon( icons[ action ] ), document.createTextNode( label ) ); button.dataset.action = action;
			if ( object === this.editor.camera && action === 'delete' ) button.title = '从物件列表移除工作相机；视口仍可操作，可撤销';
			button.setAttribute( 'role', 'menuitem' ); button.tabIndex = - 1;
			button.addEventListener( 'click', () => { this.hide( true ); this.placement.contextAction( action, object ); } );
			this.dom.appendChild( button );
		}
		this.dom.hidden = false; this.dom.setAttribute( 'aria-hidden', 'false' );
		const r = this.dom.getBoundingClientRect();
		this.dom.style.left = Math.max( 8, Math.min( x, innerWidth - r.width - 8 ) ) + 'px';
		this.dom.style.top = Math.max( 8, Math.min( y, innerHeight - r.height - 8 ) ) + 'px';
		this.dom.classList.add( 'open' ); this.dom.querySelector( 'button' ).focus( { preventScroll: true } );
	}

	hide( restoreFocus = false ) {
		clearTimeout( this.timer ); this.object = null;
		this.dom.classList.remove( 'open' ); this.dom.setAttribute( 'aria-hidden', 'true' );
		if ( restoreFocus ) this.placement.domElement?.focus( { preventScroll: true } );
		this.timer = setTimeout( () => { this.dom.hidden = true; }, 120 );
	}
}
export { SceneContextMenu };
