import { createIcon } from './Icons.js';
import { UIPanel, UIButton, UIText } from './libs/ui.js';

function Toolbar( editor ) {
	const container = new UIPanel().setId( 'toolbar' );
	const status = new UIText( '自由移动' );
	status.dom.setAttribute( 'role', 'status' );
	status.dom.setAttribute( 'aria-live', 'polite' );
	const place = new UIButton( '确认摆放' ).onClick( () => editor.placement.finish() );
	const cancel = new UIButton( '取消' ).onClick( () => editor.placement.cancel() );
	const rotate = new UIButton( '旋转 15°' ).setId( 'touch-rotate' ).onClick( () => editor.placement.rotate( 1 ) );
	rotate.dom.prepend( createIcon( 'rotate-ccw' ) );
	const shrink = new UIButton( '缩小' ).onClick( () => editor.placement.scale( 0.9 ) );
	const grow = new UIButton( '放大' ).onClick( () => editor.placement.scale( 1.1 ) );
	shrink.dom.title = '整体缩小 10%'; grow.dom.title = '整体放大 10%';
	container.add( rotate, shrink, grow, status, place, cancel );
	editor.signals.placementChanged.add( () => {
		const holding = editor.placement.object !== null;
		const label = '旋转 ' + editor.placement.rotationStep + '°';
		if ( rotate.dom.lastChild.textContent !== label ) rotate.dom.lastChild.textContent = label;
		container.setHidden( ! holding );
		const free = editor.placement.movementMode === 'screen';
		status.setValue( ( free ? '自由移动 · 不吸附' : '吸附摆放' ) + ' · ' + ( editor.placement.valid ? '点击放下' : free ? '移入画布' : '移到摆放表面' ) );
		place.dom.disabled = ! holding || ! editor.placement.valid;
		cancel.dom.disabled = ! holding;
	} );
	place.dom.disabled = true; cancel.dom.disabled = true; container.setHidden( true );
	return container;
}

export { Toolbar };
