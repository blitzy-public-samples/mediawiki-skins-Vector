/** @module PopupNotification */

/**
 * Opaque reference to one notification: what `add()` resolves with, and what `show()` and
 * `hide()` expect back.
 *
 * It carries the notification's id and nothing else. Keeping the objects that actually
 * render a notification out of it is what lets the implementation behind this module change
 * without any caller noticing, and it is why the two maps below — not the handle — are what
 * turn a handle back into the thing it addresses.
 *
 * @typedef {Object} NotificationHandle
 * @property {string} id
 */

/**
 * Private control surface for one mounted notification, obtained from the module that
 * renders it and never handed outward.
 *
 * `setOpen` is the whole behavioural contract needed here. It ignores a request that would
 * not change anything, and it reports every real transition from open to closed to the
 * caller's dismiss callback itself, which is why nothing in this file re-implements that
 * guard. The record also exposes `isOpen`, `host` and `app`; none is needed here, so none
 * is modelled.
 *
 * @typedef {Object} NotificationRecord
 * @property {function(boolean): void} setOpen
 */

/**
 * Notifications addressable by the id their caller supplied, so that asking twice for the
 * same id reuses the notification that already exists, and so that `hideAll()` knows what
 * to sweep.
 *
 * Entries are deliberately never removed. A notification is created once per id and then
 * stays mounted for the life of the page with only its visibility toggled, so one id keeps
 * resolving to one notification — exactly as it did before.
 *
 * @type {Map<string,NotificationHandle>}
 */
const activeNotification = new Map();

/**
 * Every notification this module has created, keyed by the handle that addresses it.
 *
 * Keying on the handle rather than on the id is what keeps a notification added without an
 * id usable. Such a notification is intentionally absent from `activeNotification` above,
 * so it takes no part in reuse or in `hideAll()`, yet its handle still resolves here. A
 * handle this module never issued resolves to nothing, which is what makes `show()` and
 * `hide()` fail safe instead of throwing.
 *
 * @type {Map<NotificationHandle,NotificationRecord>}
 */
const notificationRecord = new Map();

/**
 * Adds and show a popup to the user to point them to the new location of the element
 *
 * The module that renders the notification is fetched on demand and is reachable no other
 * way — nothing lists it among a skin's scripts or styles — so a page view on which nothing
 * is ever unpinned never pays for it.
 *
 * @param {HTMLElement} container
 * @param {string} message
 * @param {string} id
 * @param {string[]} [classes]
 * @param {number|false} [timeout]
 * @param {Function} [onDismiss]
 * @return {Promise<NotificationHandle|undefined>}
 */
function add( container, message, id, classes = [], timeout = 4000, onDismiss = () => {} ) {
	// The loader answers with a jQuery promise. Wrapping it is what makes this function's
	// own contract a native one, so a caller never has to know which kind it is holding.
	return Promise.resolve( mw.loader.using( 'skins.vector.notification.codex' ) ).then( () => {
		// use existing hint.
		if ( id && activeNotification.has( id ) ) {
			return activeNotification.get( id );
		}
		const { mount } = require( /** @type {string} */ ( 'skins.vector.notification.codex' ) );
		const /** @type {NotificationHandle} */ handle = { id };
		// `timeout === false` fuses two unrelated decisions into one value: whether the
		// notification dismisses itself, and whether it offers the reader a way to dismiss
		// it. Only the second affects what is rendered, so only that crosses over, as a
		// plain boolean, and the union itself goes no further than this call. No title is
		// supplied because this module's signature carries none, and an absent title
		// renders no heading — reproducing the header the previous popup showed.
		notificationRecord.set( handle, mount( {
			anchor: container,
			message,
			classes,
			persistent: timeout === false,
			onDismiss
		} ) );
		if ( id ) {
			activeNotification.set( id, handle );
		}
		return handle;
	} );
}
/**
 * Hides the notification
 *
 * @param {NotificationHandle} handle as resolved by add()
 */
function hide( handle ) {
	const record = notificationRecord.get( handle );
	if ( !record ) {
		return;
	}
	record.setOpen( false );
}
/**
 * Shows the notification
 *
 * @param {NotificationHandle} handle as resolved by add()
 * @param {number|false} [timeout] use false if user must dismiss it themselves.
 */
function show( handle, timeout = 4000 ) {
	const record = notificationRecord.get( handle );
	if ( !record ) {
		return;
	}
	record.setOpen( true );
	// hide the popup after timeout ms
	//
	// `false` asks for no self-dismissal at all; anything else is the delay, in
	// milliseconds, that this module owns outright — the component has no notion of a
	// timer. Normalising the union here, once, is what keeps it out of everything below.
	// A plain timer is used deliberately, so that a test or a capture harness can drive it
	// from a controlled clock.
	const autoDismissMs = timeout === false ? null : timeout;
	if ( autoDismissMs === null ) {
		return;
	}
	// Showing an already-visible notification starts a second timer without cancelling the
	// first, as it always has. That is left exactly as it was: changing it would alter
	// behaviour this rewrite is required to preserve.
	setTimeout( () => {
		hide( handle );
	}, autoDismissMs );
}

/**
 * Hides all popups
 *
 * Only notifications added with an id are tracked, so this sweeps precisely what it swept
 * before, and an empty registry makes it a silent no-op. Every entry is hidden through
 * `hide()`, so one that is already hidden stays quiet and does not re-run its dismiss
 * callback.
 */
function hideAll() {
	activeNotification.forEach( hide );
}

module.exports = {
	add,
	hide,
	hideAll,
	show
};
