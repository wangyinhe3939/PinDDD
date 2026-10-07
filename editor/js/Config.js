function Config() {

	const name = 'pinddd-creator-editor';

	const storage = {
		'language': 'zh',
		'canvas/gridSize': 10,
		'canvas/snap': 0.1,
		'canvas/snapEnabled': true,
		'canvas/movementMode': 'screen',

		'autosave': true,

		'project/title': '',
		'project/editable': false,
		'project/vr': false,

		'project/camera': 'perspective',

		'project/renderer/type': 'WebGLRenderer',
		'project/renderer/antialias': true,
		'project/renderer/shadows': true,
		'project/renderer/shadowType': 1, // PCF
		'project/renderer/toneMapping': 7, // NeutralToneMapping
		'project/renderer/toneMappingExposure': 1,

		'settings/history': false,

		'settings/shortcuts/undo': 'z',
		'settings/shortcuts/focus': 'f',
		'settings/shortcuts/perspective': 'p',
		'settings/shortcuts/orthographic': 'o',
		'settings/shortcuts/selectAll': 'a'
	};

	if ( window.localStorage[ name ] === undefined ) {

		window.localStorage[ name ] = JSON.stringify( storage );

	} else {

		const data = JSON.parse( window.localStorage[ name ] );

		for ( const key in data ) {

			storage[ key ] = data[ key ];

		}

	}

	return {

		getKey: function ( key ) {

			return storage[ key ];

		},

		setKey: function () { // key, value, key, value ...

			for ( let i = 0, l = arguments.length; i < l; i += 2 ) {

				storage[ arguments[ i ] ] = arguments[ i + 1 ];

			}

			window.localStorage[ name ] = JSON.stringify( storage );

			console.log( '[' + /\d\d\:\d\d\:\d\d/.exec( new Date() )[ 0 ] + ']', 'Saved config to LocalStorage.' );

		},

		clear: function () {

			delete window.localStorage[ name ];

		}

	};

}

export { Config };
