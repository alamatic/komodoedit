/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 * 
 * The contents of this file are subject to the Mozilla Public License
 * Version 1.1 (the "License"); you may not use this file except in
 * compliance with the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 * 
 * Software distributed under the License is distributed on an "AS IS"
 * basis, WITHOUT WARRANTY OF ANY KIND, either express or implied. See the
 * License for the specific language governing rights and limitations
 * under the License.
 * 
 * The Original Code is Komodo code.
 * 
 * The Initial Developer of the Original Code is ActiveState Software Inc.
 * Portions created by ActiveState Software Inc are Copyright (C) 2000-2007
 * ActiveState Software Inc. All Rights Reserved.
 * 
 * Contributor(s):
 *   ActiveState Software Inc
 * 
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 * 
 * ***** END LICENSE BLOCK ***** */

/* Abbreviations: insert toolbox snippets by name.
 *
 * See KD 196 (TODO: should move to KIPs).
 */

if (typeof(ko) == 'undefined') {
    var ko = {};
}

if (typeof(ko.abbrev)=='undefined') {
    ko.abbrev = {};
}

(function() {

var _bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                .getService(Components.interfaces.nsIStringBundleService)
                .createBundle("chrome://komodo/locale/library.properties");

var observerSvc = Components.classes["@mozilla.org/observer-service;1"].
                getService(Components.interfaces.nsIObserverService);

var handle_toolbox_updates = false;
var toolbox_notification_names = [
    "toolbox-reload-view",
    "toolbox-loaded-global",
    "toolbox-loaded-local",
    "toolbox-unloaded-global",
    "toolbox-unloaded-local",
    "toolbox-tree-changed",
    "tool-deleted",
    "tool-appearance-changed"
];

this.initialize = function initialize() {
    observerSvc.addObserver(this, "komodo-ui-started", false);
};

this._finish_initialize = function _finish_initialize() {
    this.log = ko.logging.getLogger('abbrev.js');
    ko.main.addWillCloseHandler(this.postCanClose, this);
    
    // Bug 96693: Watch for changes in the toolbox in order to track
    // all auto-abbreviation snippets, but after startup
    for each (var name in toolbox_notification_names) {
        observerSvc.addObserver(this, name, false);
    }
    handle_toolbox_updates = true;
    this.updateAutoAbbreviations();
};

this.postCanClose = function postCanClose() {
    handle_toolbox_updates = false;
    observerSvc.removeObserver(this, "komodo-ui-started");
    for each (var name in toolbox_notification_names) {
        observerSvc.removeObserver(this, name);
    }
};

this.observe = function(subject, topic, data) {
    if (topic == "komodo-ui-started") {
        this._finish_initialize();
    } else if (toolbox_notification_names.indexOf(topic) >= 0) {
        this.updateAutoAbbreviations();
    }
};

this.updateAutoAbbreviations = function updateAutoAbbreviations(event) {
    // Bug 96693: cache all auto_abbreviations to avoid looking up every
    // term.  On linux this query takes < 25% more of the time a lookup on
    // a single word takes, but is only done at startup and when the
    // toolbox or a snippet changes.
    if (!handle_toolbox_updates) {
        // We're shutting down, so don't bother processing.
        return;
    }
    try {
        var activeAutoAbbreviations;
        activeAutoAbbreviations = this.activeAutoAbbreviations = {};
        this.activeManualAbbreviations = {};
    
        var tbSvc = Components.classes["@activestate.com/koToolbox2Service;1"]
            .getService(Components.interfaces.koIToolbox2Service);
        var names = tbSvc.getAutoAbbreviationNames({});
        names.forEach(function(name) {
                // Map abbrev-name => { language => snippet|null }, lazily set
                activeAutoAbbreviations[name] = {};
            });
    } catch(ex) {
        this.log.exception(ex, "Failed to get abbreviations");
    }
}

// Note: If we want to support the full range of TextMate-style
// snippet tab-triggers, then 'wordLeftExtend' isn't
// sufficient. There is the (rare) TextMate tabTrigger that
// mixes word and non-word chars.
this._isWordChar_re = /[\w\d\-_=\+\.]/;
this.getWordStart = function(scimoz, lastCharPos, isHTMLLanguage) {
    var prevStyle = scimoz.getStyleAt(lastCharPos);
    var prevPos, firstPos = lastCharPos;
    // Match characters, not styles, if we're in default html
    var htmlCheck = (isHTMLLanguage && prevStyle == scimoz.SCE_UDL_M_DEFAULT);
    var prevChar;
    while (firstPos >= 1) {
        prevPos = scimoz.positionBefore(firstPos);
        if (prevStyle !== scimoz.getStyleAt(prevPos)) {
            break;
        }
        if (htmlCheck) {
            prevChar = scimoz.getWCharAt(prevPos);
            if (!this._isWordChar_re.test(prevChar)) {
                break;
            }
        }
        firstPos = prevPos;
    }
    return firstPos;
};

/**
 * Expands the abbreviation, if any, at the current cursor position.
 *
 * @param {String} abbrev Optional. The abbreviation to expand. If not
 *      given, then the current selection or word before the cursor is
 *      used.
 * @param {String} lang The language name to scope the search. Optional.
 * @param {String} sublang The sub-language name to scope the search.
 *      Optional.
 * @returns {Boolean} True if the snippet was found and inserted, false
 *      otherwise.
 */
this.expandAbbrev = function expandAbbrev(abbrev /* =null */,
                                          lang /* =null */,
                                          sublang /* =null */) {
    if (typeof(abbrev) == 'undefined') abbrev = null;
    if (typeof(lang) == 'undefined') lang = null;
    if (typeof(sublang) == 'undefined') sublang = null;

    var currView = ko.views.manager.currentView;
    
    // Determine the abbrev to look for.
    var scimoz = currView.scimoz;
    var koDoc = currView.koDoc;
    var languageObj = koDoc.languageObj;
    if (!abbrev) {
        var pos = scimoz.anchor;
        if (pos < scimoz.currentPos) {
            pos = scimoz.currentPos;
        }
        var prevPos = pos == 0 ? 0 : scimoz.positionBefore(pos);
        var isHTMLLanguage = languageObj.isHTMLLanguage;
        if (pos < scimoz.textLength
            && pos > 0
            && (scimoz.getStyleAt(prevPos) == scimoz.getStyleAt(pos)
                && (!isHTMLLanguage
                    || scimoz.getStyleAt(pos) != scimoz.SCE_UDL_M_DEFAULT
                    || this._isWordChar_re.test(scimoz.getWCharAt(pos))))) {
            // Don't expand if the cursor is not at the right of a possible
            // abbreviation.
            return false;
        }
        if (scimoz.anchor == scimoz.currentPos) {
            // Only do abbreviation expansion if next to a word char,
            // i.e. valid abbrev chars.
            if (pos == 0 || !is_abbrev(scimoz.getTextRange(prevPos, pos))) {
                ko.statusBar.AddMessage(
                    _bundle.GetStringFromName("noAbbreviationAtTheCurrentPosition"),
                    "abbrev", 5000, false);
                return false;
            }
        }
        var wordStartPos = this.getWordStart(scimoz, prevPos, isHTMLLanguage);
        abbrev = scimoz.getTextRange(wordStartPos, pos);
    }
    if (!lang || !sublang) {
        [lang, sublang, languageObj] = this._getLangAndSublangNames(koDoc, languageObj, prevPos);
    }
    if (!this._checkOpenTag(languageObj, scimoz, wordStartPos)) {
        return false;
    }
    var snippet = this._getCachedSnippet(abbrev, lang, sublang,
                                         /*isAutoAbbrev=*/false);
    var msg;
    var origPos = null;
    var origAnchor = null;
    if (snippet) {
        origPos = pos;
        origAnchor = scimoz.anchor;
        scimoz.currentPos = wordStartPos;
        scimoz.anchor = pos;
        if (ko.abbrev.insertAbbrevSnippet(snippet, currView)) {
            return true;
        } else {
            msg = _bundle.formatStringFromName("snippet X insertion deliberately suppressed", [snippet.name], 1);
        }
    } else {
        msg = _bundle.formatStringFromName("noAbbreviationWasFound", [abbrev], 1);
    }
    if (origPos !== null) { // Restore state.
        scimoz.currentPos = origPos;
        scimoz.anchor = origAnchor;
    }
    ko.statusBar.AddMessage(msg, "Editor", 5000, true);
    return false;
};

this._allowedStylesNameSets = ['keywords', 'classes', 'functions', 'identifiers',
                               'tags', 'classes', 'functions', 'keywords2',
                               'variables', 'modules'];
this._cachedAllowedStylesForLanguage = {};
this._allowedStylesForLanguage = function(languageObj) {
    var languageName = languageObj.name;
    if (!(languageName in this._cachedAllowedStylesForLanguage)) {
        var name_sets = this._allowedStylesNameSets;
        if (languageObj.isHTMLLanguage) {
            name_sets = name_sets.concat("default");
        }
        var allowedStyles = [];
        name_sets.forEach(function(name) {
                allowedStyles = allowedStyles.concat(languageObj.getNamedStyles(name));
            });
        this._cachedAllowedStylesForLanguage[languageName] = allowedStyles;
    }
    return this._cachedAllowedStylesForLanguage[languageName];
};

this.expandAutoAbbreviation = function(currView) {
    var scimoz = currView.scimoz;
    var currentPos = scimoz.anchor;
    if (currentPos < scimoz.currentPos) {
        currentPos = scimoz.currentPos;
    }
    var koDoc = currView.koDoc;
    // Note that the current character hasn't been styled yet, we're just
    // processing its keystroke event.
    // Also, don't expand auto-abbreviations if we aren't at the end of the line
    var lineEndPos = scimoz.getLineEndPosition(scimoz.lineFromPosition(currentPos));
    if (lineEndPos > currentPos) {
        return false;
    }
    var prevPos = currentPos == 0 ? 0 : scimoz.positionBefore(currentPos);
    var prevStyle = scimoz.getStyleAt(prevPos);
    var languageObj = koDoc.languageObj;
    var allowedStyles = this._allowedStylesForLanguage(languageObj);
    if (allowedStyles.indexOf(prevStyle) == -1) {
        return false;
    }
    var wordStartPos = this.getWordStart(scimoz, prevPos, languageObj.isHTMLLanguage);
    var abbrev = scimoz.getTextRange(wordStartPos, currentPos);
    if (!this._checkPossibleAbbreviation(abbrev)) {
        return false;
    }
    // At this point we might need to shift from the global doc language
    // to the sub-language at the current point.
    var languageName, subLanguageName;
    [languageName, subLanguageName, languageObj] = this._getLangAndSublangNames(koDoc, languageObj, prevPos)
    if (!this._checkOpenTag(languageObj, scimoz, wordStartPos)) {
        return false;
    }
    if (!this._checkPossibleAbbreviation(abbrev)) {
        return false;
    }
    var snippet = this._getCachedSnippet(abbrev, languageName, subLanguageName,
                                         /*isAutoAbbrev=*/true);
    if (snippet) {
        var origPos = currentPos;
        var origAnchor = scimoz.anchor;
        scimoz.currentPos = wordStartPos;
        scimoz.anchor = currentPos;
        if (ko.abbrev.insertAbbrevSnippet(snippet, currView)) {
            var pathPart = ko.snippets.snippetPathShortName(snippet);
            var msg = _bundle.formatStringFromName("inserted autoabbreviation X", [pathPart], 1);
            ko.statusBar.AddMessage(msg, "Editor", 1000, false);
            return true;
        }
        scimoz.currentPos = origPos;
        scimoz.anchor = origAnchor;
    }
    return false;
};

/**
 * Find a snippet for the given abbreviation name.
 *
 * Abbreviations used for snippets are looked for in
 * "Abbreviations" groups in these places:
 * 1. the current project (if any)
 * 2. the toolbox
 * 3. the shared toolbox (if any)
 *
 * And for these languages:
 * A. the current buffer sub-lang (for multi-lang files)
 * B. the current buffer lang (if different than A)
 * C. the "General" lang (i.e. not language-specific)
 *
 * @param {String} abbrev The abbreviation name.
 * @param {String} lang The language name to scope the search. Optional.
 *      If not given, then the language of the current view is used.
 *      Specify "General" to *not* search for a lang-specific
 *      abbreviation.
 * @param {String} sublang The sub-language name top scope the search.
 *      This can be relevant for multi-language files (e.g. HTML can have
 *      HTML and JavaScript and CSS). Optional. If not given, then
 *      the sub-lang of the current cursor position in the current view is
 *      used. Specify "General" to *not* search for a sub-lang-specific
 *      abbreviation.
 * @param {Boolean} isAutoAbbrev: True if we're trying to expand an
 *      auto-abbreviation snippet.
 * @returns {Components.interfaces.koITool} the relevant snippet,
 *      or null if no snippet is found.
 */
this.findAbbrevSnippet = function(abbrev, lang /* =<curr buf lang> */,
                                  sublang /* =<curr pos sublang> */,
                                  isAutoAbbrev) {
    if (typeof(lang) == 'undefined') lang = null;
    if (typeof(sublang) == 'undefined') sublang = null;
    
    // Determine 'lang' and 'sublang', if not provided.
    var currView = ko.views.manager.currentView;
    if (lang == null && currView && currView.koDoc) {
        lang = currView.koDoc.language;
    }
    if (sublang == null && currView && currView.koDoc) {
        sublang = currView.koDoc.subLanguage;
    }
    
    // The list of sub-folder names under an "Abbreviations" folder in
    // which to look for the snippet.
    var subnames = [];
    if (sublang) subnames.push(sublang);
    if (lang && subnames.indexOf(lang) == -1) subnames.push(lang);
    if (subnames.indexOf("General") == -1) subnames.push("General");
    
    return ko.toolbox2.getAbbreviationSnippet(abbrev, subnames, isAutoAbbrev);
}


/**
 * Insert an abbreviation snippet into a buffer.
 *
 * @param snippet {Components.interfaces.koITool} The snippet part
 *      to insert. You can use `ko.abbrev.findAbbrevSnippet()` to get one.
 * @param view {Components.interfaces.koIView} The buffer view in which to
 *      insert the snippet. Optional. If not specified then the current
 *      view is used.
 * @returns {boolean} true if a snippet was inserted, false if not.
 */
this.insertAbbrevSnippet = function(snippet, view /* =<curr view> */) {
    if (!snippet) {
        return false;
    }
    if (typeof(view) == 'undefined' || view == null) {
        view = ko.views.manager.currentView;
    }

    var scimoz = view.scimoz;
    var enteredUndoableTabstop = false;
    ko.tabstops.clearTabstopInfo(view); // could call endUndoAction() if there are active links
    scimoz.beginUndoAction();
    try {
        enteredUndoableTabstop = ko.projects.snippetInsertImpl(snippet, view);
    } catch(ex) {
        //dump("snippetInsertImpl failed: " + ex + "\n");
        return false;
    } finally {
        if (!enteredUndoableTabstop) {
            scimoz.endUndoAction();
        }
    }
    return true;
}

this._checkPossibleAbbreviation = function _checkPossibleAbbreviation(abbrev) {
    try {
        if (!(abbrev in this.activeAutoAbbreviations)) {
            // Bug 96693: avoid database lookups when the term on the right
            // is known not to be an auto-abbreviation (for any language)
            return false;
        }
    } catch(ex) {
        if (ex instanceof TypeError) {
            this.log.warn("Never got a komodo-ui-started notification, do it now");
            this._finish_initialize();
            // And retry.
            if (!(abbrev in this.activeAutoAbbreviations)) {
                return false;
            }
        } else {
            this.log.exception(ex, "Unexpected problem checking for abbrev in this.activeAutoAbbreviations");
            return false;
        }
    }
    return true;
};

this._getLangAndSublangNames = function _getLangAndSublangNames(koDoc, languageObj, prevPos) {
/**
 * Given the current view, language, and position, determine whether we're
 * at the top-level language, or are looking at a sublanguage.
 * @returns @array [ languageName {String}, subLanguageName {String},
 *                   languageObj { koILanguage }]
 * If the actual subLanguageName is the same as languageName,
 * the returned subLanguageName is nulil.
 */
    var languageName = koDoc.language;
    var subLanguageName = null;
    if (koDoc.subLanguage != languageName) {
        subLanguageName = koDoc.languageForPosition(prevPos);
        languageObj = Components.classes["@activestate.com/koLanguageRegistryService;1"]
            .getService(Components.interfaces.koILanguageRegistryService).getLanguage(subLanguageName);
    }
    return [languageName, subLanguageName, languageObj];
};

this._checkOpenTag = function _checkOpenTag(languageObj, scimoz, wordStartPos) {
    if (languageObj.supportsSmartIndent != "XML") {
        return true; // it's ok
    }
    var wordStartStyle = scimoz.getStyleAt(wordStartPos);
    if (wordStartStyle != scimoz.SCE_UDL_M_TAGNAME) {
        // Must be a plain style, so it's expandable.
        return true; // it's ok
    }
    // Verify that it starts with a start-tag-open ("<").
    var prevPrevPos = scimoz.positionBefore(wordStartPos);
    return scimoz.getStyleAt(prevPrevPos) == scimoz.SCE_UDL_M_STAGO;
};

this._getCachedSnippet = function _getCachedSnippet(abbrev, lang, sublang,
                                                    isAutoAbbrev) {
    var abbrevInfo, snippet;
    var collection = isAutoAbbrev ? this.activeAutoAbbreviations: this.activeManualAbbreviations;
    var langKey = (sublang || lang) + ":" + (isAutoAbbrev ? "1" : "0");
    if (abbrev in collection) {
        abbrevInfo = collection[abbrev];
        if (abbrevInfo && langKey in abbrevInfo) {
            return abbrevInfo[langKey];
        }
    } else {
        abbrevInfo = null;
    }
    // Find the snippet for this abbrev, if any, and insert it.
    // We know that the current abbrev is an auto-abbreviation for
    // *some* language, here we check to see if it's valid for
    // the current language.  If so, cache it.  If not, mark it as
    // null, so subsequent occurrences of this word don't cause
    // database lookups.
    snippet = ko.abbrev.findAbbrevSnippet(abbrev,
                                          lang,
                                          sublang,
                                          isAutoAbbrev);
    if (!abbrevInfo) {
        abbrevInfo = collection[abbrev] = {};
    }
    if (snippet) {
        // Cache the snippet until the next time anything in the
        // toolbox changes.
        abbrevInfo[langKey] = snippet;
    } else {
        abbrevInfo[langKey] = null;
    }
    return snippet;
};

// Currently don't allow triggering at a whitespace char.
function is_abbrev(s) {
    return !/\s/.test(s);
}

}).apply(ko.abbrev);
ko.abbrev.initialize();
