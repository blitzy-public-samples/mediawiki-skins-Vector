const popUpNotification = require( '../../resources/skins.vector.js/popupNotification.js' );

/**
 * Stand-in for the `OO.ui.PopupWidget` that the notification module still builds.
 * OOUI is no longer a development dependency, so the widget is reproduced here with
 * only the behaviour this module observes: the message and the caller-supplied
 * classes land on the rendered element, the widget starts hidden, `toggle()` flips
 * `visible` and emits `closing` once per real hide transition, and clipping follows
 * visibility. It disappears together with the OOUI call site when the notification
 * is rebuilt on Codex.
 *
 * @param {Object} config PopupWidget configuration
 * @return {Object} popup widget
 */
function PopupWidgetStub( config ) {
	/** @type {Record<string,Function[]>} */
	const listeners = {};
	const element = document.createElement( 'div' );
	const body = document.createElement( 'div' );

	element.classList.add( 'oo-ui-popupWidget' );
	( config.classes || [] ).forEach( ( className ) => {
		element.classList.add( className );
	} );
	body.classList.add( 'oo-ui-popupWidget-body' );
	if ( config.padded ) {
		body.classList.add( 'oo-ui-popupWidget-body-padded' );
	}
	if ( config.$content ) {
		body.appendChild( config.$content[ 0 ] );
	}
	if ( config.head ) {
		const head = document.createElement( 'div' );
		head.classList.add( 'oo-ui-popupWidget-head' );
		element.appendChild( head );
	}
	element.appendChild( body );
	// Initially hidden, matching the widget being stood in for.
	element.classList.add( 'oo-ui-element-hidden' );

	const widget = {
		visible: false,
		clipping: false,
		autoClose: !!config.autoClose,
		container: config.container,
		$element: {
			0: element,
			length: 1,
			appendTo: ( target ) => {
				target.appendChild( element );
				return widget.$element;
			}
		},
		on: ( event, handler ) => {
			listeners[ event ] = ( listeners[ event ] || [] ).concat( handler );
			return widget;
		},
		emit: ( event ) => {
			( listeners[ event ] || [] ).forEach( ( handler ) => {
				handler();
			} );
		},
		isVisible: () => widget.visible,
		toggleClipping: ( clip ) => {
			widget.clipping = !!clip;
			return widget;
		},
		toggle: ( show ) => {
			const next = show === undefined ? !widget.visible : !!show;
			// Only a real state change notifies, so hiding a hidden widget is silent.
			if ( next !== widget.visible ) {
				widget.visible = next;
				element.classList.toggle( 'oo-ui-element-hidden', !next );
				widget.toggleClipping( next );
				widget.emit( next ? 'ready' : 'closing' );
			}
			return widget;
		}
	};

	return widget;
}

global.OO = { ui: { PopupWidget: PopupWidgetStub } };

/**
 * @type {string}
 */
let testId;

/**
 * @type {string}
 */
let testMessage;

/**
 * @type {string}
 */
let vectorPopupClass;

/**
 * @type {Record<string,OoUiPopupWidget>}
 */
let activeNotification;

describe( 'Popup Notification', () => {
	beforeEach( () => {
		global.window.matchMedia = jest.fn( () => ( {} ) );
		document.body.style = 'direction: ltr';
		jest.spyOn( mw.loader, 'using' )
			.mockImplementation( () => Promise.resolve() );
		testId = 'test-id';
		testMessage = 'test message';
		vectorPopupClass = 'vector-popup-notification';
		activeNotification = [];
		popUpNotification.hideAll();
	} );

	afterEach( () => {
		jest.resetModules();
	} );

	// test add function
	test( 'add', async () => {
		const popupWidget = await popUpNotification.add(
			document.body,
			testMessage,
			testId,
			[],
			4000,
			() => {}
		);
		activeNotification[ testId ] = popupWidget;
		expect( activeNotification[ testId ] ).toBeDefined();
		expect( activeNotification[ testId ].$element ).toBeDefined();
		expect( activeNotification[ testId ].$element[ 0 ].textContent )
			.toContain( testMessage );
		expect( activeNotification[ testId ].$element[ 0 ].classList
			.contains( vectorPopupClass ) ).toBe( true );
	} );

	// test hide function
	test( 'hide', async () => {
		const popupWidget = await popUpNotification.add(
			document.body,
			testMessage,
			testId,
			[],
			4000,
			() => {}
		);
		activeNotification[ testId ] = popupWidget;
		expect( activeNotification[ testId ].visible ).toBe( false );
		popUpNotification.show( activeNotification[ testId ] );
		expect( activeNotification[ testId ].visible ).toBe( true );
		popUpNotification.hide( activeNotification[ testId ] );
		expect( activeNotification[ testId ].visible ).toBe( false );
	} );

	// test show function
	test( 'show', async () => {
		const popupWidget = await popUpNotification.add(
			document.body,
			testMessage,
			testId,
			[],
			4000,
			() => {}
		);
		activeNotification[ testId ] = popupWidget;
		expect( activeNotification[ testId ].visible ).toBe( false );
		popUpNotification.show( activeNotification[ testId ] );
		expect( activeNotification[ testId ].visible ).toBe( true );
	} );

	// test hideAll function
	test( 'hideAll', async () => {
		const popupWidget = await popUpNotification.add(
			document.body,
			testMessage,
			testId,
			[],
			4000,
			() => {}
		);
		activeNotification[ testId ] = popupWidget;
		expect( activeNotification[ testId ].visible ).toBe( false );
		popUpNotification.show( activeNotification[ testId ] );
		expect( activeNotification[ testId ].visible ).toBe( true );
		popUpNotification.hideAll();
		expect( activeNotification[ testId ].visible ).toBe( false );
	} );
} );
