/**
 * Component-level tests for the notification a reader is shown after unpinning an element.
 *
 * The unit under test is `resources/skins.vector.notification.codex/PopupNotification.vue`
 * alone, mounted directly against the real design-system library. Nothing here requires
 * `resources/skins.vector.js/popupNotification.js` or the notification module's own entry
 * point, and nothing here depends on the module loader. That is deliberate: this suite has
 * to pass on the commit that introduces the component but has not yet wired it up, so it
 * must not assume the notification module has been cut over. The facade's own behaviour —
 * the registry keyed by notification id, the auto-dismiss timer, the native promise `add()`
 * hands back and the sweep `hideAll()` performs — is asserted in
 * `tests/jest/popupNotification.test.js`, and is not duplicated here. What lives here is the
 * other half: props in, rendered markup and emitted events out.
 *
 * The library is never mocked or stubbed. A stub would make every assertion below vacuous,
 * because what is being checked is precisely how the real component renders and which of its
 * own behaviours reach the notification through it. Assertions are therefore written against
 * the rendered class names the library produces, which is also the contract the skin's own
 * stylesheet matches on.
 *
 * Three findings are recorded rather than worked around:
 *
 * 1. The `hideBackdrop` prop cannot be set. It does not exist in the pinned library version,
 *    so passing it would fall through to the attribute surface and emit a stray
 *    `hidebackdrop` DOM attribute with no framework warning — an actual markup regression —
 *    and in the version that runs in the browser it applies only to a layout this
 *    notification must not use. Satisfying it would require raising the pinned version, which
 *    is out of scope. The verifiable half of that requirement is implemented instead: no
 *    backdrop element renders, asserted below, which holds in both versions. Reported as a
 *    specification / library-version mismatch.
 *
 * 2. A persistent notification loses its protection from an outside click. The popup this
 *    replaces suppressed outside-click dismissal whenever auto-close was off; the library
 *    closes on an outside `mousedown` or `focusin` unconditionally and exposes no prop to
 *    disable it. There is no affordance to restore the old behaviour, so it is not attempted.
 *    The behaviour is pinned by a test below so that it is at least visible and cannot drift
 *    further unnoticed.
 *
 * 3. The rendered notification carries no dialog role and no live region, and the library
 *    manages no focus. Keyboard dismissal is available — Escape closes it, which the popup
 *    this replaces suppressed for the persistent case — but a reader using a screen reader is
 *    not told the notification appeared. Those are library-owned behaviours and the
 *    component's attribute surface is fixed by the notification module's contract, so the
 *    measured surface is asserted as it stands and the gap is reported.
 */

const { mount, flushPromises } = require( '@vue/test-utils' );
const PopupNotification = require( '../../resources/skins.vector.notification.codex/PopupNotification.vue' );
// The same element the notification module's entry point provides as the teleport
// destination, so the destination asserted here is the one production uses rather than a
// look-alike created for the test.
const pageReady = require( 'mediawiki.page.ready' );

/**
 * Injection key the library reads its teleport destination from. Named here, and provided on
 * every mount below, because the destination must never be left to the library's fallback of
 * the document body.
 *
 * @type {string}
 */
const TELEPORT_TARGET_KEY = 'CdxTeleportTarget';

/**
 * Class the skin's own stylesheet matches on. It has to survive alongside the library's class
 * and alongside anything the caller adds.
 *
 * @type {string}
 */
const VECTOR_POPUP_CLASS = 'vector-popup-notification';

/**
 * The auto-dismiss default the notification module applies. The component is expected to know
 * nothing about it; it is used here only to advance the clock far enough to prove that.
 *
 * @type {number}
 */
const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Element the notification is positioned against — the stand-in for the dropdown container
 * the notification module is called with. It is a real element, attached to the document,
 * because the library logs a warning when it has no anchor to position against and the
 * notification path has to stay free of warnings.
 *
 * @type {HTMLElement}
 */
let anchor;

/**
 * Teleport destination for the duration of one test.
 *
 * @type {HTMLElement}
 */
let teleportTarget;

/**
 * Every wrapper mounted by a test, so that teardown can unmount all of them. Unmounting
 * matters more than usual here: the library registers listeners on the document while a
 * notification is open and removes them on unmount, so a wrapper left mounted would keep
 * reacting to events dispatched by later tests.
 *
 * @type {Object[]}
 */
let wrappers;

/**
 * Recording spy over the console warning channel, used to prove the notification path emits
 * none. It records rather than replaces, so anything unexpected still surfaces in the run.
 *
 * @type {jest.SpyInstance}
 */
let warn;

/**
 * Mount the component with everything it needs to render exactly as it does in production.
 *
 * A real anchor and an explicit teleport destination are supplied on every mount, never only
 * on the tests that assert them: the anchor keeps the library from warning, and the explicit
 * destination keeps the notification out of the library's fallback location.
 *
 * @param {Object} [props] Props to set, merged over the anchor and message every mount needs.
 * @return {Object} the mounted wrapper
 */
function mountNotification( props ) {
	const wrapper = mount( PopupNotification, {
		props: Object.assign( { anchor: anchor, message: 'test message' }, props ),
		global: {
			provide: { [ TELEPORT_TARGET_KEY ]: teleportTarget }
		}
	} );
	wrappers.push( wrapper );
	return wrapper;
}

/**
 * Mount, then let the library finish the work it defers past mounting: the tick it waits
 * before checking that it has an anchor, and the position computation that applies the
 * collision-handling styles. Both are promise-based, so this settles under fake timers too.
 *
 * @param {Object} [props]
 * @return {Promise<Object>} the mounted wrapper, ready to assert against
 */
async function mountSettled( props ) {
	const wrapper = mountNotification( props );
	await flushPromises();
	return wrapper;
}

/**
 * The rendered notification panel, or null when nothing is rendered. Queried from the
 * teleport destination rather than through the wrapper, because a teleported node is not a
 * descendant of the element the component was mounted on.
 *
 * @return {HTMLElement|null}
 */
function panel() {
	return teleportTarget.querySelector( '.cdx-popover' );
}

/**
 * Every rendered notification panel in the destination, used to prove none accumulate.
 *
 * @return {NodeListOf<HTMLElement>}
 */
function panels() {
	return teleportTarget.querySelectorAll( '.cdx-popover' );
}

/**
 * The library component the notification is rendered with, which is where the props the
 * component translates for it can be read back.
 *
 * @param {Object} wrapper
 * @return {Object}
 */
function library( wrapper ) {
	return wrapper.findComponent( { name: 'CdxPopover' } );
}

/**
 * The panel belonging to one particular wrapper, read from the reference the library keeps on
 * its own rendered element. Needed whenever more than one notification is mounted at a time,
 * because they all render into the same destination and a query on that destination would
 * find whichever came first rather than the one being asserted about.
 *
 * @param {Object} wrapper
 * @return {HTMLElement}
 */
function panelFor( wrapper ) {
	return library( wrapper ).vm.floating;
}

/**
 * The props the component actually passed, as opposed to the values the library would have
 * defaulted to on its own. Reading the vnode is what distinguishes a value set deliberately
 * from one that merely happens to match a default.
 *
 * Names arrive as they were written in the template, so hyphenated names are folded to the
 * form the library declares them in. That also means a prop the library does not know about
 * is caught here under either spelling.
 *
 * @param {Object} wrapper
 * @return {Object}
 */
function propsPassedToLibrary( wrapper ) {
	const passed = library( wrapper ).vm.$.vnode.props || {};
	const byDeclaredName = {};
	Object.keys( passed ).forEach( ( name ) => {
		const camelCased = name.replace(
			/-([a-z])/g,
			( unused, letter ) => letter.toUpperCase()
		);
		byDeclaredName[ camelCased ] = passed[ name ];
	} );
	return byDeclaredName;
}

/**
 * Dispatch a key press the way the library listens for one: on the document, while the
 * notification is open.
 *
 * @param {string} key
 */
function pressKey( key ) {
	document.dispatchEvent( new KeyboardEvent( 'keydown', { key: key, bubbles: true } ) );
}

/**
 * Press the mouse down on an element, the interaction the library treats as a click outside
 * the notification when the element is neither the notification nor its anchor.
 *
 * @param {HTMLElement} element
 */
function pressMouseOn( element ) {
	element.dispatchEvent( new MouseEvent( 'mousedown', { bubbles: true } ) );
}

/**
 * Move focus into an element from outside the notification, the other interaction the library
 * treats as a signal that the reader has moved on.
 *
 * @param {HTMLElement} element
 */
function moveFocusTo( element ) {
	element.dispatchEvent( new FocusEvent( 'focusin', { bubbles: true } ) );
}

/**
 * How many times the component reported a close, which is the signal the notification
 * module turns into a call to the caller's dismissal callback.
 *
 * @param {Object} wrapper
 * @return {Array[]} one entry per report, each holding the reported open state
 */
function closeReports( wrapper ) {
	return wrapper.emitted( 'update:open' ) || [];
}

/**
 * Act on a close report the way the notification module does, then show the notification
 * again. Driving one notification through each close path in turn, rather than mounting a
 * fresh one per path, is both closer to how the module behaves — it withdraws the open state
 * when a close is reported, and restores it on the next show — and free of the cross-talk
 * several simultaneously open notifications would cause, since the library listens on the
 * document and every open notification hears every event.
 *
 * @param {Object} wrapper
 * @return {Promise<void>}
 */
async function acknowledgeCloseAndShowAgain( wrapper ) {
	await wrapper.setProps( { open: false } );
	await wrapper.setProps( { open: true } );
	await flushPromises();
}

beforeEach( () => {
	wrappers = [];
	teleportTarget = pageReady.teleportTarget;
	// Re-attached rather than recreated, so that every test teleports into the very element
	// the notification module would use. Appending an element that is already a child moves
	// it, which is harmless and keeps this idempotent.
	document.body.appendChild( teleportTarget );
	teleportTarget.innerHTML = '';
	anchor = document.createElement( 'button' );
	anchor.textContent = 'Toggle';
	document.body.appendChild( anchor );
	warn = jest.spyOn( console, 'warn' );
} );

afterEach( () => {
	wrappers.forEach( ( wrapper ) => wrapper.unmount() );
	wrappers = [];
	anchor.remove();
	teleportTarget.innerHTML = '';
	warn.mockRestore();
	jest.useRealTimers();
} );

describe( 'PopupNotification parity with the popup it replaces', () => {
	// Parity assertion 1: the notification anchors below the container it was given.
	test( 'anchors below the container, with the placement stated rather than inherited', async () => {
		const wrapper = await mountSettled( { open: true } );

		// Read from the vnode, not from the resolved props: the library defaults to the same
		// placement, so only the vnode can show the value was passed deliberately.
		expect( propsPassedToLibrary( wrapper ).placement ).toBe( 'bottom' );
		expect( library( wrapper ).props( 'placement' ) ).toBe( 'bottom' );
		// Positioned against the container itself, not a wrapper element standing in for it.
		expect( library( wrapper ).props( 'anchor' ) ).toBe( anchor );
		expect( panel() ).not.toBeNull();
	} );

	// Parity assertion 2: alignment is centred. The popup this replaces expressed alignment
	// as an option of its own; the library folds it into the placement value, so the parity
	// evidence is that there is no second alignment knob left unset.
	test( 'centres on the container through the same placement value, there being no separate alignment option', async () => {
		const wrapper = await mountSettled( { open: true } );
		const libraryProps = Object.keys( library( wrapper ).props() );

		expect( library( wrapper ).props( 'placement' ) ).toBe( 'bottom' );
		expect( libraryProps ).not.toContain( 'align' );
		expect( libraryProps ).not.toContain( 'alignment' );
	} );

	// Parity assertion 3: the content is padded. The padding is a design-system token applied
	// to the library's own body element, and stylesheets are not compiled under this runner,
	// so the assertion is structural: the message sits inside that element rather than
	// directly on the panel, which is the arrangement that makes the token apply. The change
	// in padding from the popup this replaces is expected and is reviewed by capture instead.
	test( 'renders its message inside the body element the design system pads', async () => {
		await mountSettled( { open: true } );
		const body = panel().querySelector( '.cdx-popover__body' );

		expect( body ).not.toBeNull();
		const paragraph = body.querySelector( 'p' );
		expect( paragraph ).not.toBeNull();
		expect( paragraph.parentElement ).toBe( body );
		expect( paragraph.parentElement ).not.toBe( panel() );
	} );

	// Parity assertion 4: the notification auto-closes when a timeout was given. The timer
	// belongs to the notification module, so the component's half is the transition that
	// timer produces — withdrawing the open state must remove the notification at once.
	test( 'disappears as soon as its owner withdraws the open state, which is how a timed dismissal ends', async () => {
		jest.useFakeTimers();
		const wrapper = await mountSettled( { open: true } );
		expect( panel() ).not.toBeNull();

		await wrapper.setProps( { open: false } );

		expect( panel() ).toBeNull();
		expect( teleportTarget.querySelector( '.cdx-popover__body' ) ).toBeNull();
	} );

	// Parity assertion 5: a persistent notification keeps a visible header with a dismiss
	// button; a timed one shows neither.
	test( 'shows a header, a title and a dismiss button only while persistent', async () => {
		const persistent = await mountSettled( {
			open: true,
			persistent: true,
			title: 'Menu moved'
		} );
		const persistentPanel = panel();

		expect( persistentPanel.querySelector( '.cdx-popover__header' ) ).not.toBeNull();
		expect( persistentPanel.querySelector( '.cdx-popover__header__title' ).textContent )
			.toBe( 'Menu moved' );
		expect( persistentPanel.querySelector( '.cdx-popover__header__close-button' ) )
			.not.toBeNull();
		expect( library( persistent ).props( 'useCloseButton' ) ).toBe( true );

		await persistent.setProps( { open: false, persistent: false, title: '' } );
		await persistent.setProps( { open: true } );
		await flushPromises();
		const timedPanel = panel();

		expect( timedPanel.querySelector( '.cdx-popover__header' ) ).toBeNull();
		expect( timedPanel.querySelector( '.cdx-popover__header__title' ) ).toBeNull();
		expect( timedPanel.querySelector( '.cdx-popover__header__close-button' ) ).toBeNull();
		expect( library( persistent ).props( 'useCloseButton' ) ).toBe( false );
	} );

	// Parity assertion 6, first half: a dismissal is reported however it was caused. The popup
	// this replaces raised one event for every visible-to-hidden transition, and the
	// notification module turns each report below into one call of the caller's callback.
	test( 'reports a close through update:open whichever path closed it', async () => {
		const wrapper = await mountSettled( { open: true, persistent: true } );
		const elsewhere = document.createElement( 'button' );
		document.body.appendChild( elsewhere );

		// The dismiss button in the header.
		panelFor( wrapper ).querySelector( '.cdx-popover__header__close-button' ).click();
		await flushPromises();
		expect( closeReports( wrapper ) ).toEqual( [ [ false ] ] );

		// The keyboard.
		await acknowledgeCloseAndShowAgain( wrapper );
		pressKey( 'Escape' );
		await flushPromises();
		expect( closeReports( wrapper ) ).toHaveLength( 2 );

		// A press somewhere else on the page.
		await acknowledgeCloseAndShowAgain( wrapper );
		pressMouseOn( elsewhere );
		await flushPromises();
		expect( closeReports( wrapper ) ).toHaveLength( 3 );

		// Focus moving somewhere else on the page.
		await acknowledgeCloseAndShowAgain( wrapper );
		moveFocusTo( elsewhere );
		await flushPromises();
		expect( closeReports( wrapper ) ).toHaveLength( 4 );

		// Every report carried the same thing: that the notification is now closed.
		expect( closeReports( wrapper ) )
			.toEqual( [ [ false ], [ false ], [ false ], [ false ] ] );
		elsewhere.remove();
	} );

	// Parity assertion 6, second half: nothing is reported when a notification that is already
	// closed is closed again. This is what keeps a sweep over the notification module's
	// registry from calling the dismissal callback of an entry that was never open, matching
	// the short-circuit the popup this replaces had.
	test( 'reports nothing when what is already closed is closed again', async () => {
		const wrapper = await mountSettled( { open: true } );
		pressKey( 'Escape' );
		await flushPromises();
		expect( closeReports( wrapper ) ).toHaveLength( 1 );

		// The owner acts on the report, which is the state the notification module holds.
		await wrapper.setProps( { open: false } );
		await flushPromises();

		// Every path that could close it again, now that it is closed.
		pressKey( 'Escape' );
		pressMouseOn( document.body );
		pressMouseOn( anchor );
		await flushPromises();

		expect( closeReports( wrapper ) ).toHaveLength( 1 );
	} );

	// Parity assertion 7: one active notification per id. The id is the notification module's
	// registry key and never reaches the component, so the component's half is that a single
	// notification stays a single notification however often it is shown and hidden.
	test( 'keeps exactly one notification per instance across repeated shows and hides', async () => {
		const wrapper = await mountSettled( { open: true } );
		expect( panels() ).toHaveLength( 1 );

		await wrapper.setProps( { open: false } );
		await wrapper.setProps( { open: true } );
		await wrapper.setProps( { open: false } );
		await wrapper.setProps( { open: true } );
		await flushPromises();

		expect( panels() ).toHaveLength( 1 );
		// Re-showing is not a dismissal, so nothing is reported by the round trips above.
		expect( closeReports( wrapper ) ).toHaveLength( 0 );
	} );

	// Parity assertion 8: hiding them all hides every tracked notification. The tracking is
	// the notification module's; the component's half is that each notification answers to its
	// own open state, so a sweep over the registry closes all of them and leaves none behind.
	test( 'closes each notification independently, so a sweep over several leaves none open', async () => {
		const first = await mountSettled( { open: true, classes: [ 'first-notification' ] } );
		const second = await mountSettled( { open: true, classes: [ 'second-notification' ] } );
		expect( panels() ).toHaveLength( 2 );

		await first.setProps( { open: false } );
		expect( panels() ).toHaveLength( 1 );
		expect( panel().classList.contains( 'second-notification' ) ).toBe( true );

		await second.setProps( { open: false } );
		expect( panels() ).toHaveLength( 0 );
	} );

	// Parity assertion 9: the default timeout is 4000 ms. Both defaults live in the
	// notification module, so the component's half is that it contributes no timing of its
	// own — the module's default is the only thing that can dismiss a timed notification.
	test( 'runs no timer of its own, leaving the caller as the only source of a timed dismissal', async () => {
		jest.useFakeTimers();
		const wrapper = await mountSettled( { open: true } );

		expect( jest.getTimerCount() ).toBe( 0 );

		jest.advanceTimersByTime( DEFAULT_TIMEOUT_MS );
		await flushPromises();
		expect( panel() ).not.toBeNull();
		expect( closeReports( wrapper ) ).toHaveLength( 0 );

		jest.advanceTimersByTime( DEFAULT_TIMEOUT_MS * 15 );
		await flushPromises();
		expect( panel() ).not.toBeNull();
		expect( closeReports( wrapper ) ).toHaveLength( 0 );
	} );

	// Parity assertion 10, re-expressed: collision handling is active for as long as the
	// notification is open. The popup this replaces exposed a method to switch clipping on,
	// and the library exposes none, because its positioning middleware — an offset, a flip, a
	// size cap and the arrow — is applied unconditionally while the notification is mounted
	// and open. The evidence is therefore the styles that middleware writes.
	test( 'has collision handling applied for as long as it is open, and none once closed', async () => {
		const wrapper = await mountSettled( { open: true } );
		const openPanel = panel();

		// Written by the positioning library: the strategy it chose, and the translation it
		// computed for the placement.
		expect( openPanel.style.position ).toBe( 'absolute' );
		expect( openPanel.style.transform ).toContain( 'translate' );
		// Written by the size middleware, which is the clipping: it caps the notification to
		// the space available so it cannot overflow the viewport. The exact figures follow
		// from the space this runner reports, so only their presence is asserted.
		expect( openPanel.style.maxWidth ).toMatch( /px$/ );
		expect( openPanel.style.maxHeight ).toMatch( /px$/ );
		// The arrow middleware needs its element, and positions it inline.
		const arrow = openPanel.querySelector( '.cdx-popover__arrow' );
		expect( arrow ).not.toBeNull();
		expect( arrow.getAttribute( 'style' ) ).toContain( 'transform' );

		await wrapper.setProps( { open: false } );
		await flushPromises();

		// Nothing is positioned while closed, because nothing is rendered.
		expect( panel() ).toBeNull();
		expect( teleportTarget.querySelector( '.cdx-popover__arrow' ) ).toBeNull();
	} );

	// Parity assertion 11: classes the caller supplied are applied alongside the skin's own.
	test( 'applies caller-supplied classes alongside vector-popup-notification', async () => {
		await mountSettled( {
			open: true,
			classes: [ 'vector-popup-notification-extra', 'another-class' ]
		} );
		const { classList } = panel();

		expect( classList.contains( VECTOR_POPUP_CLASS ) ).toBe( true );
		expect( classList.contains( 'vector-popup-notification-extra' ) ).toBe( true );
		expect( classList.contains( 'another-class' ) ).toBe( true );
		// On the same element as the library's own class, which is what lets one selector
		// match both without a wrapper element in between.
		expect( classList.contains( 'cdx-popover' ) ).toBe( true );
	} );
} );

describe( 'PopupNotification design decisions that must not regress', () => {
	/*
	 * A scrim behind the notification would be the least visible and most disruptive
	 * regression available here, so its absence is pinned rather than assumed.
	 *
	 * REPORTED, not relaxed: the requirement to enable the library's own prop for suppressing
	 * that scrim cannot be met. The pinned library version has no such prop — it renders no
	 * backdrop at all — so passing one would not be validated as a prop and would instead
	 * reach the DOM as a stray attribute, silently, which is a real markup regression. In the
	 * version that runs in the browser the prop exists but applies only to the sheet layout
	 * this notification must not use. Meeting it literally would require raising the pinned
	 * version, which is out of scope. The assertion below is the part that is verifiable, and
	 * it holds in both versions.
	 */
	test( 'renders no backdrop, and is passed no backdrop prop the pinned library cannot honour', async () => {
		const wrapper = await mountSettled( { open: true } );

		expect( document.querySelector( '.cdx-popover__backdrop' ) ).toBeNull();
		// Searched across the whole destination, not just inside the notification: a scrim
		// would be rendered beside the notification rather than within it.
		expect( teleportTarget.querySelector( '[class*="backdrop"]' ) ).toBeNull();
		expect( teleportTarget.children ).toHaveLength( 1 );

		// Nothing was passed that the library would not recognise, so nothing can leak into
		// the markup as an attribute. The panel carries a class and the positioning style and
		// nothing else.
		expect( Object.keys( library( wrapper ).props() ) ).not.toContain( 'hideBackdrop' );
		expect( propsPassedToLibrary( wrapper ) ).not.toHaveProperty( 'hideBackdrop' );
		expect( panel().getAttributeNames().sort() ).toEqual( [ 'class', 'style' ] );

		// The sheet layout the prop would have applied to stays off, which is also what keeps
		// the notification anchored rather than docked.
		expect( Object.keys( library( wrapper ).props() ) ).not.toContain( 'useBottomSheet' );
	} );

	/*
	 * The notification module hands its caller a native promise. Nothing in this file can
	 * observe that directly, because the module's facade is deliberately out of reach here —
	 * that half is asserted in `tests/jest/popupNotification.test.js`, by making the module
	 * loader answer with a foreign thenable and requiring the result to still be a native
	 * promise. What is in reach is the other end of the same requirement: the component must
	 * not put anything of its own into that path.
	 */
	test( 'keeps the notification path on native promises and plain values', async () => {
		const wrapper = await mountSettled( { open: true } );

		// The component's own asynchrony is the framework's, which is promise-based.
		expect( wrapper.vm.$nextTick() ).toBeInstanceOf( Promise );

		pressKey( 'Escape' );
		await flushPromises();
		const [ [ reported ] ] = closeReports( wrapper );

		// The report is a plain boolean, so nothing thenable and nothing framework-shaped can
		// travel back out through the notification module to its caller.
		expect( typeof reported ).toBe( 'boolean' );
		expect( reported ).toBe( false );
	} );

	// The teleport destination is stated, never left to the library's fallback of the document
	// body. Asserted against the very element the notification module's entry point provides.
	test( 'renders into the teleport destination the skin names, not the library fallback', async () => {
		await mountSettled( { open: true } );

		expect( teleportTarget ).toBeInstanceOf( HTMLElement );
		expect( teleportTarget.isConnected ).toBe( true );
		expect( panel().parentElement ).toBe( teleportTarget );
		// The fallback is the body itself, so a notification that ended up there would be a
		// direct child of it. This is what proves the destination was supplied.
		expect( panel().parentElement ).not.toBe( document.body );
		expect( teleportTarget.parentElement ).toBe( document.body );
	} );

	// No actions are passed, so no footer may render. Pinned so that a future library default
	// cannot introduce one without this failing.
	test( 'renders no footer, having been given no actions', async () => {
		const wrapper = await mountSettled( { open: true, persistent: true } );

		expect( panel().querySelector( '.cdx-popover__footer' ) ).toBeNull();
		expect( panel().querySelector( 'footer' ) ).toBeNull();
		expect( library( wrapper ).props( 'primaryAction' ) ).toBeNull();
		expect( library( wrapper ).props( 'defaultAction' ) ).toBeNull();
		expect( propsPassedToLibrary( wrapper ) ).not.toHaveProperty( 'primaryAction' );
		expect( propsPassedToLibrary( wrapper ) ).not.toHaveProperty( 'defaultAction' );
	} );
} );

/*
 * One test per argument of the notification module's `add()`, asserting where that argument is
 * read once it reaches the component. Two of the six deserve the attention: the caller in
 * production passes only three arguments, so the class list and the dismissal callback are
 * live API with nothing exercising them outside these tests.
 */
describe( 'PopupNotification read sites for every notification option', () => {
	// container — read as the element the notification is positioned against. Also the guard
	// against the one warning this path can produce: the library warns when it is given no
	// anchor, and the notification path has to stay silent.
	test( 'container is read as the anchor, and positioning it produces no warning', async () => {
		const wrapper = await mountSettled( { open: true } );

		expect( library( wrapper ).props( 'anchor' ) ).toBe( anchor );
		expect( propsPassedToLibrary( wrapper ).anchor ).toBe( anchor );
		expect( anchor.isConnected ).toBe( true );
		// The library checks for its anchor a tick after mounting, which the settled mount
		// above has already awaited, so this is a real check and not a race.
		expect( warn ).not.toHaveBeenCalled();
	} );

	// message — read as the text of the paragraph in the body. Interpolated, so the plain-text
	// semantics of the popup this replaces are preserved and no markup can be injected.
	test( 'message is read as the body text and never as markup', async () => {
		const wrapper = await mountSettled( {
			open: true,
			message: '<script>alert( 1 );</script> & more'
		} );
		const paragraph = panel().querySelector( '.cdx-popover__body p' );

		expect( paragraph.textContent ).toBe( '<script>alert( 1 );</script> & more' );
		expect( paragraph.children ).toHaveLength( 0 );
		expect( panel().querySelector( 'script' ) ).toBeNull();

		await wrapper.setProps( { message: 'updated message' } );

		expect( panel().querySelector( '.cdx-popover__body p' ).textContent )
			.toBe( 'updated message' );
	} );

	// id — deliberately has no read site here. It is the notification module's registry key,
	// and keeping it out of the component is what makes the component reusable for more than
	// one notification at a time. Pinning the prop surface is what keeps it that way.
	test( 'id has no read site in the component, whose prop surface is exactly the six options it needs', async () => {
		const declared = Object.keys( PopupNotification.props );

		expect( declared.sort() ).toEqual(
			[ 'anchor', 'classes', 'message', 'open', 'persistent', 'title' ]
		);
		expect( declared ).not.toContain( 'id' );
		expect( PopupNotification.emits ).toEqual( [ 'update:open' ] );

		// Two notifications created from identical options stay two notifications, because
		// identity is the caller's business and not the component's.
		await mountSettled( { open: true } );
		await mountSettled( { open: true } );
		expect( panels() ).toHaveLength( 2 );
	} );

	// classes — read into the rendered class list. Unexercised in production, where the caller
	// omits it, so these are the only assertions protecting it.
	test( 'classes are read into the rendered class list, and their absence adds nothing', async () => {
		const withNone = await mountSettled( { open: true } );

		expect( withNone.props( 'classes' ) ).toEqual( [] );
		expect( Array.prototype.slice.call( panel().classList ) )
			.toEqual( [ 'cdx-popover', VECTOR_POPUP_CLASS ] );

		await withNone.setProps( { classes: [ 'added-later' ] } );

		expect( Array.prototype.slice.call( panel().classList ) )
			.toEqual( [ 'cdx-popover', VECTOR_POPUP_CLASS, 'added-later' ] );
	} );

	// timeout — decomposed by the notification module into whether the notification is
	// persistent and how long it lives. Only the first half reaches the component, where it is
	// read as the dismiss button; the duration stays with the module, which owns the timer.
	test( 'timeout is read only as whether the notification is persistent, never as a duration', async () => {
		jest.useFakeTimers();
		const timed = await mountSettled( { open: true, persistent: false } );

		expect( library( timed ).props( 'useCloseButton' ) ).toBe( false );
		expect( propsPassedToLibrary( timed ).useCloseButton ).toBe( false );
		// No duration is passed under any name, so the component cannot dismiss itself.
		expect( propsPassedToLibrary( timed ) ).not.toHaveProperty( 'timeout' );
		expect( propsPassedToLibrary( timed ) ).not.toHaveProperty( 'autoClose' );
		expect( jest.getTimerCount() ).toBe( 0 );

		await timed.setProps( { persistent: true } );

		expect( library( timed ).props( 'useCloseButton' ) ).toBe( true );
		expect( panel().querySelector( '.cdx-popover__header__close-button' ) ).not.toBeNull();
		expect( jest.getTimerCount() ).toBe( 0 );
	} );

	// onDismiss — read as the report of a close. Unexercised in production, where the caller
	// omits it, so these are the only assertions protecting it. The notification module binds
	// the caller's callback to exactly this report, once per real close.
	test( 'onDismiss is read as one close report per dismissal and nothing else', async () => {
		const wrapper = await mountSettled( { open: true, persistent: true } );

		panel().querySelector( '.cdx-popover__header__close-button' ).click();
		await flushPromises();

		// Exactly one report, carrying the new state, so a callback bound to it runs once.
		expect( closeReports( wrapper ) ).toEqual( [ [ false ] ] );
		// And nothing the notification module does not listen for: the library's action events
		// belong to a footer this notification never renders.
		expect( wrapper.emitted( 'primary' ) ).toBeUndefined();
		expect( wrapper.emitted( 'default' ) ).toBeUndefined();
		// Opening is not a dismissal, so showing it again reports nothing further.
		await wrapper.setProps( { open: false } );
		await wrapper.setProps( { open: true } );
		await flushPromises();
		expect( closeReports( wrapper ) ).toHaveLength( 1 );
	} );
} );

describe( 'PopupNotification accessibility', () => {
	// Keyboard dismissal, which the library provides and this notification relies on rather
	// than reimplementing.
	test( 'closes on Escape, so it can be dismissed from the keyboard', async () => {
		const wrapper = await mountSettled( { open: true } );

		pressKey( 'Escape' );
		await flushPromises();
		expect( closeReports( wrapper ) ).toEqual( [ [ false ] ] );

		// Only that key. Any other keystroke has to leave the notification alone, or typing
		// on the page would dismiss it.
		await wrapper.setProps( { open: true } );
		await flushPromises();
		pressKey( 'Enter' );
		pressKey( 'Tab' );
		pressKey( 'a' );
		await flushPromises();
		expect( closeReports( wrapper ) ).toHaveLength( 1 );
	} );

	/*
	 * An improvement over the popup this replaces, asserted so that it is not later mistaken
	 * for a regression: that popup suppressed every outside dismissal — including Escape —
	 * whenever it was persistent, leaving the mouse as the only way out. Escape now works in
	 * both states.
	 *
	 * REPORTED, not absorbed: the same unconditional handling costs the persistent notification
	 * something. The library also closes on an outside press and on focus moving away, with no
	 * prop to disable either, so a persistent notification no longer survives a click
	 * elsewhere on the page the way it used to. There is no affordance in the library to
	 * restore that, so it is not attempted; it is pinned here so the behaviour is at least
	 * visible and cannot drift further unnoticed.
	 */
	test( 'closes on Escape even while persistent, which the popup it replaces did not, and closes on an outside press too', async () => {
		const wrapper = await mountSettled( { open: true, persistent: true } );

		pressKey( 'Escape' );
		await flushPromises();
		expect( closeReports( wrapper ) ).toEqual( [ [ false ] ] );

		await acknowledgeCloseAndShowAgain( wrapper );
		pressMouseOn( document.body );
		await flushPromises();
		expect( closeReports( wrapper ) ).toHaveLength( 2 );

		// Pressing inside the notification, or on the control that opened it, must not close
		// it — otherwise the dismiss button could never be reached.
		await acknowledgeCloseAndShowAgain( wrapper );
		pressMouseOn( panelFor( wrapper ).querySelector( '.cdx-popover__body' ) );
		pressMouseOn( anchor );
		await flushPromises();
		expect( closeReports( wrapper ) ).toHaveLength( 2 );
	} );

	// Focus, on open and on close. The notification appears unprompted beside a control the
	// reader is using, so it must not take focus away from them; and when it goes, focus must
	// not be left on a node that no longer exists.
	test( 'leaves focus where the reader had it on open, and never strands it on a removed node on close', async () => {
		const elsewhere = document.createElement( 'input' );
		document.body.appendChild( elsewhere );
		elsewhere.focus();
		expect( document.activeElement ).toBe( elsewhere );

		const wrapper = await mountSettled( { open: true, persistent: true } );

		// Opening took nothing from the reader.
		expect( document.activeElement ).toBe( elsewhere );

		// The dismiss button is reachable, which is what makes a persistent notification
		// dismissable without a mouse.
		const dismiss = panel().querySelector( '.cdx-popover__header__close-button' );
		dismiss.focus();
		expect( document.activeElement ).toBe( dismiss );

		await wrapper.setProps( { open: false } );
		await flushPromises();

		// The button has gone with the notification, so focus must have moved off it to
		// something still in the document rather than being stranded.
		expect( dismiss.isConnected ).toBe( false );
		expect( document.activeElement ).not.toBe( dismiss );
		expect( document.activeElement.isConnected ).toBe( true );
		expect( panel() ).toBeNull();
		elsewhere.remove();
	} );

	/*
	 * REPORTED, not worked around: the rendered notification carries no dialog role and no live
	 * region, so a reader using a screen reader is not told it appeared. The markup is the
	 * library's and the component's attribute surface is fixed by the notification module's
	 * contract, so nothing here can add one without reaching outside this change. The measured
	 * surface is asserted as it stands, which both records the gap and makes any future change
	 * to it — by the library or by the skin — surface as a failure to be reviewed rather than
	 * passing unnoticed.
	 */
	test( 'exposes no dialog role and no live region, a gap reported rather than worked around', async () => {
		await mountSettled( { open: true, persistent: true, title: 'Menu moved' } );
		const notification = panel();

		expect( notification.getAttribute( 'role' ) ).toBeNull();
		expect( notification.getAttribute( 'aria-live' ) ).toBeNull();
		expect( notification.getAttribute( 'aria-modal' ) ).toBeNull();
		expect( notification.querySelector( '[aria-live]' ) ).toBeNull();
		expect( notification.querySelector( '[role="dialog"]' ) ).toBeNull();
		expect( notification.querySelector( '[role="alert"]' ) ).toBeNull();
		expect( notification.querySelector( '[role="status"]' ) ).toBeNull();

		// What the notification does expose: a labelled dismiss button, whose label comes from
		// the library's own message rather than one this skin has to add.
		const dismiss = notification.querySelector( '.cdx-popover__header__close-button' );
		expect( dismiss.tagName ).toBe( 'BUTTON' );
		expect( dismiss.getAttribute( 'type' ) ).toBe( 'button' );
		expect( dismiss.getAttribute( 'aria-label' ) ).toBeTruthy();
		// And a heading element for the title, so the notification is not one undifferentiated
		// run of text.
		expect( notification.querySelector( '.cdx-popover__header__title' ).textContent )
			.toBe( 'Menu moved' );
	} );
} );
