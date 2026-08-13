/**
 * Main entry of the `skins.vector.notification.codex` module: the one place a Vue
 * application is created for the notification path, and the one place its teleport
 * destination is named.
 *
 * The module is deliberately unreachable from a page view. Nothing lists it in a skin
 * `scripts` or `styles` array; it is resolved only through `mw.loader.using` inside the
 * notification module's `add()`, so a reader who never unpins an element downloads
 * neither this file nor the component library it pulls in. Keeping the framework behind
 * that boundary is what allows `resources/skins.vector.js/popupNotification.js` to keep
 * presenting a stable, framework-agnostic facade to its only caller.
 *
 * The notification's own stylesheet is *not* delivered here. It lives in
 * `resources/skins.vector.js/popupNotification.less` and ships eagerly with
 * `skins.vector.js`, which is why this module needs no style entry and why the rendered
 * notification is styled the instant it appears.
 *
 * Nothing in this file runs at require time beyond the requires themselves: no DOM is
 * touched, no page state is read and no listener is registered, so requiring the module
 * is safe regardless of when the loader resolves it.
 *
 * @module PopupNotificationApp
 */

const Vue = require( 'vue' );
const { h, ref } = Vue;
const PopupNotification = require( './PopupNotification.vue' );
// Module reference only. `teleportTarget` is read per mount rather than here so that the
// destination is resolved when a notification is actually created.
const pageReady = require( /** @type {string} */ ( 'mediawiki.page.ready' ) );

/**
 * Everything one notification needs, passed as a single object so that the boundary
 * between the notification module and this one cannot drift on argument order.
 *
 * @typedef {Object} NotificationOptions
 * @property {HTMLElement} anchor Element the notification is positioned against — in
 *  practice the dropdown container the notification module's `add()` was called with.
 * @property {string} message Notification text. Rendered as plain text, never as markup.
 * @property {string[]} classes Caller-supplied classes, applied alongside
 *  `vector-popup-notification` rather than instead of it.
 * @property {boolean} persistent Whether the notification waits to be dismissed, which is
 *  true when the caller asked for no auto-dismiss timeout. Drives the close button, and
 *  therefore the header.
 * @property {string} [title] Optional heading text. Normally unset, because the
 *  notification module's frozen signature carries no title argument.
 * @property {function(): void} onDismiss Called once for every real transition from open
 *  to closed, whatever caused it.
 */

/**
 * Private handle on one mounted notification, held by the notification module in its
 * registry. It is never handed to that module's own callers, so no framework or
 * component type escapes the notification module's facade.
 *
 * @typedef {Object} NotificationRecord
 * @property {function(boolean): void} setOpen Show or hide the notification.
 * @property {function(): boolean} isOpen Whether the notification is open right now.
 * @property {HTMLElement} host Element the application is mounted on.
 * @property {Object} app The application instance, kept for the life of the page.
 */

/**
 * Create and mount one notification, and return the handle that drives it.
 *
 * The application is created once per notification and then kept mounted for the life of
 * the page, with visibility driven entirely through the returned `setOpen`. That is a
 * requirement rather than a convenience: the notification module's registry never
 * discards an entry, so one notification id must keep resolving to one application.
 * Creating an application on show and destroying it on hide would break that identity
 * and leak a host element per cycle, so this function never tears the application down
 * and never removes the host.
 *
 * `host` is created but deliberately left out of the document. Everything visible is
 * teleported to the shared overlay target, so an attached host would only ever be an
 * empty element inside the anchor's markup. Mounting on a detached element is supported
 * and keeps the skin's own markup untouched.
 *
 * @param {NotificationOptions} options
 * @return {NotificationRecord}
 */
function mount( options ) {
	const host = document.createElement( 'div' );
	const open = ref( false );

	/**
	 * The single open-state transition, guarded so that only a real change takes effect.
	 *
	 * Both directions of control funnel through here: the notification module's own
	 * show and hide calls, and every close the component library owns — the header's
	 * close button, the Escape key and a click outside the notification, each of which
	 * arrives as an `update:open` of `false`. Guarding on an actual change is what makes
	 * `onDismiss` fire exactly once per dismissal and never at all when a notification
	 * that is already hidden is hidden again, which is the behaviour the popup this
	 * replaces had.
	 *
	 * @param {boolean} value
	 */
	function setOpen( value ) {
		if ( open.value === value ) {
			return;
		}
		open.value = value;
		if ( !value ) {
			options.onDismiss();
		}
	}

	// Reading `open.value` inside the render function is what subscribes it, so writing
	// through `setOpen` above is enough to open or close the rendered notification.
	const app = Vue.createMwApp( {
		render() {
			return h( PopupNotification, {
				anchor: options.anchor,
				message: options.message,
				classes: options.classes,
				persistent: options.persistent,
				title: options.title,
				open: open.value,
				'onUpdate:open': setOpen
			} );
		}
	} );
	// Named explicitly rather than relying on the application factory's own default, so
	// that the destination is stated in this skin's source and can be asserted here. The
	// component library falls back to the page root when the key is absent, and that
	// fallback must never be what renders the notification.
	app.provide( 'CdxTeleportTarget', pageReady.teleportTarget );
	app.mount( host );

	return {
		setOpen,
		isOpen: () => open.value,
		host,
		app
	};
}

module.exports = { mount };
