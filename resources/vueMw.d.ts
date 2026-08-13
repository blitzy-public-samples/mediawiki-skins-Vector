/**
 * Type declarations for the MediaWiki-specific additions to the Vue module.
 *
 * MediaWiki core adds `createMwApp` to the Vue object that ResourceLoader serves (see
 * `resources/src/vue/index.js` in core): it wraps `Vue.createApp` to install the error
 * logger and the i18n plugin and to provide `CdxTeleportTarget` and `CdxI18nFunction`,
 * none of which Vue 3 can register globally. Because the method is added by MediaWiki
 * rather than by Vue, the upstream `vue` package ships no declaration for it, and this
 * augmentation is what lets Vector's own modules call it without a type suppression.
 *
 * The bare `import 'vue';` below is required rather than incidental: it makes this file
 * a module, so the block augments the real `vue` module. Without it the block would
 * shadow `vue` instead, hiding every genuine Vue export from every consumer.
 */
import 'vue';

declare module 'vue' {
	/**
	 * Create a Vue application that is pre-configured for MediaWiki.
	 *
	 * The signature is deliberately loose. Core documents the wrapper as forwarding
	 * arbitrary arguments and returning a plain object, and a narrower return type would
	 * newly reject existing `.mount()` call sites that rely on the result of this call
	 * being untyped.
	 *
	 * @param {unknown} rootComponent Root component, or an options object, as accepted by
	 *  `Vue.createApp`.
	 * @param {unknown} [rootProps] Props to pass to the root component.
	 * @return {any} The Vue application instance, with the MediaWiki plugins installed.
	 */
	function createMwApp( rootComponent: unknown, rootProps?: unknown ): any;
}
