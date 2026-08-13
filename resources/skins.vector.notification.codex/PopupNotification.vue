<template>
	<cdx-popover
		v-model:open="openModel"
		:class="rootClasses"
		:anchor="anchor"
		placement="bottom"
		:title="title"
		:use-close-button="persistent">
		<p>{{ message }}</p>
	</cdx-popover>
</template>

<script>
/**
 * Anchored, dismissible notification bubble used to point a reader at the new location of
 * an element they have just unpinned.
 *
 * This is a deliberately thin wrapper around a single design-system component. It owns no
 * timer, no registry and no DOM insertion: the auto-dismiss timer and the one-notification-
 * per-id registry live in `resources/skins.vector.js/popupNotification.js`, and app creation
 * plus the teleport destination live in this module's `index.js`. Keeping all of that outside
 * the component is what lets the notification module present a stable, framework-agnostic
 * facade to its only caller while the implementation behind it changes.
 *
 * Everything visual — surface colour, border, radius, padding, elevation, arrow geometry and
 * stacking — is supplied by the design system's own tokens on its own elements, so this file
 * ships no stylesheet block of its own and sets no visual value. Doing so would also create a
 * silently unlinted surface, because the project's style linter covers only .less and .css.
 * The one Vector-owned declaration that still applies to the rendered notification — the
 * message font size — lives in `resources/skins.vector.js/popupNotification.less` and is
 * delivered eagerly with `skins.vector.js`. It matches the paragraph below by descent, which
 * is why that paragraph needs no class here.
 *
 * The component is inert on `require`: it registers no listener, touches no DOM and reads no
 * page state at module scope. It is also safe to keep mounted indefinitely and to toggle
 * through `open` many times, which is required because the caller's registry never discards
 * an entry once created.
 */
const { defineComponent } = require( 'vue' );
const { CdxPopover } = require( '@wikimedia/codex' );

/*
 * BLITZY [A11Y]: the design-system component renders the notification panel with no `role` and
 * no live-region attribute, keeps no focus trap while open, and does not return focus to the
 * anchor when it closes. Those are library-owned behaviours, and this component's attribute
 * surface is fixed by the notification module's contract, so none of them is overridden here.
 * Keyboard dismissal is still available: the library closes on Escape. Flagged for review.
 */

// @vue/component
module.exports = exports = defineComponent( {
	name: 'PopupNotification',
	components: { CdxPopover },
	props: {
		/**
		 * Element the notification is positioned against — in practice the dropdown
		 * container passed to the notification module's `add()`. An `HTMLElement` is an
		 * accepted anchor, so no wrapper element is introduced to host it.
		 *
		 * Declared exactly as the library declares its own `anchor` prop, including the
		 * `null` default: making it required would emit a framework warning whenever it
		 * is omitted, and the notification path must stay warning-free. The library does
		 * log a warning of its own when the anchor is absent, so callers are expected
		 * always to supply a real element.
		 */
		anchor: {
			type: Object,
			default: null
		},
		/**
		 * Notification text. Rendered as plain text through interpolation, never as
		 * markup, preserving the `textContent` semantics of the popup this replaces.
		 */
		message: {
			type: String,
			required: true
		},
		/**
		 * Extra classes supplied by the caller. Applied alongside
		 * `vector-popup-notification` rather than instead of it — see `rootClasses`.
		 *
		 * The declared type plus the empty-array default are the whole guard here: a
		 * caller passing something other than an array is reported by the framework's
		 * own prop validation, so no redundant runtime check is added.
		 */
		classes: {
			type: Array,
			default: () => []
		},
		/**
		 * Whether the notification stays open until the reader dismisses it, which is
		 * true when the caller asked for no auto-dismiss timeout.
		 *
		 * Drives the close button, and therefore the header: the library renders its
		 * header when there is a title, an icon or a close button, so a persistent
		 * notification gets a header containing only the close button — exactly the
		 * conditional header the popup this replaces produced.
		 */
		persistent: {
			type: Boolean,
			default: false
		},
		/**
		 * Optional heading text. Forwarded to the library so that a caller which has a
		 * title to show can supply one, but left empty by the notification module because
		 * its frozen `add()` signature carries no title argument. An empty title renders
		 * no heading element, which is what reproduces the previous popup's header.
		 */
		title: {
			type: String,
			default: ''
		},
		/**
		 * Whether the notification is currently visible. The authoritative value lives
		 * outside the component, so this is read through `openModel` and never mutated.
		 */
		open: {
			type: Boolean,
			default: false
		}
	},
	emits: [ 'update:open' ],
	computed: {
		/**
		 * Visibility, as a two-way binding over the `open` prop.
		 *
		 * The getter reads the prop and the setter re-emits instead of mutating it, so the
		 * owner of the state stays outside the component. Every close path the library
		 * owns — the header's close button, the Escape key and a click outside the
		 * notification — routes through the library's own close handler and therefore
		 * through this setter, which is what allows a single dismissal guard to live in
		 * one place outside this file instead of being duplicated per close reason.
		 */
		openModel: {
			get() {
				return this.open;
			},
			set( value ) {
				this.$emit( 'update:open', value );
			}
		},
		/**
		 * Class list for the rendered notification.
		 *
		 * `vector-popup-notification` is always first so the skin's own stylesheet keeps
		 * matching, and the caller's classes follow. The library does not inherit
		 * attributes onto its outermost node; it merges them onto the notification panel
		 * itself and concatenates class values while doing so, so these classes land on
		 * the same element that carries the library's own class. No wrapper element is
		 * needed to make them apply.
		 *
		 * @return {string[]}
		 */
		rootClasses() {
			return [ 'vector-popup-notification' ].concat( this.classes );
		}
	}
} );
</script>
