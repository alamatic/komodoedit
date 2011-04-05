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

/**
 * JavaScript-side control of the Code Intelligence system in Komodo
 * (code browsing, autocomplete and calltip triggering).
 */

if (typeof(ko) == 'undefined') {
    var ko = {};
}

if (typeof(ko.codeintel)!='undefined') {
    ko.logging.getLogger('').warn("ko.codeintel was already loaded, re-creating it.\n");
}
ko.codeintel = {};


(function() {

    var log = ko.logging.getLogger("codeintel_js");
    //log.setLevel(ko.logging.LOG_DEBUG);

    var _codeintelSvc = Components.classes["@activestate.com/koCodeIntelService;1"]
                              .getService(Components.interfaces.koICodeIntelService);

    // ko.codeintel.isActive is true iff the Code Intel system is enabled,
    // initialized, and active.
    this.isActive = false;


    // Internal helper routines.

    /* Upgrade the codeintel database, if necessary.
     * This should only be done once per Komodo *app* (not once per window).
     */
    function _CodeIntel_UpgradeDBIfNecessary()
    {
        log.debug("_CodeIntel_UpgradeDBIfNecessary()");
        var lastErrorSvc = Components.classes["@activestate.com/koLastErrorService;1"].
                            getService(Components.interfaces.koILastErrorService);
        var needToUpgrade = null;
        try {
            needToUpgrade = _codeintelSvc.needToUpgradeDB();
        } catch(ex) {
            var err = lastErrorSvc.getLastErrorMessage();
            if (!err) {
                err = "<no error message: see 'pystderr.log' error log in your Komodo user data dir>";
            }
            ko.dialogs.alert("Could not upgrade your Code Intelligence Database "+
                         "because: "+err+". Your database will be backed up "+
                         "and a new empty database will be created.", null,
                         "Code Intelligence Database");
            _codeintelSvc.resetDB();
            return;
        }
    
        if (needToUpgrade) {
            var upgrader = Components.classes["@activestate.com/koCodeIntelDBUpgrader;1"]
                            .createInstance(Components.interfaces.koIShowsProgress);
            ko.dialogs.progress(upgrader,
                            "Upgrading Code Intelligence Database.",
                            "Code Intelligence",
                            false);  // cancellable
        }
    }
    
    
    function _CodeIntel_PreloadDBIfNecessary()
    {
        log.debug("_CodeIntel_PreloadDBIfNecessary()");
        try {
            if (! ko.prefs.getBooleanPref("codeintel_have_preloaded_database")) {
                var preloader = Components.classes["@activestate.com/koCodeIntelDBPreloader;1"]
                                .createInstance(Components.interfaces.koIShowsProgress);
                ko.dialogs.progress(preloader,
                                "Pre-loading Code Intelligence Database. "
                                    +"This process will improve the speed of first "
                                    +"time autocomplete and calltips. It typically "
                                    +"takes less than a minute.",
                                "Code Intelligence",
                                true,   // cancellable
                                null,   // cancel warning
                                false); // modal
            }
        } catch(e) {
            log.exception(e);
        }
    }
    
    //function CodeIntel_UpdateCatalogZoneIfNecessary()
    //{
    //    log.debug("CodeIntel_UpdateCatalogZoneIfNecessary()");
    //    try {
    //        if (! ko.prefs.getBooleanPref("codeintel_have_preloaded_database")) {
    //            var preloader = Components.classes["@activestate.com/koCodeIntelDBPreloader;1"]
    //                            .createInstance(Components.interfaces.koIShowsProgress);
    //            ko.dialogs.progress(preloader,
    //                            "Pre-loading Code Intelligence Database. "
    //                                +"This process will improve the speed of first "
    //                                +"time autocomplete and calltips. It typically "
    //                                +"takes less than a minute.",
    //                            "Code Intelligence",
    //                            true,   // cancellable
    //                            null,   // cancel warning
    //                            false); // modal
    //        }
    //    } catch(e) {
    //        log.exception(e);
    //    }
    //}
    
    
    function _CodeIntel_ActivateWindow()
    {
        log.debug("_CodeIntel_ActivateWindow()");
        try {
            // Setup services.
            //TODO: Race condition on startup here! If two Komodo windows
            //      open quickly then they'll both start the "upgrade if
            //      necessary".
            if (! _codeintelSvc.isBackEndActive) {
                try {
                    _CodeIntel_UpgradeDBIfNecessary();
                    _codeintelSvc.activateBackEnd();
                    _CodeIntel_PreloadDBIfNecessary();
                } catch(ex2) {
                    log.exception(ex2);
                    var lastErrorSvc = Components.classes["@activestate.com/koLastErrorService;1"].
                                        getService(Components.interfaces.koILastErrorService);
                    var err = lastErrorSvc.getLastErrorMessage();
                    ko.dialogs.internalError(err, ex2+"\n\n"+err, ex2);
                    _CodeIntel_DeactivateWindow();
                    return;
                }
            }
    
            ko.codeintel.isActive = true;
            xtk.domutils.fireEvent(window, "codeintel_activated_window");
        } catch(ex) {
            log.exception(ex);
        }
    }
    
    
    function _CodeIntel_DeactivateWindow()
    {
        log.debug("_CodeIntel_DeactivateWindow()");
        try {
            ko.codeintel.isActive = false;
            xtk.domutils.fireEvent(window, "codeintel_deactivated_window");
            window.updateCommands('codebrowser');
        } catch(ex) {
            log.exception(ex);
        }
    }

    //---- public routines
    
    this.initialize = function CodeIntel_InitializeWindow()
    {
        log.debug("initialize()");
        try {
            if (ko.prefs.getBooleanPref("codeintel_enabled")) {
                _CodeIntel_ActivateWindow();
            } else {
                _CodeIntel_DeactivateWindow();
            }
            ko.main.addWillCloseHandler(ko.codeintel.finalize);
        } catch(ex) {
            log.exception(ex);
        }
    }
    
    this.finalize = function CodeIntel_FinalizeWindow()
    {
        log.debug("finalize()");
        try {
            _CodeIntel_DeactivateWindow();
        } catch(ex) {
            log.exception(ex);
        }
    }

    this.is_cpln_lang = function CodeIntel_is_cpln_lang(lang)
    {
        return _codeintelSvc.is_cpln_lang(lang);
    }

    this.is_citadel_lang = function CodeIntel_is_citadel_lang(lang)
    {
        return _codeintelSvc.is_citadel_lang(lang);
    }

    this.is_xml_lang = function CodeIntel_is_xml_lang(lang)
    {
        return _codeintelSvc.is_xml_lang(lang);
    }

    this.scan_document = function CodeIntel_scan_document(koDoc, linesAdded, forcedScan)
    {
        log.debug("scan_document()");
        try {
            _codeintelSvc.scan_document(koDoc, linesAdded, !forcedScan);
        } catch(ex) {
            log.exception(ex);
        }
    }

    /**
     * Link the current Komodo project with the provided codeintel buffer.
     *
     * Note: See bug 88841 for details on why this is necessary.
     */
    this.linkCurrentProjectWithBuffer = function ko_codeintel_linkProject(ciBuffer) {
        // Hack: Assign the project on this buffer. Would prefer if this was
        //       managed by the codeintel system itself, but at present there is
        //       a disconnect between projects (which are per window) and the
        //       codeintel service (which is a singleton).
        var currentProject = ko.projects.manager.currentProject;
        if (currentProject) {
            ciBuffer.project = currentProject;
        }
    }

    /**
     * Trigger a completion (i.e. an autocomplete or calltip session)
     * if appropriate.
     */
    this.trigger = function ko_codeintel_trigger(view) {

        var scimoz = view.scimoz;
        var ciBuffer = view.koDoc.ciBuf;

        this.linkCurrentProjectWithBuffer(ciBuffer);

        var trg = ciBuffer.trg_from_pos(scimoz.currentPos, true);
        if (!trg) {
            // Do nothing.
        } else if (scimoz.autoCActive() && view._ciLastTrg &&
                   trg.is_same(view._ciLastTrg))
        {
            // Bug 55378: Don't re-eval trigger if same one is showing.
            // PERF: Consider passing _ciLastTrg to trg_from_pos() if
            //       autoCActive to allow to abort early if looks like
            //       equivalent trigger will be generated.
        } else {
            // PERF: Should we re-use controllers? Need a pool then?
            //       Try to save and re-use ctlr on each view.
            var ctlr = Components.classes["@activestate.com/koCodeIntelEvalController;1"].
                        createInstance(Components.interfaces.koICodeIntelEvalController);
            ctlr.set_ui_handler(view.ciCompletionUIHandler);
            view._ciLastTrg = trg;
            ciBuffer.async_eval_at_trg(trg, ctlr);
        }
    }


    //---- the UI manager for completions (autocomplete/calltip) in a view
    // NOTE: Should be able to move this completion UI handler stuff to
    //       Python-side. Hence would cleanly fit into
    //       class KoCodeIntelEvalController.

    this.CompletionUIHandler = function CodeIntelCompletionUIHandler(path, scimoz, language, 
                                          /* codeintel.Buffer */ buf)
    {
        log.debug("CompletionUIHandler(path, scimoz, language, buf)");
        try {
            this.path = path;
            /**
             * @type {Components.interfaces.ISciMoz}
             */
            this.scimoz = scimoz;
            this.language = language;
            this.buf = buf;
            this.completionFillups = buf.cpln_fillup_chars;
            scimoz.autoCSeparator = buf.scintilla_cpln_sep_ord;
            scimoz.autoCStops(buf.cpln_stop_chars);
    
            this._timeSvc = Components.classes["@activestate.com/koTime;1"].
                                getService(Components.interfaces.koITime);
            this._lastRecentPrecedingCompletionAttemptPos = null;
            this._lastRecentPrecedingCompletionAttemptTime = null;
            this._lastRecentPrecedingCompletionAttemptTimeout = 3.0;
    
            if (ko.prefs.getBooleanPref("codeintel_completion_auto_fillups_enabled")) {
                scimoz.autoCSetFillUps(this.completionFillups);
            }
            // Don't hide when there is no match: may just be mistyped character.
            scimoz.autoCAutoHide = false;
            // Order members as if all uppercase: "One result of this is that the
            // list should be sorted with the punctuation characters '[', '\',
            // ']', '^', '_', and '`' sorted after letters."
            scimoz.autoCIgnoreCase = true;
    
            // Register images for autocomplete lists.
            var iface = Components.interfaces.koICodeIntelCompletionUIHandler;
            scimoz.registerImage(iface.ACIID_CLASS,            ko.markers.getPixmap("chrome://komodo/skin/images/ac_class.xpm"));
            scimoz.registerImage(iface.ACIID_FUNCTION,         ko.markers.getPixmap("chrome://komodo/skin/images/ac_function.xpm"));
            scimoz.registerImage(iface.ACIID_MODULE,           ko.markers.getPixmap("chrome://komodo/skin/images/ac_module.xpm"));
            scimoz.registerImage(iface.ACIID_VARIABLE,         ko.markers.getPixmap("chrome://komodo/skin/images/ac_variable.xpm"));
            scimoz.registerImage(iface.ACIID_VARIABLE_SCALAR,  ko.markers.getPixmap("chrome://komodo/skin/images/ac_variable_scalar.xpm"));
            scimoz.registerImage(iface.ACIID_VARIABLE_ARRAY,   ko.markers.getPixmap("chrome://komodo/skin/images/ac_variable_array.xpm"));
            scimoz.registerImage(iface.ACIID_VARIABLE_HASH,    ko.markers.getPixmap("chrome://komodo/skin/images/ac_variable_hash.xpm"));
            scimoz.registerImage(iface.ACIID_INTERFACE,        ko.markers.getPixmap("chrome://komodo/skin/images/ac_interface.xpm"));
            //XXX These two should change to a "directory" one and something
            //    better than the crap namespace icon for Ruby modules
            //    (different than what CodeIntel calls a "module").
            scimoz.registerImage(iface.ACIID_DIRECTORY,        ko.markers.getPixmap("chrome://komodo/skin/images/ac_directory.xpm"));
            scimoz.registerImage(iface.ACIID_NAMESPACE,        ko.markers.getPixmap("chrome://komodo/skin/images/ac_namespace.xpm"));
            scimoz.registerImage(iface.ACIID_XML_ELEMENT,      ko.markers.getPixmap("chrome://komodo/skin/images/ac_xml_element.xpm"));
            scimoz.registerImage(iface.ACIID_XML_ATTRIBUTE,    ko.markers.getPixmap("chrome://komodo/skin/images/ac_xml_attribute.xpm"));
            scimoz.registerImage(iface.ACIID_CONSTANT,         ko.markers.getPixmap("chrome://komodo/skin/images/ac_constant.xpm"));
            // XXX: Need a better image (a dedicated keyword image)
            scimoz.registerImage(iface.ACIID_KEYWORD,          ko.markers.getPixmap("chrome://komodo/skin/images/ac_interface.xpm"));
    
            this.callTipStack = [];
            // Can't use scimoz.{autoC|callTip}PosStart() for this because (1)
            // there is a bug in .callTipPosStart();
            //      http://mailman.lyra.org/pipermail/scintilla-interest/2004-April/004272.html
            // and (2) the calltip display position might not be the trigger point
            // if the call region is multi-line.
            this._lastTriggerPos = null;
            this._defns = [];
    
            ko.prefs.prefObserverService.addObserver(this,
                "codeintel_completion_auto_fillups_enabled", 0);
        } catch(ex) {
            log.exception(ex);
        }
    }
    this.CompletionUIHandler.prototype.constructor = this.CompletionUIHandler;
    
    
    this.CompletionUIHandler.prototype.QueryInterface = function(iid) {
        if (iid.equals(Components.interfaces.koICodeIntelCompletionUIHandler) ||
            iid.equals(Components.interfaces.nsIObserver) ||
            iid.equals(Components.interfaces.nsISupports)) {
            return this;
        }
        throw Components.results.NS_ERROR_NO_INTERFACE;
    }
    
    
    this.CompletionUIHandler.prototype.finalize = function() {
        log.debug("CompletionUIHandler.finalize()");
        this.scimoz = null;
        try {
            ko.prefs.prefObserverService.removeObserver(this,
                "codeintel_completion_auto_fillups_enabled");
        } catch(ex) {
            log.exception(ex);
        }    
    }
    
    
    this.CompletionUIHandler.prototype.observe = function(prefSet, prefName, prefSetID)
    {
        //log.debug("observe pref '"+prefName+"' change on '"+
        //                      this.path+"'s completion UI handler");
        try {
            switch (prefName) {
            case "codeintel_completion_auto_fillups_enabled":
                if (ko.prefs.getBooleanPref("codeintel_completion_auto_fillups_enabled")) {
                    this.scimoz.autoCSetFillUps(this.completionFillups);
                } else {
                    this.scimoz.autoCSetFillUps("");
                }
                break;
            default:
                log.error("unexpected pref name is "+
                                      "CompletionUIHandler: '"+
                                      prefName+"'\n");
            }
        } catch(ex) {
            log.exception(ex);
        }
    };
    
    
    // Helpers to determine the start pos for "triggerPrecedingCompletion".
    //
    // The Problem: For repeated triggerPrecedingCompletion() calls we want to
    // backtrack until the language service says "that's all". However, if
    // completion at one of these triggers fails we don't have an
    // autocomplete/calltip UI point and which to start the next look back.
    //
    // Solution: A time-based heuristic. If we've *recently* done a
    // triggerPrecedingCompletion() and found a trigger, then start from one
    // before that position. This is independent of the trigger evaluation
    // succeeding so should be more robust.
    this.CompletionUIHandler.prototype._setLastRecentPrecedingCompletionAttemptPos = function(pos)
    {
        this._lastRecentPrecedingCompletionAttemptPos = pos;
        this._lastRecentPrecedingCompletionAttemptTime = this._timeSvc.time();
        this._timeSvc = Components.classes["@activestate.com/koTime;1"].
                            getService(Components.interfaces.koITime);
    }
    this.CompletionUIHandler.prototype._getLastRecentPrecedingCompletionAttemptPos = function(pos)
    {
        if (this._lastRecentPrecedingCompletionAttemptPos == null)
            return null;
    
        var now = this._timeSvc.time();
        if (now - this._lastRecentPrecedingCompletionAttemptTime
            > this._lastRecentPrecedingCompletionAttemptTimeout) {
            this._lastRecentPrecedingCompletionAttemptPos = null;
            return null;
        } else {
            return this._lastRecentPrecedingCompletionAttemptPos;
        }
    }
    
    this.CompletionUIHandler.prototype.triggerPrecedingCompletion = function()
    {
        log.debug("CompletionUIHandler."+
                              "triggerPrecedingCompletion()");
        try {
            // Determine start position.
            var startPos = null;
            if (this.scimoz.callTipActive() || this.scimoz.autoCActive()) {
                startPos = this._lastTriggerPos - 1;
            } else {
                var lastRecentAttemptPos = this._getLastRecentPrecedingCompletionAttemptPos();
                if (lastRecentAttemptPos != null) {
                    startPos = lastRecentAttemptPos - 1;
                } else {
                    startPos = this.scimoz.currentPos;
                }
            }
    
            ko.codeintel.linkCurrentProjectWithBuffer(this.buf);
            // Hand off to language service to find and display.
            var trg = this.buf.preceding_trg_from_pos(startPos,
                                                      this.scimoz.currentPos);
            if (trg) {
                this._setLastRecentPrecedingCompletionAttemptPos(trg.pos);
                var ctlr = 
                    Components.classes["@activestate.com/koCodeIntelEvalController;1"].
                    createInstance(Components.interfaces.koICodeIntelEvalController);
                ctlr.set_ui_handler(this);
                this.buf.async_eval_at_trg(trg, ctlr);
            } else if (typeof(ko.statusBar.AddMessage) != "undefined") {
                this._setLastRecentPrecedingCompletionAttemptPos(null);
                ko.statusBar.AddMessage("No preceding trigger point within range of current position.",
                                     "codeintel", 3000, false);
            }
        } catch(ex) {
            log.exception(ex);
        }
    
    }
    
    this.CompletionUIHandler.prototype._setAutoCompleteInfo = function(
        completions, triggerPos)
    {
        log.debug("CompletionUIHandler.setAutoCompleteInfo("+
                              "completions, triggerPos)");
        try {
            // If the trigger is no longer relevant, then drop the completions.
            // - if the current position is before the trigger pos
            var curPos = this.scimoz.currentPos;
            if (curPos < triggerPos) {
                log.info("aborting autocomplete at "+triggerPos+
                                     ": cursor is before trigger position");
                return;
            }
            // - if the line changed
            var curLine = this.scimoz.lineFromPosition(curPos);
            var triggerLine = this.scimoz.lineFromPosition(triggerPos);
            if (curLine != triggerLine) {
                log.debug("aborting autocomplete at "+triggerPos+
                                      ": current line number changed");
                return;
            }
            //XXX Should also abort if the trigger character was changed, e.g.
            //       foo.<BS>bar
            //    Could do this by passing in the Trigger object (and storing
            //    what the trigger char is on it).
    
            // abort if any of the "fillups" have been typed since
            var numTypedAlready = curPos - triggerPos;
            var ch;
            for (var i = triggerPos; i < curPos; i++) {
                ch = this.scimoz.getWCharAt(i);
                if (this.completionFillups.indexOf(ch) != -1) {
                    log.debug("aborting autocomplete at "+triggerPos+
                                          ": fillup character typed: '"+ch+"'");
                    return;
                }
            }
    
            // Show the completions UI.
            this._lastTriggerPos = triggerPos;
            if (numTypedAlready) {
                // Cancel when moving before the pos when the completion list is
                // shown - bug 88292.
                this.scimoz.autoCCancelAtStart = true;
            } else {
                this.scimoz.autoCCancelAtStart = false;
            }
            this.scimoz.autoCShow(numTypedAlready, completions);
            if (numTypedAlready > 0) {
                var typedAlready = this.scimoz.getTextRange(triggerPos, curPos);
                this.scimoz.autoCSelect(typedAlready);
            }
        } catch(ex) {
            log.exception(ex);
        }
    }
    
    this.CompletionUIHandler.prototype._setCallTipInfo = function(
        calltip, triggerPos, explicit)
    {
        log.debug("CompletionUIHandler.setCallTipInfo"+
                              "(calltip, triggerPos="+triggerPos+
                              ", explicit="+explicit+")");
        try {
            var curPos = this.scimoz.currentPos;
            if (!explicit) {
                // If the trigger is no longer relevant, then drop the calltip.
                // - if the current position is before the trigger pos
                if (curPos < triggerPos) {
                    log.info("aborting calltip at "+triggerPos+
                                         ": cursor is before trigger position");
                    return;
                }
                // - if the current position is outside the call region
                //   c.f. http://kd.nas/kd-0100.html#autocomplete-and-calltips
                var hltStartObj = new Object();
                var hltEndObj = new Object();
                this.buf.curr_calltip_arg_range(
                    triggerPos, calltip, curPos, hltStartObj, hltEndObj);
                var hltStart = hltStartObj.value;
                var hltEnd = hltEndObj.value;
                if (hltStart == -1) {
                    log.info("aborting calltip at "+triggerPos+
                                         ": cursor is outside call region");
                    return;
                }
            }
    
            // Show the callip.
            if (this.scimoz.callTipActive()) {
                this.scimoz.callTipCancel();
            }
            this._lastTriggerPos = triggerPos;
    
            // Ensure the calltip line width and number of calltip lines shown
            // is not more than the user wants to see.
            var max_line_width = ko.prefs.getLongPref("codeintel_calltip_max_line_width");
            var max_lines = ko.prefs.getLongPref("codeintel_calltip_max_lines");
            var textUtils = Components.classes["@activestate.com/koTextUtils;1"]
                                .getService(Components.interfaces.koITextUtils);
            calltip = textUtils.break_up_lines(calltip, max_line_width);
            var calltip_lines = calltip.split(/\r\n|\n|\r/g);
            if (calltip_lines.length > max_lines) {
                calltip_lines = calltip_lines.slice(0, max_lines);
            }
            calltip = calltip_lines.join("\n");
    
            // Ensure the calltip is displayed relative to the current
            // cursor position - bug 87587.
            var curLine = this.scimoz.lineFromPosition(curPos);
            var callTipLine = this.scimoz.lineFromPosition(triggerPos);
            if (callTipLine != curLine) {
                var triggerColumn = this.scimoz.getColumn(triggerPos);
                triggerPos = this.scimoz.positionAtColumn(curLine, triggerColumn);
            }
    
            this.scimoz.callTipShow(triggerPos, calltip);
            this.scimoz.callTipSetHlt(hltStart, hltEnd);
            var callTipItem = {"triggerPos": triggerPos, "calltip": calltip};
            this.callTipStack.push(callTipItem);
        } catch(ex) {
            log.exception(ex);
        }
    }
    
    this.CompletionUIHandler.prototype.updateCallTip = function() {
        log.debug("CompletionUIHandler.updateCallTip()");
        try {
            if (! this.scimoz.callTipActive()) {
                // The calltip may get cancelled in various other places so
                // we have to make sure that the callTipStack here doesn't
                // grow unboundedly.
                this.callTipStack = [];
                return;
            }
    
            var curPos = this.scimoz.currentPos;
            var curLine = this.scimoz.lineFromPosition(curPos);
            var callTipItem = this.callTipStack[this.callTipStack.length-1];
            var triggerPos = callTipItem["triggerPos"];
            var calltip = callTipItem["calltip"];
            var callTipPos, triggerColumn;
    
            // Determine if we should cancel the calltip.
            var cancel = curPos < triggerPos; // cancel if cursor before trigger
            var region, hltStart, hltEnd;
            if (!cancel) {
                var hltStartObj = new Object();
                var hltEndObj = new Object();
                this.buf.curr_calltip_arg_range(
                    triggerPos, calltip, curPos, hltStartObj, hltEndObj);
                hltStart = hltStartObj.value;
                hltEnd = hltEndObj.value;
                cancel = hltStart == -1;  // cancel if cursor out of call region
            }
    
            // Cancel if required and fallback to previous calltip, if any.
            if (cancel) {
                // Cancel the current call tip.
                this.scimoz.callTipCancel();
                this.callTipStack.pop();
    
                // Start the calltip one up in the stack, if there is one.
                if (this.callTipStack.length) {
                    callTipItem = this.callTipStack[this.callTipStack.length-1];
                    triggerPos = callTipItem["triggerPos"];
                    calltip = callTipItem["calltip"];
                    if (curPos >= triggerPos) {
                        triggerColumn = this.scimoz.getColumn(triggerPos);
                        callTipPos = this.scimoz.positionAtColumn(
                                curLine, triggerColumn);
                        this._lastTriggerPos = triggerPos;
                        this.scimoz.callTipShow(callTipPos, calltip);
                        this.updateCallTip();
                    }
                }
                return;
            }
    
            // If the cursor is on a different line from the current display
            // point then we need to move the calltip up or down.
            callTipPos = this.scimoz.callTipPosStart();
            var callTipLine = this.scimoz.lineFromPosition(callTipPos);
            if (callTipLine != curLine) {
                this.scimoz.callTipCancel();
                triggerColumn = this.scimoz.getColumn(triggerPos);
                var newCallTipPos = this.scimoz.positionAtColumn(curLine, triggerColumn);
                this._lastTriggerPos = triggerPos;
                this.scimoz.callTipShow(newCallTipPos, calltip);
                //dump("XXX moved the calltip to "+newCallTipPos+
                //     ", now it is at "+this.scimoz.callTipPosStart()+"\n");
            }
    
            // Update the highlighting.
            this.scimoz.callTipSetHlt(hltStart, hltEnd);
        } catch(ex) {
            log.exception(ex);
        }
    }
    
    this.CompletionUIHandler.prototype._setDefinitionsInfo = function(
          defns, triggerPos)
    {
        log.debug("CompletionUIHandler.setDefinitionsInfo"+
                              "(triggerPos="+triggerPos+
                              ", num defns="+defns.length+")");
        try {
            if (defns && defns.length > 0) {
                /** @type {Components.interfaces.koICodeIntelDefinition} */
                var defn = defns[0];
                if (defns.length > 1) {
                    // Show choice of definitions, user can choose one
                    var args = new Object();
                    args.defns = defns;
                    window.openDialog("chrome://komodo/content/codeintel/ciDefinitionChoice.xul",
                                      "Komodo:ciDefinitionChoice",
                                      "chrome,resizable=yes,dialog=yes,close=yes,dependent=yes,modal=yes",
                                      args);
                    if (args.retval != "OK") {
                        return;
                    }
                    defn = args.selectedDefn;
                }
    
                // defn is a koICodeIntelDefinition XPCOM object
                // If it's got a path and line, open it up
                if (defn.path && defn.line) {
                    log.info("goto definition at "+triggerPos+
                                         ": found defn path '"+defn.path+
                                         "', line "+defn.line+".");
                    ko.history.note_curr_loc();
                    ko.views.manager.doFileOpenAtLineAsync(ko.uriparse.pathToURI(defn.path), defn.line);
                } else {
                    // No file, prompt to see if the user wants to view the online
                    // language help for this symbol - bug 65296.
                    var prompt = "Cannot show definition: symbol is defined " +
                                 "in the stdlib or in an API catalog. Would " +
                                 "you like to open the online language " +
                                 "help for this symbol?";
                    if (ko.dialogs.yesNo(prompt, "Yes", null, "Online Definition", "gotoDefinitionOnline") == 'Yes') {
                        ko.help.language(defn.name);
                    };
                    // No file information for ...
                    log.info("goto definition at "+triggerPos+
                                         ": no path information, as symbol is defined in a CIX.");
                    ko.statusBar.AddMessage("Cannot show definition: symbol is defined in the stdlib or in an API catalog.",
                                         "codeintel", 5000, true);
                }
            } else {
                log.info("goto definition at "+triggerPos+
                                     ": no results found.");
                ko.statusBar.AddMessage("No definition was found.'",
                                     "codeintel", 3000, true);
            }
        } catch(ex) {
            log.exception(ex);
        }
    }
    
    
    // XXX WARNING these setXXX functions are called via sync proxy from a python
    // thread in koCodeIntel.py.  To prevent blocking on the ui thread, do
    // AS LITTLE AS POSSIBLE here, potentially defering to a window.timeout
    // call.
    // Bug: http://bugs.activestate.com/show_bug.cgi?id=65188
    
    this.CompletionUIHandler.prototype.setStatusMessage = function(
        msg, highlight)
    {
        window.setTimeout(ko.statusBar.AddMessage, 1, msg, "codeintel", 4000,
                          highlight);
    }
    
    this.CompletionUIHandler.prototype.setAutoCompleteInfo = function(
        completions, triggerPos)
    {
        window.setTimeout(function (me, completions, triggerPos) {me._setAutoCompleteInfo(completions, triggerPos);},
                          1, this, completions, triggerPos);
    }
    
    this.CompletionUIHandler.prototype.setCallTipInfo = function(
        calltip, triggerPos, explicit)
    {
        window.setTimeout(function (me, calltip, triggerPos, explicit) {me._setCallTipInfo(calltip, triggerPos, explicit);},
                          1, this, calltip, triggerPos, explicit);
    }
    
    this.CompletionUIHandler.prototype.setDefinitionsInfo = function(
        count, defns, triggerPos)
    {
        window.setTimeout(function (me, defns, triggerPos) {me._setDefinitionsInfo(defns, triggerPos);},
                          1, this, defns, triggerPos);
    }
    
}).apply(ko.codeintel);

window.addEventListener("load", ko.codeintel.initialize, false);

/**
 * @deprecated since 7.0
 */
ko.logging.globalDeprecatedByAlternative('gCodeIntelSvc', 'Components.classes["@activestate.com/koCodeIntelService;1"].getService(Components.interfaces.koICodeIntelService)');
ko.logging.globalDeprecatedByAlternative("gCodeIntelActive", "ko.codeintel.isActive");
ko.logging.globalDeprecatedByAlternative("CodeIntel_InitializeWindow", "ko.codeintel.initialize");
ko.logging.globalDeprecatedByAlternative("CodeIntel_FinalizeWindow", "ko.codeintel.finalize");
ko.logging.globalDeprecatedByAlternative("CodeIntelCompletionUIHandler", "ko.codeintel.CompletionUIHandler");
