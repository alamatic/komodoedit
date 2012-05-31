/* Copyright (c) 2009 ActiveState
   See the file LICENSE.txt for licensing information. */

/**
 * This is an XPCOM wrapper the JavaScript (npruntime) scimoz object:
 */

const {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

/***********************************************************
 *              XPCOM class definition                     *
 ***********************************************************/

// Class constructor.
function koSciMozWrapper() {
    this.wrappedJSObject = this;
}

// Class definition.
koSciMozWrapper.prototype = {

    // properties required for XPCOM registration:
    classDescription: "XPCOM wrapper around the npruntime scimoz object",

    classID:          Components.ID("{487f68c7-386a-4802-8874-b0f4912e59dc}"),
    contractID:       "@activestate.com/koSciMozWrapper;1",

    _interfaces: [Ci.nsIClassInfo,
                  Ci.ISciMozLite,
                  Ci.ISciMoz,
                  Ci.nsISupportsWeakReference],
    /* see bottom of file for QI impl */

    getInterfaces: function getInterfaces(aCount) {
        aCount.value = this._interfaces.length;
        return Array.slice(this._interfaces);
    },

    getHelperForLanguage: function() null,
    implementationLanguage: Ci.nsIProgrammingLanguage.JAVASCRIPT,
    flags: Ci.nsIClassInfo.MAIN_THREAD_ONLY |
           Ci.nsIClassInfo.EAGER_CLASSINFO,

    __scimoz: null,
};

__ISCIMOZ_JS_WRAPPER_GEN__

// implement QI. This needs to happen after the generated code because that
// determines which interfaces to support (due to the _Part? interfaces).
koSciMozWrapper.prototype.QueryInterface =
    XPCOMUtils.generateQI(koSciMozWrapper.prototype._interfaces);

// Override handleTextEvent, since we use the IME helper for that
koSciMozWrapper.prototype.handleTextEvent =
    function handleTextEvent(aEvent, aBoxObject) {
        return this._IMEHelper.handleTextEvent(aEvent, aBoxObject);
    };

// setWordChars compatibility wrapper; see bug 80095 - new code should be using
// scimoz.wordChars = "xxx" instead of scimoz.setWordChars("xxx")
koSciMozWrapper.prototype.setWordChars =
    function setWordChars(aCharacters) {
        this._log.deprecated('scimoz.setWordChars() is deprecated, use scimoz.wordChars = "abc" instead');
        this.wordChars = aCharacters;
    };

XPCOMUtils.defineLazyGetter(koSciMozWrapper.prototype, "_log", function() {
    return Cu.import("chrome://komodo/content/library/logging.js", {})
             .logging
             .getLogger("scimoz.wrapper");
});


/**
 * Initialize the plugin wrapper.
 * @param aPlugin the plugin to wrap
 * @note This isn't an interface method; also, it overrides the stub version
 *       because that does the wrong thing completely (we don't want to just
 *       pass everything to the plugin).
 */
koSciMozWrapper.prototype.init =
    function koSciMozWrapper_init(aPlugin, aFocusElement) {
        this.__scimoz = aPlugin;
        this._IMEHelper = Cc["@activestate.com/koSciMozIMEHelper;1"]
                            .createInstance(Ci.koISciMozIMEHelper);
        this._IMEHelper.init(this, aFocusElement);
        this.__scimoz.init(this._IMEHelper);
    };

// XPCOM registration of class.
var components = [koSciMozWrapper];
const NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
