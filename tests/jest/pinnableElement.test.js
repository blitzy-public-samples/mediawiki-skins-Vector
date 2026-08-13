jest.mock( '../../resources/skins.vector.js/features.js' );

// `skins.vector.notification.codex` is a ResourceLoader module name rather than a path: the
// notification module fetches it through the loader and then requires it by that name, so nothing
// on disk answers to the specifier and it cannot be resolved on its own. Registering it as a
// virtual module that resolves to the real entry point is what lets a notification be created for
// real here instead of being replaced by a stub, which matters because this is the only suite that
// exercises the pin and unpin chain end to end. The factory runs on first require, so nothing is
// loaded until a notification is actually created.
jest.mock(
	'skins.vector.notification.codex',
	() => require( '../../resources/skins.vector.notification.codex/index.js' ),
	{ virtual: true }
);

const features = require( '../../resources/skins.vector.js/features.js' );
const mustache = require( 'mustache' );
const fs = require( 'fs' );
const pinnableHeaderTemplate = fs.readFileSync( 'includes/templates/PinnableHeader.mustache', 'utf8' );
const pinnableElement = require( '../../resources/skins.vector.js/pinnableElement.js' );
const Vue = require( 'vue' );
const { flushPromises } = require( '@vue/test-utils' );
// The overlay element every notification is teleported into. It is read here as well as by the
// notification module so that this suite holds the very same element and can look inside it: the
// fixture below replaces the body's contents and so detaches that element from the document,
// which would make a document-wide query depend on the order the modules happened to load in.
const { teleportTarget } = require( 'mediawiki.page.ready' );

// MediaWiki supplies `createMwApp`, not the Vue package: core wraps `createApp` to install its
// error logger and its i18n plugin before handing the application back. Of those, only the message
// function reaches anything rendered here — the notification module names its own teleport
// destination — so that is what this stand-in installs. It is installed once for the whole suite
// because the notification module reads it at the moment a notification is mounted.
Vue.createMwApp = ( rootComponent, rootProps ) => {
	const app = Vue.createApp( rootComponent, rootProps );
	app.provide( 'CdxI18nFunction', mw.msg );
	return app;
};

/**
 * Mock for matchMedia, which is not included in JSDOM.
 * https://jestjs.io/docs/26.x/manual-mocks#mocking-methods-which-are-not-implemented-in-jsdom
 */
Object.defineProperty( window, 'matchMedia', {
	writable: true,
	value: jest.fn().mockImplementation( ( query ) => ( {
		matches: false,
		media: query,
		onchange: null,
		addListener: jest.fn(), // deprecated
		removeListener: jest.fn(), // deprecated
		addEventListener: jest.fn(),
		removeEventListener: jest.fn(),
		dispatchEvent: jest.fn()
	} ) )
} );

// Mock functionality of features.js
let pinnedStatus = false;
features.toggleDocClasses = jest.fn( ( name, pinState ) => {
	pinnedStatus = pinState;
} );
features.save = jest.fn();
features.isEnabled = jest.fn( () => pinnedStatus );

const unpinnedData = {
	'is-pinned': false,
	'data-feature-name': 'pinned',
	'data-pinnable-element-id': 'pinnable-element',
	label: 'simple pinnable element',
	'label-tag-name': 'div',
	'pin-label': 'pin',
	'unpin-label': 'unpin',
	'pin-aria-label': 'Move simple pinnable element to sidebar',
	'unpin-aria-label': 'Hide simple pinnable element',
	'data-pinned-container-id': 'pinned-container',
	'data-unpinned-container-id': 'unpinned-container'
};

const pinnedData = {
	'is-pinned': true,
	'data-feature-name': 'appearance-pinned',
	'data-pinnable-element-id': 'vector-appearance',
	label: 'simple pinnable element',
	'label-tag-name': 'div',
	'pin-label': 'pin',
	'unpin-label': 'unpin',
	'pin-aria-label': 'Move appearance menu to sidebar',
	'unpin-aria-label': 'Hide appearance menu',
	'data-pinned-container-id': 'pinned-container',
	'data-unpinned-container-id': 'unpinned-container'
};

const initializeHTML = ( headerData ) => {
	pinnedStatus = headerData[ 'is-pinned' ];
	const pinnableHeaderHTML = mustache.render( pinnableHeaderTemplate, headerData );
	const pinnableElementHTML = `<div id="pinnable-element">${ pinnableHeaderHTML }</div>`;
	document.body.innerHTML = `<div id="pinned-container">
			${ headerData[ 'is-pinned' ] ? pinnableElementHTML : '' }
		</div>
		<div class="vector-dropdown">
			<input type="checkbox" id="checkbox" class="vector-dropdown-checkbox">
			<label for="checkbox" class="vector-menu-heading ">
				<span class="vector-menu-heading-label">Dropdown</span>
			</label>
			<div class="vector-menu-content">
				<div id="unpinned-container">
				${ !headerData[ 'is-pinned' ] ? pinnableElementHTML : '' }
				</div>
			</div>
		</div>
`;
};

describe( 'Pinnable element', () => {
	afterEach( () => {
		// Undoes only the spies a test installed, leaving the feature stubs above in place. Without
		// it the loader spy the last test needs would outlive that test and quietly let every
		// earlier one create a notification of its own.
		jest.restoreAllMocks();
	} );

	test( 'renders', () => {
		initializeHTML( unpinnedData );
		expect( document.body.innerHTML ).toMatchSnapshot();
	} );

	test( 'updates pinnable header classes when toggle is pressed', () => {
		initializeHTML( unpinnedData );
		pinnableElement.init();
		const pinButton = /** @type {HTMLElement} */ ( document.querySelector( '.vector-pinnable-header-pin-button' ) );
		const unpinButton = /** @type {HTMLElement} */ ( document.querySelector( '.vector-pinnable-header-unpin-button' ) );
		const header = /** @type {HTMLElement} */ ( document.querySelector( `.${ unpinnedData[ 'data-pinnable-element-id' ] }-pinnable-header` ) );

		expect( header.classList.contains( pinnableElement.PINNED_HEADER_CLASS ) ).toBe( false );
		expect( header.classList.contains( pinnableElement.UNPINNED_HEADER_CLASS ) ).toBe( true );
		pinButton.click();
		expect( header.classList.contains( pinnableElement.PINNED_HEADER_CLASS ) ).toBe( true );
		expect( header.classList.contains( pinnableElement.UNPINNED_HEADER_CLASS ) ).toBe( false );
		unpinButton.click();
		expect( header.classList.contains( pinnableElement.PINNED_HEADER_CLASS ) ).toBe( false );
		expect( header.classList.contains( pinnableElement.UNPINNED_HEADER_CLASS ) ).toBe( true );
	} );

	test( 'moves pinnable element when data attributes are defined', () => {
		initializeHTML( unpinnedData );
		pinnableElement.init();
		const pinButton = /** @type {HTMLElement} */ ( document.querySelector( '.vector-pinnable-header-pin-button' ) );
		const unpinButton = /** @type {HTMLElement} */ ( document.querySelector( '.vector-pinnable-header-unpin-button' ) );
		const pinnableElem = /** @type {HTMLElement} */ ( document.getElementById( unpinnedData[ 'data-pinnable-element-id' ] ) );

		expect( pinnableElem.parentElement && pinnableElem.parentElement.id ).toBe( 'unpinned-container' );
		pinButton.click();
		expect( pinnableElem.parentElement && pinnableElem.parentElement.id ).toBe( 'pinned-container' );
		unpinButton.click();
		expect( pinnableElem.parentElement && pinnableElem.parentElement.id ).toBe( 'unpinned-container' );
	} );

	test( 'calls features.toggleDocClasses(() when toggle is pressed', () => {
		initializeHTML( unpinnedData );
		pinnableElement.init();
		const pinButton = /** @type {HTMLElement} */ ( document.querySelector( '.vector-pinnable-header-pin-button' ) );
		const unpinButton = /** @type {HTMLElement} */ ( document.querySelector( '.vector-pinnable-header-unpin-button' ) );

		pinButton.click();
		expect( features.toggleDocClasses ).toHaveBeenCalledTimes( 1 );
		expect( features.toggleDocClasses ).toHaveBeenCalledWith( unpinnedData[ 'data-feature-name' ], true );

		features.toggleDocClasses.mockClear();
		unpinButton.click();
		expect( features.toggleDocClasses ).toHaveBeenCalledTimes( 1 );
		expect( features.toggleDocClasses ).toHaveBeenCalledWith( unpinnedData[ 'data-feature-name' ], false );
	} );

	test( 'isPinned() calls features.isEnabled()', () => {
		initializeHTML( unpinnedData );
		pinnableElement.init();
		const header = /** @type {HTMLElement} */ ( document.querySelector( `.${ unpinnedData[ 'data-pinnable-element-id' ] }-pinnable-header` ) );

		features.isEnabled.mockClear();
		pinnableElement.isPinned( header );
		expect( features.isEnabled ).toHaveBeenCalledTimes( 1 );
		expect( features.isEnabled ).toHaveBeenCalledWith( unpinnedData[ 'data-feature-name' ] );
	} );

	test( 'setFocusAfterToggle() sets focus on appropriate element after pinnableElement is toggled', () => {
		initializeHTML( unpinnedData );
		pinnableElement.init();
		const dropdownCheckbox = /** @type {HTMLElement} */ ( document.getElementById( 'checkbox' ) );
		const pinButton = /** @type {HTMLElement} */ ( document.querySelector( '.vector-pinnable-header-pin-button' ) );
		const unpinButton = /** @type {HTMLElement} */ ( document.querySelector( '.vector-pinnable-header-unpin-button' ) );

		pinButton.click();
		expect( document.activeElement ).toBe( unpinButton );
		unpinButton.click();
		expect( document.activeElement ).toBe( dropdownCheckbox );
	} );
	test( 'updates pinnable header classes when hideVectorColumnsHandler() is called', () => {
		initializeHTML( pinnedData );
		pinnableElement.init();
		const header = /** @type {HTMLElement} */ ( document.querySelector( `.${ pinnedData[ 'data-pinnable-element-id' ] }-pinnable-header` ) );
		expect( header.classList.contains( pinnableElement.PINNED_HEADER_CLASS ) ).toBe( true );
		expect( header.classList.contains( pinnableElement.UNPINNED_HEADER_CLASS ) ).toBe( false );
		pinnableElement.hideVectorColumnsHandler();
		expect( header.classList.contains( pinnableElement.PINNED_HEADER_CLASS ) ).toBe( false );
		expect( header.classList.contains( pinnableElement.UNPINNED_HEADER_CLASS ) ).toBe( true );
	} );
	test( 'restores to saved pinned state when restoreVectorColumnsHandler() is called', () => {
		initializeHTML( pinnedData );
		const header = /** @type {HTMLElement} */ ( document.querySelector( `.${ pinnedData[ 'data-pinnable-element-id' ] }-pinnable-header` ) );
		pinnableElement.init();
		pinnableElement.hideVectorColumnsHandler();
		expect( header.classList.contains( pinnableElement.PINNED_HEADER_CLASS ) ).toBe( false );
		expect( header.classList.contains( pinnableElement.UNPINNED_HEADER_CLASS ) ).toBe( true );
		pinnableElement.restoreVectorColumnsHandler();
		expect( header.classList.contains( pinnableElement.PINNED_HEADER_CLASS ) ).toBe( true );
		expect( header.classList.contains( pinnableElement.UNPINNED_HEADER_CLASS ) ).toBe( false );
	} );
	test( 'does nothing when restoring to unpinned saved state when restoreVectorColumnsHandler() is called', () => {
		initializeHTML( pinnedData );
		const header = /** @type {HTMLElement} */ ( document.querySelector( `.${ pinnedData[ 'data-pinnable-element-id' ] }-pinnable-header` ) );
		pinnableElement.init();
		const unpinButton = /** @type {HTMLElement} */ ( document.querySelector( '.vector-pinnable-header-unpin-button' ) );
		unpinButton.click();
		expect( header.classList.contains( pinnableElement.PINNED_HEADER_CLASS ) ).toBe( false );
		expect( header.classList.contains( pinnableElement.UNPINNED_HEADER_CLASS ) ).toBe( true );
		pinnableElement.hideVectorColumnsHandler();
		expect( header.classList.contains( pinnableElement.PINNED_HEADER_CLASS ) ).toBe( false );
		expect( header.classList.contains( pinnableElement.UNPINNED_HEADER_CLASS ) ).toBe( true );
		pinnableElement.restoreVectorColumnsHandler();
		expect( header.classList.contains( pinnableElement.PINNED_HEADER_CLASS ) ).toBe( false );
		expect( header.classList.contains( pinnableElement.UNPINNED_HEADER_CLASS ) ).toBe( true );
	} );
	test( 'shows a notification pointing at the new location when a pinnable element is unpinned', async () => {
		// Nothing here is stubbed but the loader, so this walks the whole chain the skin walks on a
		// real page: init() binds the toggle buttons, unpinning asks the notification module for a
		// notification, and that module fetches and mounts the component that renders it. The
		// loader's own answer never settles, which is both why the tests above run the same
		// production code without a notification appearing and why resolving it here is enough.
		jest.spyOn( mw.loader, 'using' ).mockImplementation( () => Promise.resolve() );
		// Warned on when the element the notification anchors to cannot be found. Asserted below so
		// that a fixture which stopped offering an anchor fails loudly here rather than silently
		// turning this into a test of the early return.
		const warn = jest.spyOn( mw.log, 'warn' );

		initializeHTML( pinnedData );
		pinnableElement.init();
		const unpinButton = /** @type {HTMLElement} */ ( document.querySelector( '.vector-pinnable-header-unpin-button' ) );
		expect( teleportTarget.querySelector( '.vector-popup-notification' ) ).toBeNull();

		unpinButton.click();
		// Fetching the module, creating the notification and showing it are each a step further
		// down one promise chain, and the render is queued behind all three.
		await flushPromises();

		// Fetched on demand: the module is named nowhere in the skin's own scripts or styles, so a
		// page on which nothing is ever unpinned pays nothing for it.
		expect( mw.loader.using ).toHaveBeenCalledWith( 'skins.vector.notification.codex' );
		const notification = /** @type {HTMLElement} */ ( teleportTarget.querySelector( '.vector-popup-notification' ) );
		expect( notification ).not.toBeNull();
		// The message function standing in for the real one answers with the key it was handed, so
		// the key the skin looked up for this element is what the notification ends up displaying.
		expect( notification.textContent ).toBe( `${ pinnedData[ 'data-pinnable-element-id' ] }-unpinned-popup` );
		expect( warn ).not.toHaveBeenCalled();
	} );
} );
