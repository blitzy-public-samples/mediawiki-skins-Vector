/**
 * Stand-in for the module that renders a notification, reproducing the whole of the
 * contract the notification module depends on and nothing else.
 *
 * The real module creates a Vue application around a Codex popover, which is exercised by
 * the component's own test. What matters here is the boundary: a notification is created
 * once, kept for the life of the page, and driven only through `setOpen`, which ignores a
 * request that would not change anything and reports every real close to the caller's
 * dismiss callback itself. Mirroring that guard is what lets these tests distinguish a
 * genuine dismissal from a redundant one.
 *
 * Because the module is a ResourceLoader module name rather than a path on disk, it is
 * registered as a virtual mock; nothing in the Jest configuration needs to know about it.
 *
 * @param {Object} options as passed by the notification module
 * @return {Object} the private record the notification module keeps
 */
function mockMount( options ) {
	let open = false;

	return {
		setOpen: ( value ) => {
			if ( open === value ) {
				return;
			}
			open = value;
			if ( !value ) {
				options.onDismiss();
			}
		},
		isOpen: () => open,
		host: document.createElement( 'div' ),
		app: {}
	};
}

const mockMountFn = jest.fn( mockMount );

jest.mock(
	'skins.vector.notification.codex',
	() => ( { mount: mockMountFn } ),
	{ virtual: true }
);

const popUpNotification = require( '../../resources/skins.vector.js/popupNotification.js' );

/**
 * The options object the notification module passed on the most recent creation.
 *
 * @return {Object} mount options
 */
function lastOptions() {
	const { calls } = mockMountFn.mock;
	return calls[ calls.length - 1 ][ 0 ];
}

/**
 * The record produced by the most recent creation, used to observe visibility and to
 * simulate the closes the component library owns — its close button, the Escape key and a
 * click outside the notification all arrive as the same state change.
 *
 * @return {Object} notification record
 */
function lastRecord() {
	const { results } = mockMountFn.mock;
	return results[ results.length - 1 ].value;
}

/**
 * @type {string}
 */
let testMessage;

/**
 * @type {string}
 */
let vectorPopupClass;

describe( 'Popup Notification', () => {
	beforeEach( () => {
		global.window.matchMedia = jest.fn( () => ( {} ) );
		document.body.style = 'direction: ltr';
		jest.spyOn( mw.loader, 'using' )
			.mockImplementation( () => Promise.resolve() );
		testMessage = 'test message';
		vectorPopupClass = 'vector-popup-notification';
		// Also the only place an empty registry is swept, which must stay silent.
		popUpNotification.hideAll();
	} );

	afterEach( () => {
		jest.useRealTimers();
		jest.resetModules();
	} );

	test( 'add resolves with a handle for a newly created notification', async () => {
		const handle = await popUpNotification.add(
			document.body,
			testMessage,
			'add-id',
			[],
			4000,
			() => {}
		);
		expect( handle ).toBeTruthy();
		expect( mockMountFn ).toHaveBeenCalledTimes( 1 );
	} );

	test( 'add returns a native promise even when the loader answers with a foreign one', () => {
		// The loader really does answer with a jQuery promise, so the module wraps it.
		// What makes the wrap observable is only that the loader's answer is a thenable
		// rather than a native promise, so a minimal thenable stands in for it here and the
		// assertion stays independent of jQuery.
		const foreignPromise = { then: ( onFulfilled ) => onFulfilled() };
		expect( foreignPromise ).not.toBeInstanceOf( Promise );
		jest.spyOn( mw.loader, 'using' ).mockImplementation( () => foreignPromise );

		const result = popUpNotification.add(
			document.body,
			testMessage,
			'native-promise-id'
		);
		expect( result ).toBeInstanceOf( Promise );
		return result;
	} );

	test( 'add resolves with an opaque handle exposing only the notification id', async () => {
		const handle = await popUpNotification.add(
			document.body,
			testMessage,
			'opaque-id'
		);
		expect( Object.keys( handle ) ).toEqual( [ 'id' ] );
		expect( handle.id ).toBe( 'opaque-id' );
	} );

	test( 'add loads the notification module on demand rather than on page view', async () => {
		await popUpNotification.add( document.body, testMessage, 'lazy-id' );
		expect( mw.loader.using ).toHaveBeenCalledWith( 'skins.vector.notification.codex' );
	} );

	test( 'add anchors the notification to the container it was given', async () => {
		const container = document.createElement( 'div' );
		await popUpNotification.add( container, testMessage, 'container-id' );
		expect( lastOptions().anchor ).toBe( container );
	} );

	test( 'add passes the message through as plain text', async () => {
		await popUpNotification.add( document.body, '<b>not markup</b>', 'message-id' );
		expect( lastOptions().message ).toBe( '<b>not markup</b>' );
	} );

	test( 'add forwards caller-supplied classes untouched, for the component to apply alongside vector-popup-notification', async () => {
		await popUpNotification.add(
			document.body,
			testMessage,
			'classes-id',
			[ 'extra-class', 'another-class' ]
		);
		// Forwarded verbatim: composing the list is the component's job, so pre-composing
		// it here would apply the skin's own class twice.
		expect( lastOptions().classes ).toEqual( [ 'extra-class', 'another-class' ] );
		expect( lastOptions().classes ).not.toContain( vectorPopupClass );
	} );

	test( 'add treats a numeric timeout as self-dismissing and false as persistent', async () => {
		await popUpNotification.add( document.body, testMessage, 'transient-id', [], 4000 );
		expect( lastOptions().persistent ).toBe( false );

		await popUpNotification.add( document.body, testMessage, 'persistent-id', [], false );
		expect( lastOptions().persistent ).toBe( true );
	} );

	test( 'add supplies no title, so no heading is rendered', async () => {
		await popUpNotification.add( document.body, testMessage, 'title-id', [], false );
		expect( lastOptions().title ).toBeUndefined();
	} );

	test( 'add defaults classes, timeout and dismissal when given only three arguments', async () => {
		// The shape every production call site uses.
		await popUpNotification.add( document.body, testMessage, 'defaults-id' );
		expect( lastOptions().classes ).toEqual( [] );
		expect( lastOptions().persistent ).toBe( false );
		expect( typeof lastOptions().onDismiss ).toBe( 'function' );
		expect( () => lastOptions().onDismiss() ).not.toThrow();
	} );

	test( 'add keeps one notification per id and hands back the same handle again', async () => {
		const first = await popUpNotification.add( document.body, testMessage, 'one-per-id' );
		const second = await popUpNotification.add( document.body, 'a different message', 'one-per-id' );
		expect( second ).toBe( first );
		expect( mockMountFn ).toHaveBeenCalledTimes( 1 );
	} );

	test( 'add does not track a notification created without an id, yet still hands back a usable handle', async () => {
		const handle = await popUpNotification.add( document.body, testMessage, '' );
		expect( handle ).toBeTruthy();
		const record = lastRecord();

		popUpNotification.show( handle, false );
		expect( record.isOpen() ).toBe( true );

		// Untracked, so a sweep leaves it alone.
		popUpNotification.hideAll();
		expect( record.isOpen() ).toBe( true );

		popUpNotification.hide( handle );
		expect( record.isOpen() ).toBe( false );
	} );

	test( 'show opens the notification', async () => {
		const handle = await popUpNotification.add( document.body, testMessage, 'show-id' );
		const record = lastRecord();
		expect( record.isOpen() ).toBe( false );
		popUpNotification.show( handle, false );
		expect( record.isOpen() ).toBe( true );
	} );

	test( 'show closes the notification again after the default 4000 ms', async () => {
		jest.useFakeTimers();
		const handle = await popUpNotification.add( document.body, testMessage, 'auto-close-id' );
		const record = lastRecord();
		popUpNotification.show( handle );
		expect( record.isOpen() ).toBe( true );
		jest.advanceTimersByTime( 3999 );
		expect( record.isOpen() ).toBe( true );
		jest.advanceTimersByTime( 1 );
		expect( record.isOpen() ).toBe( false );
	} );

	test( 'show honours an explicit timeout', async () => {
		jest.useFakeTimers();
		const handle = await popUpNotification.add( document.body, testMessage, 'explicit-timeout-id' );
		const record = lastRecord();
		popUpNotification.show( handle, 1000 );
		jest.advanceTimersByTime( 1000 );
		expect( record.isOpen() ).toBe( false );
	} );

	test( 'show starts no timer when the reader must dismiss the notification themselves', async () => {
		jest.useFakeTimers();
		const handle = await popUpNotification.add( document.body, testMessage, 'no-timer-id', [], false );
		const record = lastRecord();
		popUpNotification.show( handle, false );
		jest.advanceTimersByTime( 60000 );
		expect( record.isOpen() ).toBe( true );
	} );

	test( 'show called again starts a further timer without cancelling the first', async () => {
		jest.useFakeTimers();
		const handle = await popUpNotification.add( document.body, testMessage, 'stacked-timer-id' );
		const record = lastRecord();
		popUpNotification.show( handle, 1000 );
		popUpNotification.show( handle, 5000 );
		// Long-standing behaviour, preserved deliberately: the earlier timer still fires.
		jest.advanceTimersByTime( 1000 );
		expect( record.isOpen() ).toBe( false );
	} );

	test( 'hide closes the notification', async () => {
		const handle = await popUpNotification.add( document.body, testMessage, 'hide-id' );
		const record = lastRecord();
		popUpNotification.show( handle, false );
		expect( record.isOpen() ).toBe( true );
		popUpNotification.hide( handle );
		expect( record.isOpen() ).toBe( false );
	} );

	test( 'show and hide leave a handle this module never issued alone', () => {
		const strangerHandle = { id: 'never-added' };
		expect( () => popUpNotification.show( strangerHandle ) ).not.toThrow();
		expect( () => popUpNotification.hide( strangerHandle ) ).not.toThrow();
		expect( mockMountFn ).not.toHaveBeenCalled();
	} );

	test( 'hideAll hides every tracked notification', async () => {
		const first = await popUpNotification.add( document.body, testMessage, 'hide-all-first' );
		const firstRecord = lastRecord();
		const second = await popUpNotification.add( document.body, testMessage, 'hide-all-second' );
		const secondRecord = lastRecord();
		popUpNotification.show( first, false );
		popUpNotification.show( second, false );
		expect( firstRecord.isOpen() ).toBe( true );
		expect( secondRecord.isOpen() ).toBe( true );

		popUpNotification.hideAll();
		expect( firstRecord.isOpen() ).toBe( false );
		expect( secondRecord.isOpen() ).toBe( false );
	} );

	test( 'hideAll neither fails nor dismisses anything when nothing is open', async () => {
		const onDismiss = jest.fn();
		await popUpNotification.add( document.body, testMessage, 'silent-sweep-id', [], 4000, onDismiss );
		expect( () => popUpNotification.hideAll() ).not.toThrow();
		expect( onDismiss ).not.toHaveBeenCalled();
	} );

	test( 'onDismiss runs once per real close, whichever path closed the notification', async () => {
		jest.useFakeTimers();
		const onDismiss = jest.fn();
		const handle = await popUpNotification.add(
			document.body,
			testMessage,
			'dismiss-id',
			[],
			4000,
			onDismiss
		);
		const record = lastRecord();

		// Closed by the timer this module owns.
		popUpNotification.show( handle );
		jest.advanceTimersByTime( 4000 );
		expect( onDismiss ).toHaveBeenCalledTimes( 1 );

		// Closed by this module directly.
		popUpNotification.show( handle, false );
		popUpNotification.hide( handle );
		expect( onDismiss ).toHaveBeenCalledTimes( 2 );

		// Closed by a sweep.
		popUpNotification.show( handle, false );
		popUpNotification.hideAll();
		expect( onDismiss ).toHaveBeenCalledTimes( 3 );

		// Closed by the component library itself — its close button, the Escape key and a
		// click outside the notification all arrive as this same state change.
		popUpNotification.show( handle, false );
		record.setOpen( false );
		expect( onDismiss ).toHaveBeenCalledTimes( 4 );

		// Already closed, by every route: none of these is a dismissal.
		popUpNotification.hide( handle );
		popUpNotification.hideAll();
		record.setOpen( false );
		expect( onDismiss ).toHaveBeenCalledTimes( 4 );
	} );
} );
