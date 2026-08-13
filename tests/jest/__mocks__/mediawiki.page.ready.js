module.exports = {
	checkboxHack: () => {},
	// Mirrors core's `mediawiki.page.ready/teleportTarget.js`, which creates this element at
	// module scope, attaches it to the body during page load, and exports it bare rather
	// than as the private `{ target, attach }` pair. It has to be a genuine element and not
	// a `classList` stub: both skin entry points call `classList.add( 'vector-body' )` on
	// it, and the Codex notification module makes it the Vue teleport destination. The id
	// is load-bearing as well, being what `skinStyles/teleportTarget.less` selects on.
	teleportTarget: ( () => {
		const target = document.createElement( 'div' );
		target.id = 'mw-teleport-target';
		document.body.appendChild( target );
		return target;
	} )()
};
