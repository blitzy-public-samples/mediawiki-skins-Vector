/**
 * Facade-level tests for `resources/skins.vector.js/popupNotification.js`.
 *
 * The notification module exists to keep whatever renders a notification out of sight of
 * its caller, so this suite only ever calls its four public functions — `add`, `show`,
 * `hide` and `hideAll` — and only ever observes what a reader would see: the notification
 * on the page. Nothing here reads the module's registry, unwraps a handle or inspects the
 * component behind it, because a test that did would fail the next time the implementation
 * changed even though nothing a caller relies on had. The component has its own suite;
 * assertions about its props and its markup belong there rather than here.
 *
 * The module that `add()` loads on demand is the real one. That is what makes these tests
 * worth running: every transition below travels the whole way from a public call to a
 * rendered element and back, so a break anywhere along that path fails a test here.
 *
 * BLITZY [BEHAVIOUR]: the component library closes a popover on any `mousedown` or
 * `focusin` outside the popover and its anchor, and offers no prop to switch that off. A
 * notification created with `timeout === false` therefore no longer survives a click
 * elsewhere on the page, which is protection the widget it replaces did give it through
 * `autoClose: false`. No library affordance restores it, so the change is recorded here
 * and asserted as it now is by 'add anchors the notification to the container it was
 * given' rather than worked around. Flagged for review.
 */

// MediaWiki's own build of Vue carries one function the published package does not:
// `createMwApp`, added by core's `resources/src/vue/index.js` to install its error handler,
// its i18n plugin and the shared teleport destination. The notification module creates its
// application with it, so it is supplied here. It is declared as a module factory rather
// than assigned once because `jest.resetModules()` below replaces the framework instance
// between tests, and the factory then runs again for the replacement.
jest.mock( 'vue', () => {
	const vue = jest.requireActual( 'vue' );
	return Object.assign( {}, vue, { createMwApp: vue.createApp } );
} );

// `skins.vector.notification.codex` is a ResourceLoader module name rather than a path, so
// nothing on disk answers to it and it has to be registered before it can be required. It
// is registered as an alias for the real module, not as a substitute for it: a stand-in
// would leave every assertion below describing the stand-in instead of the notification the
// skin actually ships, and the component library is never stubbed for the same reason.
jest.mock(
	'skins.vector.notification.codex',
	() => require( '../../resources/skins.vector.notification.codex/index.js' ),
	{ virtual: true }
);

const popUpNotification = require( '../../resources/skins.vector.js/popupNotification.js' );

/**
 * The element the notification module names as its teleport destination.
 *
 * Resolved through `require` on each call rather than looked up by id, because
 * `jest.resetModules()` in `afterEach` re-evaluates the module that owns the element and so
 * produces a fresh one; resolving it the same way the notification module resolves it is
 * what keeps a test looking at the destination its own notification was sent to.
 *
 * @return {HTMLElement}
 */
function teleportTarget() {
	return require( 'mediawiki.page.ready' ).teleportTarget;
}

/**
 * Waits for the framework to apply a pending render, so that an assertion about the page
 * sees the notification's new state rather than its previous one.
 *
 * Resolved freshly for the same reason as the destination above: only the current framework
 * instance's scheduler knows about a render queued during this test.
 *
 * @return {Promise<void>}
 */
function painted() {
	return require( 'vue' ).nextTick();
}

/**
 * The rendered notification matching `selector`, or `null` when it is not on the page.
 *
 * The default selects on the skin's own class, which every notification carries. Passing a
 * caller-supplied class instead is how a test that has more than one notification open
 * tells them apart.
 *
 * @param {string} [selector]
 * @return {HTMLElement|null}
 */
function renderedNotification( selector = '.vector-popup-notification' ) {
	return /** @type {HTMLElement|null} */ ( teleportTarget().querySelector( selector ) );
}

/**
 * Whether a notification is on the page at all.
 *
 * The library removes the whole notification from the document when it closes and builds it
 * again when it opens, so presence is the visibility state and there is nothing else to
 * read.
 *
 * @param {string} [selector]
 * @return {boolean}
 */
function showing( selector ) {
	return renderedNotification( selector ) !== null;
}

/**
 * A container to anchor a notification to, attached to the page as the dropdown container
 * the skin passes in production is.
 *
 * @return {HTMLElement}
 */
function anchorContainer() {
	const container = document.createElement( 'div' );
	document.body.appendChild( container );
	return container;
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
		// Left calling through rather than silenced: a warning still has to be visible in
		// the run's output, and every test asserts below that none was produced.
		jest.spyOn( global.console, 'warn' );
		jest.spyOn( global.console, 'error' );
		testMessage = 'test message';
		vectorPopupClass = 'vector-popup-notification';
		// The module never discards a notification, so one added by an earlier test is
		// still registered here. Closing them all is what keeps these tests independent of
		// each other, and it is also the only place an empty registry is swept, which must
		// stay silent. Each test still uses an id of its own, because a shared id would
		// resolve to the earlier test's notification instead of building a new one.
		popUpNotification.hideAll();
	} );

	afterEach( () => {
		// The notification path has to stay quiet: a warning from the library — most
		// easily earned by mounting without an anchor — is a regression in its own right,
		// so no test in this suite is allowed to produce one.
		expect( global.console.warn ).not.toHaveBeenCalled();
		expect( global.console.error ).not.toHaveBeenCalled();
		jest.useRealTimers();
		jest.resetModules();
	} );

	test( 'exports exactly add, hide, hideAll and show', () => {
		// The four names and their argument counts are the whole of the contract the skin
		// depends on, so they are pinned here: a rename, an addition or a reordering of the
		// required arguments fails this test rather than a caller.
		expect( Object.keys( popUpNotification ).sort() ).toEqual( [ 'add', 'hide', 'hideAll', 'show' ] );
		expect( popUpNotification.add.length ).toBe( 3 );
		expect( popUpNotification.show.length ).toBe( 1 );
		expect( popUpNotification.hide.length ).toBe( 1 );
		expect( popUpNotification.hideAll.length ).toBe( 0 );
	} );

	test( 'add loads the notification module on demand rather than on page view', async () => {
		await popUpNotification.add( anchorContainer(), testMessage, 'lazy-id' );
		// Requested by name from inside add(), which is the only route to it: the module is
		// listed in no skin's scripts or styles, so a page view on which nothing is ever
		// unpinned never asks for it.
		expect( mw.loader.using ).toHaveBeenCalledTimes( 1 );
		expect( mw.loader.using ).toHaveBeenCalledWith( 'skins.vector.notification.codex' );
	} );

	test( 'add returns a native promise even though the loader answers with a foreign one', () => {
		// The loader really does answer with a jQuery promise, so the module wraps it. The
		// wrap is only observable because the loader's answer is a thenable rather than a
		// native promise, so a minimal thenable stands in for it and the assertion stays
		// independent of jQuery.
		const foreignPromise = { then: ( onFulfilled ) => onFulfilled() };
		expect( foreignPromise ).not.toBeInstanceOf( Promise );
		jest.spyOn( mw.loader, 'using' ).mockImplementation( () => foreignPromise );

		const result = popUpNotification.add(
			anchorContainer(),
			testMessage,
			'native-promise-id'
		);
		expect( result ).toBeInstanceOf( Promise );
		// None of the methods that only a jQuery promise has, so a caller cannot come to
		// depend on one reaching them.
		expect( result.done ).toBeUndefined();
		expect( result.fail ).toBeUndefined();
		expect( result.always ).toBeUndefined();
		expect( result.state ).toBeUndefined();
		return result;
	} );

	test( 'add resolves with an opaque handle carrying only the notification id', async () => {
		const handle = await popUpNotification.add(
			anchorContainer(),
			testMessage,
			'opaque-id'
		);
		expect( Object.keys( handle ) ).toEqual( [ 'id' ] );
		expect( handle.id ).toBe( 'opaque-id' );
		// Nothing that renders the notification is reachable through the handle, and
		// neither is anything the widget this replaces exposed, so no caller can have come
		// to depend on either.
		[ 'app', 'host', 'setOpen', 'isOpen', '$element', 'visible' ].forEach( ( internal ) => {
			expect( handle[ internal ] ).toBeUndefined();
		} );
	} );

	test( 'add creates a notification that show renders into the skin\'s teleport destination', async () => {
		const handle = await popUpNotification.add(
			anchorContainer(),
			testMessage,
			'render-id'
		);
		// Created, but not yet shown: add() builds the notification and show() reveals it.
		expect( showing() ).toBe( false );

		// Shown with no timer of its own, as most of the tests below do: what is under
		// test here is the notification, and a pending timer would be one more thing able
		// to close it in the middle of an assertion. The timer has tests of its own.
		popUpNotification.show( handle, false );
		await painted();
		const notification = renderedNotification();
		expect( notification ).not.toBeNull();
		expect( notification.textContent ).toContain( testMessage );
		// Sent to the destination the skin names, rather than to the page root the library
		// falls back to when no destination is provided. That destination carries the
		// skin's body styling, so anything rendered anywhere else would be unstyled.
		expect( notification.parentElement ).toBe( teleportTarget() );
	} );

	test( 'add renders the message as text, never as markup', async () => {
		const handle = await popUpNotification.add(
			anchorContainer(),
			'<b>not markup</b>',
			'message-id'
		);
		popUpNotification.show( handle, false );
		await painted();
		const notification = renderedNotification();
		expect( notification.textContent ).toContain( '<b>not markup</b>' );
		// Interpolated rather than injected, preserving the text-only semantics the widget
		// this replaces had: a message is a message, never a fragment of a page.
		expect( notification.querySelector( 'b' ) ).toBeNull();
	} );

	test( 'add applies caller-supplied classes alongside vector-popup-notification', async () => {
		// Live API with no production exercise at all — the skin's own call site passes
		// three of the six arguments — so this test is the only thing protecting it.
		const handle = await popUpNotification.add(
			anchorContainer(),
			testMessage,
			'classes-id',
			[ 'extra-class', 'another-class' ]
		);
		popUpNotification.show( handle, false );
		await painted();
		const notification = renderedNotification();
		expect( notification.classList.contains( vectorPopupClass ) ).toBe( true );
		expect( notification.classList.contains( 'extra-class' ) ).toBe( true );
		expect( notification.classList.contains( 'another-class' ) ).toBe( true );
		// Alongside rather than instead of: all of them land on the same element the
		// library puts its own class on, so the skin's stylesheet keeps matching what the
		// library renders.
		expect( notification.classList.contains( 'cdx-popover' ) ).toBe( true );
	} );

	test( 'add anchors the notification to the container it was given', async () => {
		const container = anchorContainer();
		const withinContainer = document.createElement( 'button' );
		container.appendChild( withinContainer );
		const elsewhere = document.createElement( 'button' );
		document.body.appendChild( elsewhere );

		const onDismiss = jest.fn();
		const handle = await popUpNotification.add(
			container,
			testMessage,
			'anchor-id',
			[],
			false,
			onDismiss
		);
		popUpNotification.show( handle, false );
		await painted();
		expect( showing() ).toBe( true );

		// Pressing inside the container leaves the notification alone. That is only true
		// if the container reached the library as the element the notification is anchored
		// to, which makes this the observable evidence that it did — the anchor leaves no
		// other trace in the page.
		withinContainer.dispatchEvent( new window.MouseEvent( 'mousedown', { bubbles: true } ) );
		await painted();
		expect( showing() ).toBe( true );
		expect( onDismiss ).not.toHaveBeenCalled();

		// Pressing anywhere else dismisses it, even though this notification asked to wait
		// for the reader. See the note at the top of this file: that is the library's own
		// behaviour, it cannot be switched off, and it is asserted here as it is rather
		// than worked around.
		elsewhere.dispatchEvent( new window.MouseEvent( 'mousedown', { bubbles: true } ) );
		await painted();
		expect( showing() ).toBe( false );
		expect( onDismiss ).toHaveBeenCalledTimes( 1 );
	} );

	test( 'add tracks a notification under the id it was given, and tracks nothing without one', async () => {
		const container = anchorContainer();
		const tracked = await popUpNotification.add( container, testMessage, 'tracked-id', [ 'tracked-note' ] );
		const untracked = await popUpNotification.add( container, testMessage, '', [ 'untracked-note' ] );
		popUpNotification.show( tracked, false );
		popUpNotification.show( untracked, false );
		await painted();
		expect( showing( '.tracked-note' ) ).toBe( true );
		expect( showing( '.untracked-note' ) ).toBe( true );

		// A sweep reaches only what the module tracks, and it tracks only what was given
		// an id to track it under.
		popUpNotification.hideAll();
		await painted();
		expect( showing( '.tracked-note' ) ).toBe( false );
		expect( showing( '.untracked-note' ) ).toBe( true );

		// Still perfectly usable through its own handle. Closed here as well, so that a
		// notification no sweep can reach does not outlive the test that created it.
		popUpNotification.hide( untracked );
		await painted();
		expect( showing( '.untracked-note' ) ).toBe( false );
	} );

	test( 'add treats a numeric timeout as self-dismissing and false as waiting for the reader', async () => {
		const container = anchorContainer();
		const transient = await popUpNotification.add( container, testMessage, 'transient-id', [ 'transient-note' ], 4000 );
		const persistent = await popUpNotification.add( container, testMessage, 'persistent-id', [ 'persistent-note' ], false );
		popUpNotification.show( transient, false );
		popUpNotification.show( persistent, false );
		await painted();

		// Only the notification that waits for the reader offers a way to dismiss it, and
		// offering one is what gives it a header at all — the same conditional header the
		// widget this replaces produced. What each was given as its timeout is the only
		// difference between them, so it is the only thing that can account for this.
		expect( renderedNotification( '.transient-note' ).querySelector( '.cdx-popover__header' ) ).toBeNull();
		const header = renderedNotification( '.persistent-note' ).querySelector( '.cdx-popover__header' );
		expect( header ).not.toBeNull();
		expect( header.querySelector( '.cdx-popover__header__close-button' ) ).not.toBeNull();
	} );

	test( 'add defaults classes, timeout and dismissal when given only the three arguments the skin passes', async () => {
		const handle = await popUpNotification.add( anchorContainer(), testMessage, 'defaults-id' );
		popUpNotification.show( handle, false );
		await painted();
		const notification = renderedNotification();

		// Classes default to none, so the rendered class list is the library's own class
		// and the skin's, and nothing else.
		expect( notification.className ).toBe( `cdx-popover ${ vectorPopupClass }` );
		// The timeout defaults to a number rather than to false, so this notification
		// dismisses itself and offers the reader no dismiss button of its own.
		expect( notification.querySelector( '.cdx-popover__header' ) ).toBeNull();
		// Dismissal defaults to a callback that does nothing, so closing a notification
		// nobody asked to be told about is uneventful.
		expect( () => popUpNotification.hide( handle ) ).not.toThrow();
		await painted();
		expect( showing() ).toBe( false );
	} );

	test( 'add keeps one notification per id and hands back the same handle again', async () => {
		const container = anchorContainer();
		const first = await popUpNotification.add( container, testMessage, 'one-per-id', [ 'first-add' ] );
		const second = await popUpNotification.add( container, 'a different message', 'one-per-id', [ 'second-add' ] );
		expect( second ).toBe( first );

		popUpNotification.show( first, false );
		await painted();
		// Nothing was built for the second call: the one notification on the page is still
		// the first call's, with the first call's message and the first call's classes.
		expect( showing( '.first-add' ) ).toBe( true );
		expect( showing( '.second-add' ) ).toBe( false );
		expect( renderedNotification( '.first-add' ).textContent ).toContain( testMessage );
		expect( renderedNotification( '.first-add' ).textContent ).not.toContain( 'a different message' );
	} );

	test( 'show opens the notification', async () => {
		const handle = await popUpNotification.add( anchorContainer(), testMessage, 'show-id' );
		expect( showing() ).toBe( false );
		popUpNotification.show( handle, false );
		await painted();
		expect( showing() ).toBe( true );
	} );

	test( 'show closes the notification again after the default 4000 ms', async () => {
		jest.useFakeTimers();
		const handle = await popUpNotification.add( anchorContainer(), testMessage, 'auto-close-id' );
		popUpNotification.show( handle );
		await painted();
		expect( showing() ).toBe( true );

		// Four seconds exactly, defaulted by show() itself, and owned by the notification
		// module rather than by the library: the library has no notion of a timer.
		jest.advanceTimersByTime( 3999 );
		await painted();
		expect( showing() ).toBe( true );
		jest.advanceTimersByTime( 1 );
		await painted();
		expect( showing() ).toBe( false );
	} );

	test( 'show honours an explicit timeout', async () => {
		jest.useFakeTimers();
		const handle = await popUpNotification.add( anchorContainer(), testMessage, 'explicit-timeout-id' );
		popUpNotification.show( handle, 1000 );
		await painted();
		jest.advanceTimersByTime( 999 );
		await painted();
		expect( showing() ).toBe( true );
		jest.advanceTimersByTime( 1 );
		await painted();
		expect( showing() ).toBe( false );
	} );

	test( 'show starts no timer when the reader must dismiss the notification themselves', async () => {
		jest.useFakeTimers();
		const handle = await popUpNotification.add( anchorContainer(), testMessage, 'no-timer-id', [], false );
		popUpNotification.show( handle, false );
		await painted();
		jest.advanceTimersByTime( 60000 );
		await painted();
		expect( showing() ).toBe( true );
	} );

	test( 'show called again starts a further timer without cancelling the first', async () => {
		jest.useFakeTimers();
		const handle = await popUpNotification.add( anchorContainer(), testMessage, 'stacked-timer-id' );
		popUpNotification.show( handle, 1000 );
		popUpNotification.show( handle, 5000 );
		await painted();

		// Long-standing behaviour, preserved deliberately rather than corrected: the
		// earlier timer is still pending and still closes the notification.
		jest.advanceTimersByTime( 1000 );
		await painted();
		expect( showing() ).toBe( false );
	} );

	test( 'show keeps collision handling active for as long as the notification is open', async () => {
		const handle = await popUpNotification.add( anchorContainer(), testMessage, 'collision-id' );

		// There is no method to call. The library positions the notification with a
		// floating engine whose collision middleware — an offset, a flip onto the opposite
		// side, a size clamp against the viewport and an arrow placement — is applied for
		// as long as the notification is mounted, and re-applied as the page changes
		// underneath it. What that leaves in the page is a positioned notification and a
		// positioned arrow, so their presence is what "collision handling is on" means
		// here. Asserted twice, because it has to hold on every open and not only the
		// first: the notification is torn out of the page when it closes and built again
		// when it reopens, and the engine has to come back with it.
		for ( let opened = 0; opened < 2; opened++ ) {
			popUpNotification.show( handle, false );
			await painted();
			const notification = renderedNotification();
			expect( notification ).not.toBeNull();
			expect( notification.style.position ).toBe( 'absolute' );
			expect( notification.style.transform ).toMatch( /^translate\(/ );
			const arrow = notification.querySelector( '.cdx-popover__arrow' );
			expect( arrow ).not.toBeNull();
			expect( arrow.getAttribute( 'style' ) ).toBeTruthy();

			popUpNotification.hide( handle );
			await painted();
			expect( showing() ).toBe( false );
		}
	} );

	test( 'show reopens a notification that has already been dismissed', async () => {
		// The module never discards a notification, so an id keeps resolving to the same
		// one for the life of the page and showing it again has to work rather than build a
		// replacement.
		const handle = await popUpNotification.add( anchorContainer(), testMessage, 'reopen-id' );
		popUpNotification.show( handle, false );
		await painted();
		popUpNotification.hide( handle );
		await painted();
		expect( showing() ).toBe( false );

		popUpNotification.show( handle, false );
		await painted();
		expect( showing() ).toBe( true );
		expect( renderedNotification().textContent ).toContain( testMessage );
	} );

	test( 'hide closes the notification', async () => {
		const handle = await popUpNotification.add( anchorContainer(), testMessage, 'hide-id' );
		popUpNotification.show( handle, false );
		await painted();
		expect( showing() ).toBe( true );
		popUpNotification.hide( handle );
		await painted();
		expect( showing() ).toBe( false );
	} );

	test( 'show and hide leave a handle this module never issued alone', async () => {
		// Nothing addresses a handle the module did not hand out, so both calls have
		// nothing to act on. Failing safe rather than throwing matters because the handle
		// is the only thing a caller holds.
		const stranger = { id: 'never-added' };
		expect( () => popUpNotification.show( stranger ) ).not.toThrow();
		expect( () => popUpNotification.hide( stranger ) ).not.toThrow();
		await painted();
		expect( showing() ).toBe( false );
	} );

	test( 'hideAll hides every tracked notification', async () => {
		const container = anchorContainer();
		const first = await popUpNotification.add( container, testMessage, 'hide-all-first', [ 'first-note' ] );
		const second = await popUpNotification.add( container, testMessage, 'hide-all-second', [ 'second-note' ] );
		popUpNotification.show( first, false );
		popUpNotification.show( second, false );
		await painted();
		expect( showing( '.first-note' ) ).toBe( true );
		expect( showing( '.second-note' ) ).toBe( true );

		popUpNotification.hideAll();
		await painted();
		expect( showing( '.first-note' ) ).toBe( false );
		expect( showing( '.second-note' ) ).toBe( false );
	} );

	test( 'hideAll neither fails nor dismisses anything when nothing is open', async () => {
		const onDismiss = jest.fn();
		await popUpNotification.add( anchorContainer(), testMessage, 'silent-sweep-id', [], 4000, onDismiss );
		expect( () => popUpNotification.hideAll() ).not.toThrow();
		await painted();
		expect( onDismiss ).not.toHaveBeenCalled();
		expect( showing() ).toBe( false );
	} );

	test( 'onDismiss runs once for every real close and not at all for a redundant one', async () => {
		jest.useFakeTimers();
		const onDismiss = jest.fn();
		const handle = await popUpNotification.add(
			anchorContainer(),
			testMessage,
			'dismiss-id',
			[],
			4000,
			onDismiss
		);

		// Closed by the timer the notification module owns.
		popUpNotification.show( handle );
		await painted();
		jest.advanceTimersByTime( 4000 );
		await painted();
		expect( showing() ).toBe( false );
		expect( onDismiss ).toHaveBeenCalledTimes( 1 );

		// Closed by the module directly.
		popUpNotification.show( handle, false );
		await painted();
		popUpNotification.hide( handle );
		await painted();
		expect( onDismiss ).toHaveBeenCalledTimes( 2 );

		// Closed by a sweep.
		popUpNotification.show( handle, false );
		await painted();
		popUpNotification.hideAll();
		await painted();
		expect( onDismiss ).toHaveBeenCalledTimes( 3 );

		// Closed again by every route, with nothing left to close. None of these is a
		// dismissal, so none of them reports one — which is what stops a sweep over
		// notifications that are already hidden from telling every caller it dismissed
		// something.
		popUpNotification.hide( handle );
		popUpNotification.hideAll();
		await painted();
		expect( onDismiss ).toHaveBeenCalledTimes( 3 );
		expect( showing() ).toBe( false );
	} );

	test( 'the library\'s own dismiss button closes a notification the reader must dismiss', async () => {
		const onDismiss = jest.fn();
		const handle = await popUpNotification.add(
			anchorContainer(),
			testMessage,
			'close-button-id',
			[],
			false,
			onDismiss
		);
		popUpNotification.show( handle, false );
		await painted();
		const button = renderedNotification().querySelector( '.cdx-popover__header__close-button' );
		expect( button ).not.toBeNull();

		// The button is the library's, and it is labelled from the library's own message
		// keys, so the skin introduces no message of its own for it.
		expect( button.getAttribute( 'aria-label' ) ).toBeTruthy();
		/** @type {HTMLElement} */ ( button ).click();
		await painted();
		expect( showing() ).toBe( false );
		expect( onDismiss ).toHaveBeenCalledTimes( 1 );
	} );

	test( 'Escape dismisses an open notification', async () => {
		const onDismiss = jest.fn();
		const handle = await popUpNotification.add(
			anchorContainer(),
			testMessage,
			'escape-id',
			[],
			false,
			onDismiss
		);
		popUpNotification.show( handle, false );
		await painted();
		expect( showing() ).toBe( true );

		// Keyboard dismissal comes from the library and needs nothing from the skin. It is
		// asserted because it is a gain rather than a parity: the widget this replaces
		// suppressed it for a notification that waits for the reader, so this is new
		// behaviour and worth knowing about if it ever goes away.
		document.dispatchEvent( new window.KeyboardEvent( 'keydown', { key: 'Escape' } ) );
		await painted();
		expect( showing() ).toBe( false );
		expect( onDismiss ).toHaveBeenCalledTimes( 1 );
	} );

	test( 'a notification is created, shown and dismissed without a warning', async () => {
		// The whole lifecycle in one place, because a warning anywhere along it is a
		// regression: the library warns when it is mounted without an anchor, and the
		// framework warns about a prop it does not like, and neither may reach a reader's
		// console. The assertion itself lives in afterEach, so this test is the lifecycle
		// it applies to.
		jest.useFakeTimers();
		const handle = await popUpNotification.add(
			anchorContainer(),
			testMessage,
			'quiet-id',
			[ 'quiet-note' ],
			4000,
			() => {}
		);
		popUpNotification.show( handle );
		await painted();
		expect( showing( '.quiet-note' ) ).toBe( true );
		popUpNotification.hide( handle );
		await painted();
		expect( showing( '.quiet-note' ) ).toBe( false );
		// Run the pending timer out as well, so the lifecycle this asserts about is a
		// finished one and nothing is left waiting to fire.
		jest.advanceTimersByTime( 4000 );
		await painted();
		expect( showing( '.quiet-note' ) ).toBe( false );
	} );
} );
