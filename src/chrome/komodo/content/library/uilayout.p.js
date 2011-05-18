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

/* ---- UI Helpers for showing/hiding, expanding collapsing, various UI features ---- */
if (typeof(ko)=='undefined') {
    var ko = {};
}
ko.uilayout = {};

(function() {
var _gPrefs = Components.classes["@activestate.com/koPrefService;1"].
                getService(Components.interfaces.koIPrefService).prefs;
var _bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                .getService(Components.interfaces.nsIStringBundleService)
                .createBundle("chrome://komodo/locale/library.properties");
var XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

var _log = ko.logging.getLogger('uilayout');

// Toggle the visibility of the specified toolbar,
// along with the corresponding broadcaster if it exists.
this.toggleToolbarVisibility = function uilayout_toggleToolbarVisibility(toolbarId)
{
    /**
     * @type {Node}
     */
    var toolbaritem = document.getElementById(toolbarId);
    if (!toolbaritem) {
        _log.error("Couldn't find toolbaritem: " + toolbarId);
        return;
    }
    var broadcasterId = toolbaritem.getAttribute('broadcaster');
    if (!broadcasterId) {
        _log.info("No broadcaster associated with toolbaritem: " + toolbarId);
        return;
    }
    var broadcaster = document.getElementById(broadcasterId);
    if (!broadcaster) {
        _log.error("Couldn't find broadcaster: " + broadcasterId);
        return;
    }
    if (toolbaritem.hidden) {
        toolbaritem.setAttribute("hidden", "false");
        broadcaster.setAttribute("checked", "true");
    } else {
        toolbaritem.setAttribute("hidden", "true");
        broadcaster.setAttribute("checked", "false");
    }

    // Check whether to hide the toolbox row.
    if (toolbaritem.nodeName == "toolbar") {
        // If this is an actual toolbar, such as the open/find toolbar then
        // we don't need to check the child contents.
        return;
    }
    /**
     * @type {Node}
     */
    var toolbar = toolbaritem.parentNode;
    while (toolbar && toolbar.nodeName != "toolbar") {
        dump('toolbar.nodeName: ' + toolbar.nodeName + '\n');
        toolbar = toolbaritem.parent;
    }
    if (!toolbar) {
        _log.warn("Could not find the parent toolbar for: " + toolbarId);
        return;
    }
    var child;
    var all_hidden = true;
    for (var i=0; i < toolbar.childNodes.length; i++) {
        child = toolbar.childNodes.item(i);
        if (!child.hasAttribute("hidden") ||
            child.getAttribute("hidden") == "false") {
            all_hidden = false;
            break;
        }
    }
    if (all_hidden) {
        toolbar.setAttribute("hidden", "true");
    } else {
        toolbar.removeAttribute("hidden");
    }
}

// XRE toolbar does not have toolbar.update.  this is duplicated
// from the xpfe toolbar widget, and will make our stuff work
// with either XRE or XPFE
function _updateToolbarButtonText(tbElt,tag,style) {
    var elements = tbElt.getElementsByTagName(tag);
    for (var i = 0; i < elements.length; i++) {
        elements[i].setAttribute("buttonstyle", style);
    }
}

// 'toolbarId' is the id of the toolbar that should be affected
// 'show' is a boolean -- true means show the text.
function _setToolbarButtonText(toolbarId, buttonTextShowing)
{
    var toolbar = document.getElementById(toolbarId);
    if (!toolbar) {
        _log.error("Could not find toolbar with id: " + toolbarId);
    }
    try {
        if (buttonTextShowing) {
            toolbar.removeAttribute('buttonstyle');
            toolbar.setAttribute('mode','full');
            _updateToolbarButtonText(toolbar, 'toolbarbutton', null);
        } else {
            toolbar.setAttribute('buttonstyle','pictures');
            toolbar.setAttribute('mode','icons');
            _updateToolbarButtonText(toolbar, 'toolbarbutton', 'pictures');
        }
    } catch(e) {
        _log.error(e);
    }
}

var _buttonTextShowing = false;
this.isButtonTextShowing = function() {
    return _buttonTextShowing;
}
// Toggle whether text is shown on toolbar buttons
this.toggleButtons = function uilayout_toggleButtons()
{
    var buttonTextShowing;
    var broadcaster = document.getElementById('cmd_toggleButtonText');
    if (broadcaster.hasAttribute('checked') && broadcaster.getAttribute('checked') == 'true') {
        broadcaster.setAttribute("checked", "false");
        buttonTextShowing = false;
    } else {
        broadcaster.setAttribute("checked", "true");
        buttonTextShowing = true;
    }
    _buttonTextShowing = buttonTextShowing;
    _setToolbarButtonText('toolbox_main', buttonTextShowing);
    _setToolbarButtonText('standardToolbar', buttonTextShowing);
    _setToolbarButtonText('debuggerToolbar', buttonTextShowing);
    _setToolbarButtonText('workspaceToolbar', buttonTextShowing);
    ko.uilayout.updateToolbarArrangement(buttonTextShowing);
    document.persist('cmd_toggleButtonText', 'checked');
}

this.updateToolbarArrangement = function uilayout_updateToolbarArrangement(buttonTextShowing /* default: look it up */)
{
    var menuItem = document.getElementById('menu_toggleButtonText');
    var fromloading = false;
    var contextMenuItem = document.getElementById('menu_toggleButtonText');
    if (typeof(buttonTextShowing) == 'undefined') {
        var broadcaster = document.getElementById('cmd_toggleButtonText');
        buttonTextShowing = broadcaster.hasAttribute('checked') &&
                            broadcaster.getAttribute('checked') == 'true';
        fromloading = true;
    }
    _buttonTextShowing = buttonTextShowing;
    var toolbars = document.getElementsByTagName('toolbar');
    var i;
    for (i = 0; i < toolbars.length; i++ ) {
        // Note: this can include custom toolbars
        _setToolbarButtonText(toolbars[i].id, buttonTextShowing);
    }
}


this.populatePreviewToolbarButton = function uilayout_populatePreviewToolbarButton(popup)
{
    // Only do this once.
    // XXX We'll need to remove it's children when prefs are changed.
    if (popup.childNodes.length > 0)
        return;

    var koWebbrowser = Components.classes["@activestate.com/koWebbrowser;1"].
                       getService(Components.interfaces.koIWebbrowser);
    var browsersObj = {};
    var browserTypesObj = {};
    koWebbrowser.get_possible_browsers_and_types(
            {} /* count */, browsersObj, browserTypesObj);
    var browsers = browsersObj.value;
    var browserTypes = browserTypesObj.value;
    var mi;

// #if PLATFORM == "win"
    mi = document.createElementNS(XUL_NS, "menuitem");
    mi.setAttribute("label", _bundle.GetStringFromName("configuredBrowser"));
    mi.setAttribute("tooltiptext", _bundle.GetStringFromName("seePreferencesWebBrowser"));
    mi.setAttribute("oncommand",
                    "ko.views.manager.currentView.viewPreview(); event.stopPropagation();");
    popup.appendChild(mi);
// #endif

    mi = document.createElementNS(XUL_NS, "menuitem");
    mi.setAttribute("label", _bundle.GetStringFromName("internalBrowser.menu.label"));
    mi.setAttribute("tooltiptext", _bundle.GetStringFromName("internalBrowser.menu.tooltiptext"));
    mi.setAttribute("oncommand",
                    "ko.commands.doCommand('cmd_browserPreviewInternal'); event.stopPropagation();");
    mi.setAttribute("class", "menuitem-iconic komodo-16x16");
    popup.appendChild(mi);

    var browserURI;
    for (var i = 0; i < browsers.length; i++) {
        mi = document.createElementNS(XUL_NS, "menuitem");
        mi.setAttribute("label", browsers[i]);
        mi.setAttribute("crop", "center");
        mi.setAttribute("tooltiptext", ko.uriparse.baseName(browsers[i]));
        if (browserTypes[i]) {
            mi.setAttribute("class", "menuitem-iconic browser-"+browserTypes[i]+"-icon");
        }
        browserURI = ko.uriparse.localPathToURI(browsers[i]);
        mi.setAttribute("oncommand",
                        "ko.views.manager.currentView.viewPreview('"+browserURI+"'); event.stopPropagation();");
        popup.appendChild(mi);
    }
}

this.focusPane = function uilayout_focusPane(tabsId)
{
    var tabs = document.getElementById(tabsId);
    var tabId = tabs.selectedItem.getAttribute('id');
    ko.uilayout.toggleTab(tabId, false);
}

this.toggleTab = function uilayout_toggleTab(tabId, collapseIfFocused /* =true */,
                                             collapseIfAlreadySelected /* false */)
{
    try {
        // if called with collapseIfFocused=false, we will only ensure that
        // the specified tab is focused and will not collapse any panels
        if (typeof(collapseIfFocused) == 'undefined')
            collapseIfFocused = true;
        var tab = document.getElementById(tabId);
        var tabs = tab.parentNode;
        var splitterId = tabs.getAttribute('splitterId');
        var splitterWidget = document.getElementById(splitterId);
        // If the pane in question is not shown and focused, then show it and
        // focus the relevant widget. The "focusHandlingWidget" must maintain
        // a .focused attribute.
        var focusHandlingWidget = null;
        switch (tabId) {
            case 'toolbox2_tab':
                focusHandlingWidget = document.getElementById('toolbox2viewbox').tree;
                break;
            case 'codebrowser_tab':
                focusHandlingWidget = document.getElementById('codebrowser-tree');
                break;
        }
        var cmdId = splitterWidget.getAttribute('splitterCmdId');
        if (splitterWidget.hasAttribute('collapsed') &&
            splitterWidget.getAttribute('collapsed') == 'true') {
            ko.uilayout.toggleSplitter(cmdId);
            // Default: select and focus tab
        } else if ((!splitterWidget.hasAttribute('collapsed')
                    || splitterWidget.getAttribute('collapsed') == 'false')
                   && tab !== tabs.selectedItem) {
            // Default: select and focus new tab
        } else {
            if (collapseIfAlreadySelected && 
                (tabs.parentNode.selectedTab == tab)) {
                ko.uilayout.toggleSplitter(cmdId);
                return;
            }
            if (collapseIfFocused) {
                // Before we collapse it, figure out whether the focus is in this
                // panel.  If so, then move it back to the editor
                if (xtk.domutils.elementInFocus(tabs.parentNode)) {
                    if (ko.views.manager.currentView) {
                        ko.views.manager.currentView.setFocus();
                    }
                }
                ko.uilayout.toggleSplitter(cmdId);
                return;
            }
        }
        tabs.parentNode.selectedTab = tab;
        if (focusHandlingWidget) {
            focusHandlingWidget.focus();
        } else {
            tabs.parentNode.selectedTab.focus();
        }
    } catch (e) {
        _log.exception(e);
    }
}


/*
 ** 
 * updateTabpickerMenu
 * @param {XUL menupopup} menupopup
 *
 * This menu-builder takes a list of menu items that control which tab
 * to show in a given pane.  Each menuitem is expected to have an observes
 * attribute with a value of "show_" followed by the ID of the tab the
 * menuitem controls.
 */
this.updateTabpickerMenu = function uilayout_updateTabpickerMenu(menupopup)
{
    try {
        /* first, update the menu items in the menubar (the canonical one) */
        var canonicalPopup = document.getElementById("menu_view_tabs_popup");
        var menuitems = canonicalPopup.getElementsByTagName("menuitem");
        for (var i = 0; i < menuitems.length; i++) {
            var menuitem = menuitems[i];
            var paneid = menuitem.getAttribute("pane");
            var pane = paneid ? document.getElementById(paneid) : null;
            if (!pane || pane.collapsed) {
                // the pane should not be visible (nor selectabale)
                menuitem.setAttribute("collapsed", true);
                menuitem.setAttribute("hidden", true);
                continue;
            }
            menuitem.removeAttribute('collapsed');
            menuitem.removeAttribute('hidden');
            var selected = !pane.tabbox.collapsed &&
                           pane.tabbox.selectedTab == pane.tab;
            if (selected) {
                menuitem.setAttribute('checked', 'true');
                menuitem.disabled = true;
            } else {
                menuitem.removeAttribute('checked');
                menuitem.disabled = false;
            }
        }

        /* next, copy the menu over if required */
        if (canonicalPopup == menupopup) return;
        while (menupopup.firstChild) {
            menupopup.removeChild(menupopup.firstChild);
        }
        Array.slice(canonicalPopup.childNodes).forEach(function(item) {
            var newitem = item.cloneNode(true);
            menupopup.appendChild(newitem);
            if (newitem.localName == "menuitem") {
                // this is a menu item; add an event listener that makes a new
                // event that looks close enough and dispatches it to the
                // canonical item
                newitem.addEventListener("command", function(event){
                    var newevent = document.createEvent("XULCommandEvent");
                    newevent.initCommandEvent(event.type,       // type
                                              true,             // can bubble
                                              false,            // can cancel
                                              event.view,       // view
                                              event.detail,     // detail
                                              event.ctrlKey,    // ctrl
                                              event.altKey,     // alt
                                              event.shiftKey,   // shift
                                              event.metaKey,    // meta
                                              event);           // source
                    item.dispatchEvent(newevent);
                }, false);
            }
        });
    } catch (e) {
        _log.exception(e);
    }
}

this.togglePane = function uilayout_togglePane(paneId, force)
{
    // If force is true, then the toggle happens regardless.
    // If force is false, then the toggle happens only if the
    // current tab is not collapsed and focused.
    try {
        if (typeof(force) == 'undefined') {
            force = false;
        }
        // If the project/toolbox pane is not shown, then show it
        // and focus on the relevant part manager
        var pane = document.getElementById(paneId);
        if (!force && pane.collapsed) {
            var scimoz = null;
            // Following code fixes bug 83545:
            // After we've opened a tab, if the caret was visible before
            // we opened it, get Scintilla to make sure it's visible after.
            // Only do this if the cursor was visible before opening a pane.
            //
            // Scintilla doesn't expose the width of the screen in characters
            // (and this is hard to do in proportional fonts), so if the cursor
            // is scrolled to the left or right of the viewport, we'll bring it into
            // view anyway.
            if (ko.views.manager.currentView
                && !!(scimoz = ko.views.manager.currentView.scimoz)) {
                var firstVisibleLine = scimoz.firstVisibleLine;
                var firstActualLine = scimoz.docLineFromVisible(firstVisibleLine);
                var lastActualLine = scimoz.docLineFromVisible(firstVisibleLine + scimoz.linesOnScreen);
                var currLine = scimoz.lineFromPosition(scimoz.currentPos);
                if (currLine < firstVisibleLine || currLine > lastActualLine) {
                    scimoz = null;
                }
            }
            pane.collapsed = false;
            if (scimoz) {
                // This has to be done in a setTimeout on Windows and OS X.
                // If we try it now, Scintilla thinks the caret is still in
                // view, and doesn't adjust the document's scroll.
                setTimeout(function(selectedTabItem) {
                    scimoz.scrollCaret();
                    if (selectedTabItem) {
                        selectedTabItem.focus();
                    }
                }, 100, pane.selectedTab);
            }
        } else {
            // Before we collapse it, figure out whether the focus is in this
            // panel.  If so, then move it back to the editor
            if (xtk.domutils.elementInFocus(pane)) {
                if (ko.views.manager.currentView) {
                    ko.views.manager.currentView.setFocus();
                } else {
                    // probably no file open to focus on, need to focus someplace else
                    window.focus();
                }
            }
            pane.collapsed = !pane.collapsed;
        }
    } catch (e) {
        _log.exception(e);
    }
}

this.toggleSplitter = function uilayout_toggleSplitter(aCommandID) {
    var elt = document.getElementById(aCommandID);
    if (!elt) {
        _log.error("uilayout_toggleSplitter: couldn't find '" + aCommandID + "'");
        return;
    }
    var boxId = elt.getAttribute('box');
    var box = document.getElementById(boxId)
    if (!box) {
        _log.error("couldn't find " + boxId);
        return;
    }
    var splitterId = elt.getAttribute('splitter')
    var splitter = document.getElementById(splitterId)
    if (!splitter) {
        _log.error("couldn't find " + splitterId);
        return;
    }

    if (! box.hasAttribute('collapsed') || box.getAttribute("collapsed") == "false") {
        box.setAttribute('collapsed','true');
        splitter.setAttribute('collapsed','true');
        elt.removeAttribute('checked');
    } else {
        box.setAttribute('collapsed','false');
        splitter.setAttribute('collapsed','false');
        elt.setAttribute('checked', 'true');
    }
}

this.updateSplitterBroadcasterState = function uilayout_updateSplitterBroadcasterState(aCommandID) {
    var elt = document.getElementById(aCommandID);
    if (!elt) {
        _log.error("ko.uilayout.toggleSplitter: couldn't find '" + aCommandID + "'");
        return;
    }
    var boxId = elt.getAttribute('box');
    var box = document.getElementById(boxId)
    if (!box) {
        _log.error("couldn't find " + boxId);
        return;
    }
    var splitterId = elt.getAttribute('splitter')
    var splitter = document.getElementById(splitterId)
    if (!splitter) {
        _log.error("couldn't find " + splitterId);
        return;
    }

    if (! box.hasAttribute('collapsed') ||
        box.getAttribute("collapsed") == "false") {
        elt.setAttribute('checked', 'true');
    } else {
        elt.removeAttribute('checked');
    }
}

this.updateFullScreen = function uilayout_updateFullScreen() {
    // Update whether the checkbox for full screen is checked or not.
    var menuitem = document.getElementById('menuitem_fullScreen');
    if (window.fullScreen) {
        menuitem.setAttribute('checked', 'true');
    } else {
        menuitem.removeAttribute('checked');
    }
}

this.fullScreen = function uilayout_FullScreen()
{
    window.fullScreen = !window.fullScreen;
    var windowControls = document.getElementById('window-controls');
    if (window.fullScreen) {
        window.maximize();
        windowControls.removeAttribute('hidden');
    } else {
        document.getElementById("toolbox_main").restoreFromFullScreen = true;
        window.restore();
        windowControls.setAttribute('hidden', 'true');
    }
}

this.onFullScreen = function uilayout_onFullScreen()
{
  FullScreen.toggle();
}

// for whatever reason, toolkit/content/fullScreen.js is not included
// in the base mozilla builds.  this is take from there (firefox browser
// also copies this into its own sources).
var FullScreen = 
{
  toggle: function()
  {
    // show/hide all menubars, toolbars, and statusbars (except the full screen toolbar)
    this.showXULChrome("menubar", window.fullScreen);
    this.showXULChrome("toolbar", window.fullScreen);
    this.showXULChrome("statusbar", window.fullScreen);
  },
  
  showXULChrome: function(aTag, aShow)
  {
    var XULNS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
    var els = document.getElementsByTagNameNS(XULNS, aTag);
    
    var i;
    for (i = 0; i < els.length; ++i) {
      // XXX don't interfere with previously collapsed toolbars
      if (els[i].getAttribute("fullscreentoolbar") == "true") {
        this.setToolbarButtonMode(els[i], aShow ? "" : "small");
      } else {
        // use moz-collapsed so it doesn't persist hidden/collapsed,
        // so that new windows don't have missing toolbars
        if (aShow)
          els[i].removeAttribute("moz-collapsed");
        else
          els[i].setAttribute("moz-collapsed", "true");
      }
    }

    var controls = document.getElementsByAttribute("fullscreencontrol", "true");
    for (i = 0; i < controls.length; ++i)
      controls[i].hidden = aShow;
  },
  
  setToolbarButtonMode: function(aToolbar, aMode)
  {
    aToolbar.setAttribute("toolbarmode", aMode);
    this.setToolbarButtonModeFor(aToolbar, "toolbarbutton", aMode);
    this.setToolbarButtonModeFor(aToolbar, "button", aMode);
    this.setToolbarButtonModeFor(aToolbar, "textbox", aMode);
  },
  
  setToolbarButtonModeFor: function(aToolbar, aTag, aMode)
  {
    var XULNS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
    var els = aToolbar.getElementsByTagNameNS(XULNS, aTag);

    for (var i = 0; i < els.length; ++i) {
      els[i].setAttribute("toolbarmode", aMode);
    }
  }
  
};

function _addManageMRUMenuItem(prefName, parentNode, MRUName) {
    var menuitem = document.createElementNS(XUL_NS, 'menuseparator');
    parentNode.appendChild(menuitem);
    menuitem = document.createElementNS(XUL_NS, "menuitem");
    var MRUString = _bundle.GetStringFromName(MRUName);
    var manageLabel = _bundle.formatStringFromName("Manage the X List",
                                                   [MRUString], 1);
    menuitem.setAttribute("label", manageLabel);
    menuitem.setAttribute("accesskey", _bundle.GetStringFromName("mruManageAccessKey"));
    menuitem.setAttribute("oncommand", "ko.mru.manageMRUList('" + prefName + "');");
    parentNode.appendChild(menuitem);
}

function _updateMRUMenu(prefName, limit, addManageItem, MRUName)
{
    // Update a MRU menu popup under the file menu.
    //    "prefName" indicate which MRU menu to update.
    //
    // XXX This code was significantly complitcated just for the special
    //     template MRU menu under File->New. Perhaps that should be
    //     factored out.
    if (typeof(addManageItem) == "undefined") addManageItem = false;
    var popupId, separatorId, prettyName;
    if (prefName == "mruProjectList") {
        popupId = "recentProjects_menupopup";
        prettyName = _bundle.GetStringFromName("Projects");
    } else if (prefName == "mruFileList") {
        popupId = "popup_mruFiles"; // MRU list is the whole popup.
        separatorId = null;
        prettyName = _bundle.GetStringFromName("Files");
    } else if (prefName == "mruTemplateList") {
        popupId = null;
        separatorId = "separator_mruTemplates"; // MRU list is everything after the separator.
        prettyName = _bundle.GetStringFromName("Templates");
    } else {
        throw new Error("Unexpected MRU menu to update: prefName='"+prefName+"'");
    }

    var menupopup = popupId ? document.getElementById(popupId) : null;
    var separator = separatorId ? document.getElementById(separatorId) : null;
    var mruList = null;
    var menuitem;
    if (_gPrefs.hasPref(prefName)) {
        mruList = _gPrefs.getPref(prefName);
    }

    // Wipe out existing menuitems.
    if (separator) {
        menupopup = separator.parentNode;
        while (separator.nextSibling) {
            menupopup.removeChild(separator.nextSibling);
        }
    } else  {
        while (menupopup.firstChild) {
            menupopup.removeChild(menupopup.firstChild);
        }
    }

    if (mruList && mruList.length) {
        // Add a menuitem like the following for each entry in the MRU:
        //    <menuitem class="menuitem_mru"
        //              oncommand="ko.open.URI('URL');"
        //              label="URL_DISPLAY_NAME"/>
        // For template MRU entries use this instead:
        //    <menuitem class="menuitem_mru"
        //              oncommand="ko.views.manager.newFileFromTemplateOrTrimMRU('URL');"
        //              label="URL_BASENAME"/>
        if (!menupopup) {
            menupopup = separator.parentNode;
        }
        var length = mruList.length;
        var labelNum = 1;
        for (var i = 0; i < length; i++) {
            if (limit && i == limit && limit < length - 1) {
                var m1 = document.createElementNS(XUL_NS, "menu");
                var moreLabel = _bundle.GetStringFromName("more");
                m1.setAttribute("label", moreLabel);
                m1.setAttribute("accesskey", moreLabel.substr(0, 1));
                var m2 = document.createElementNS(XUL_NS, "menupopup");
                m2.setAttribute("onpopupshowing", "event.stopPropagation();");
                m1.appendChild(m2);
                menupopup.appendChild(m1);
                if (addManageItem) {
                    _addManageMRUMenuItem(prefName, menupopup, MRUName);
                    addManageItem = false;
                }
                menupopup = m2;
                labelNum = 1;
            }
            var url = mruList.getStringPref(i);
            menuitem = document.createElement("menuitem");
            // Mozilla does not handle duplicate accesskeys, so only putting
            // them on first 10.
            if (labelNum <= 9) {
                menuitem.setAttribute("accesskey", "" + labelNum);
            } else if (labelNum == 10) {
                menuitem.setAttribute("accesskey", "0");
            }
            if (prefName == "mruTemplateList") {
                menuitem.setAttribute("label", labelNum + " " + ko.uriparse.baseName(url));
            } else {
                menuitem.setAttribute("label", labelNum + " " + ko.uriparse.displayPath(url));
            }
            labelNum++;
            menuitem.setAttribute("class", "menuitem_mru");
            menuitem.setAttribute("crop", "center");
            // XXX:HACK: For whatever reason, the "observes" attribute is
            // ignored when the menu item is inside a popup, so we call
            // ko.commands.doCommand directly. THIS IS NOT A GOOD THING!
            if (prefName == "mruTemplateList") {
                menuitem.setAttribute("oncommand",
                    "ko.uilayout.newFileFromTemplateOrTrimMRU('"+url+"', '"+prefName+"',"+i+");");
            } else {
                menuitem.setAttribute("oncommand",
                                      "ko.open.URI('" + url + "')");
            }

            menupopup.appendChild(menuitem);
        }
        if (addManageItem) {
            // We didn't need a "more" item
            _addManageMRUMenuItem(prefName, menupopup, MRUName);
            addManageItem = false;
        }
    }

    // MRU is empty or does not exist
    else {
        // Add an empty one like this:
        //    <menuitem label="No Recent Files" disabled="true"/>
        menuitem = document.createElement("menuitem");
        menuitem.setAttribute("label", _bundle.formatStringFromName("No Recent.menuitem", [prettyName], 1));
        menuitem.setAttribute("disabled", true);
        menupopup.appendChild(menuitem);
    }
}


// This is a little wrapper for ko.views.manager.doFileNewFromTemplateAsync()
// that first checks to see if the template file exists, and if not: (1) does
// not call doFileNewFromTemplateAsync and (2) removes the template entry
// from the given MRU. The file/view will be opened asynchronously.
//
// XXX The *right* way to do this is for ko.views.manager.doFileNewFromTemplateAsync
//     to return an error (code or exception) if the template doesn't exist --
//     instead of bringing up an error dialog. Then we'd trap that error,
//     notify the user, and trim the MRU. As it is we (practically) have to
//     assume that the template URL is local.
this.newFileFromTemplateOrTrimMRU = function uilayout_newFileFromTemplateOrTrimMRU(templateURI, mruPrefName,
                                               mruIndex)
{
    var templatePath = null;
    try {
        templatePath = ko.uriparse.URIToLocalPath(templateURI);
    } catch (ex) {
        // Template URI is not local. Hope for the best. :)
    }
    if (templatePath) {
        var osPathSvc = Components.classes["@activestate.com/koOsPath;1"]
            .getService(Components.interfaces.koIOsPath)
        if (!osPathSvc.exists(templatePath)) {
            ko.dialogs.alert(_bundle.GetStringFromName("theTemplatePathCannotBeFound"),
                         templatePath);
            ko.mru.del(mruPrefName, mruIndex);
            return;
        }
    }
    
    ko.views.manager.doFileNewFromTemplateAsync(templateURI);
}


// Flags used to defer (re)building of the MRU menus until necessary.
var _gNeedToUpdateFileMRUMenu = false;
var _gNeedToUpdateProjectMRUMenu = false;
var _gNeedToUpdateTemplateMRUMenu = false;

this.updateMRUMenuIfNecessary = function uilayout_UpdateMRUMenuIfNecessary(mru, limit)
{
    if (typeof(limit) == "undefined") {
        limit = 0;
    }
    // (Re)build the identified MRU menu if necessary.
    //    "mru" is indicates which MRU menu to update.
    // Current possible values: project, file, template, window
    if (mru == "project" && _gNeedToUpdateProjectMRUMenu) {
        _updateMRUMenu("mruProjectList", limit,
                       true /* addManageItem */,
                       "Most Recent Projects");
        /*Note: "Most Recent Projects" is a bundle key in library.properties */
        _gNeedToUpdateProjectMRUMenu = false;
    } else if (mru == "file" && _gNeedToUpdateFileMRUMenu) {
        _updateMRUMenu("mruFileList", limit);
        _gNeedToUpdateFileMRUMenu = false;
    } else if (mru == "template" && _gNeedToUpdateTemplateMRUMenu) {
        _updateMRUMenu("mruTemplateList", limit);
        _gNeedToUpdateTemplateMRUMenu = false;
    } else if (mru == "window") { // && _gNeedToUpdateTemplateMRUMenu) {
        this._updateMRUClosedWindowMenu(limit);
    }
}

this._updateMRUClosedWindowMenu = function(limit) {
    var menupopup = document.getElementById('popup_mruWindows');
    // Wipe out existing menuitems.
    while (menupopup.firstChild) {
        menupopup.removeChild(menupopup.firstChild);
    }
    this._windowInfoList = ko.workspace.getRecentClosedWindowList();
    var menuitem;
    for (var windowNum in this._windowInfoList) {
        //dump("Found windowNum " + windowNum + " in this._windowInfoList\n");
        menuitem = document.createElement("menuitem");
        menuitem.setAttribute("label", ko.uriparse.URIToPath(this._windowInfoList[windowNum].currentFile))
            menuitem.setAttribute("class", "menuitem_mru");
        menuitem.setAttribute("crop", "center");
        menuitem.setAttribute("oncommand",
                              "ko.uilayout._loadRecentWindow(" + windowNum + ");");
        menupopup.appendChild(menuitem);
    }
    if (menupopup.childNodes.length === 0) {
        // MRU is empty or does not exist
        // Add an empty one like this:
        //    <menuitem label="No Recent Files" disabled="true"/>
        menuitem = document.createElement("menuitem");
        menuitem.setAttribute("label", _bundle.formatStringFromName("No Recent.menuitem", [_bundle.GetStringFromName("Windows")], 1));
        menuitem.setAttribute("disabled", true);
        menupopup.appendChild(menuitem);
    }
}

this._loadRecentWindow = function(window_MRU_Num) {
    var windowState = this._windowInfoList[window_MRU_Num];
    delete this._windowInfoList;
    if (!windowState) {
        _log.error("_loadRecentWindow: Can't find windowItem " + window_MRU_Num + "\n");
        return;
    }
    ko.launch.newWindowForIndex(windowState.windowNum);
};

var gUilayout_Observer = null;
function _Observer ()
{
    var observerSvc = Components.classes["@mozilla.org/observer-service;1"].
                    getService(Components.interfaces.nsIObserverService);
    observerSvc.addObserver(this, "mru_changed",false);
    observerSvc.addObserver(this, "primary_languages_changed",false);
    var self = this;
    this.handle_current_view_changed_setup = function(event) {
        self.handle_current_view_changed(event);
    };
    this.handle_view_list_closed_setup = function(event) {
        self.handle_view_list_closed(event);
    };
    window.addEventListener('current_view_changed',
                            this.handle_current_view_changed_setup, false);
    window.addEventListener('current_view_language_changed',
                            this.handle_current_view_language_changed, false);
    window.addEventListener('view_list_closed',
                            this.handle_view_list_closed_setup, false);
    window.addEventListener('current_project_changed',
                            this.handle_project_changed, false);
    window.addEventListener('project_opened',
                            this.handle_project_changed, false);
};
_Observer.prototype.destroy = function()
{
    var observerSvc = Components.classes["@mozilla.org/observer-service;1"].
                    getService(Components.interfaces.nsIObserverService);
    observerSvc.removeObserver(this, "mru_changed");
    observerSvc.removeObserver(this, "primary_languages_changed");
    
    window.removeEventListener('current_view_changed',
                               this.handle_current_view_changed_setup, false);
    window.removeEventListener('current_view_language_changed',
                               this.handle_current_view_language_changed, false);
    window.removeEventListener('view_list_closed',
                               this.handle_view_list_closed_setup, false);
    window.removeEventListener('current_project_changed',
                               this.handle_project_changed, false);
    window.removeEventListener('project_opened',
                               this.handle_project_changed, false);
}
_Observer.prototype.observe = function(subject, topic, data)
{
    _log.info("Observing: " + topic);
    switch(topic) {
    case 'mru_changed':
        // Schedule update "File->Recent Files" and "File->Recent Projects"
        // menus.
        if (data == "mruFileList") {
            _gNeedToUpdateFileMRUMenu = true;
        } else if (data == "mruProjectList") {
            _gNeedToUpdateProjectMRUMenu = true;
        } else if (data == "mruTemplateList") {
            _gNeedToUpdateTemplateMRUMenu = true;
        }
        break;
    case 'primary_languages_changed':
        ko.uilayout.buildViewAsLanguageMenu();
        break;
    case 'current_project_changed':
    case 'project_opened':
        ko.uilayout.updateTitlebar(ko.views.manager.currentView);
        break;
    }
}

_Observer.prototype.current_view_changed_common = function(view) {
    if (!ko.views.manager.batchMode) {
        _updateCurrentLanguage(view);
        ko.uilayout.updateTitlebar(view);
    }
}
_Observer.prototype.handle_current_view_changed = function(event) {
    this.current_view_changed_common(event.originalTarget);
}

_Observer.prototype.handle_current_view_language_changed = function(event) {
    _log.info("GOT current_view_language_changed");
    _updateCurrentLanguage(event.originalTarget);
}
_Observer.prototype.handle_project_changed = function(event) {
    ko.uilayout.updateTitlebar(ko.views.manager.currentView);
}

_Observer.prototype.handle_view_list_closed = function(event) {
    this.current_view_changed_common(null);
}

function _updateCurrentLanguage(view)
{
    if (! _viewAsMenuIsBuilt) {
        // If we haven't built the menu yet, don't bother.
        return;
    }
    if (! view || !view.koDoc || !view.koDoc.language) {
        // If we don't have a current language, don't bother either
        return;
    }
    _setCheckedLanguage(view.koDoc.language);
}

function _setCheckedLanguage(language)
{
    _log.info("in _updateCurrentLanguage");
    var languageNameNospaces = language.replace(' ', '', 'g');
    var id1 = "menu_viewAs" + languageNameNospaces
    var id2 = "contextmenu_viewAs" + languageNameNospaces
    var i;
    var id;
    var child;
    var childnodes = document.getElementById('popup_viewAsLanguage').getElementsByTagName('menuitem');
    for (i = 0; i < childnodes.length; i++) {
        child = childnodes[i];
        id = child.getAttribute('id');
        if (id == id1) {
            child.setAttribute('checked', 'true');
        } else {
            child.setAttribute('checked', 'false');
        }
    }
    childnodes = document.getElementById('statusbar-filetype-menu').getElementsByTagName('menuitem');
    for (i = 0; i < childnodes.length; i++) {
        child = childnodes[i];
        id = child.getAttribute('id');
        if (id == id2) {
            child.setAttribute('checked', 'true');
        } else {
            child.setAttribute('checked', 'false');
        }
    }
}

// Create and return on tab/window item at the bottom of the Window menu.
//
//  "view" is the view to which this menuitem is attached
//  "index" is the index in the list of views
//  "isCurrent" is a boolean indicating if the view is the current one.
//
function _updateWindowList_createMenuItem(view, index, isCurrent)
{
    try {
        var menuitem = document.createElement('menuitem');
        menuitem.setAttribute('data', 'fileItem');
        menuitem.setAttribute('id', view.uid);
        var labels = ko.views.labelsFromView(view, null, true);
        var label = labels[0];
        if (!label) {
            label = view.title;
        }
        label = (index + 1) + " " + label;
        menuitem.setAttribute("label", label);
        if (index+1 <= 9) {
            menuitem.setAttribute("accesskey", index+1);
        }
        menuitem.setAttribute('type', 'checkbox');
        if (labels[1]) {
            menuitem.setAttribute("tooltiptext", labels[1]);
        }
        if (isCurrent) {
            menuitem.setAttribute('checked', 'true');
            menuitem.setAttribute('class', 'primary_menu_item');
            // No need to switch view oncommand, this view is already current.
            // However we *do* need to ensure that the checkmark stays.
            // See http://bugs.activestate.com/show_bug.cgi?id=26423
            menuitem.setAttribute('oncommand',
                                  'event.target.setAttribute("checked", "true");');
        } else {
            menuitem.setAttribute('checked', 'false');
            menuitem.setAttribute('oncommand', 'this.view.makeCurrent();');
        }
        menuitem.view = view;
        return menuitem;
    } catch(ex) {
        _log.exception(ex, "error generating Window list "+
                                    "menuitem for '"+view.title+"'");
    }
    return null;
}

function _compareView(a, b) {
    var a_title = a.title.toLowerCase();
    var b_title = b.title.toLowerCase();
    if (a_title < b_title)
        return -1
    if (a_title > b_title)
        return 1
    return 0
}

// This updates the list in the Window menu.  The window menu calls
// this when it is being shown to reset itself.
this.updateWindowList = function uilayout_updateWindowList(popup) {
    try {
        var views = ko.views.manager.topView.getDocumentViews(true);
        // clear out checked items first
        var items = popup.getElementsByAttribute('data', 'fileItem');
        var i = 0;
        while (items.length > 0) {
            popup.removeChild(items[0]);
        }
        views.sort(_compareView);
        var mi;
        for (i=0; i < views.length; i++) {
            mi = _updateWindowList_createMenuItem(views[i], i,
                    (views[i] == ko.views.manager.currentView));
            if (mi) popup.appendChild(mi);
        }
    } catch(ex) {
        _log.exception(ex, "error re-generating Window menu list");
    }
}

var _viewAsMenuIsBuilt = false;
this.updateViewAsMenuIfNecessary = function uilayout_UpdateViewAsMenuIfNecessary()
{
    if (_viewAsMenuIsBuilt) return;
    ko.uilayout.buildViewAsLanguageMenu();
    _viewAsMenuIsBuilt = true;
}

function _getHierarchy(hdata) {
    var langService = Components.classes["@activestate.com/koLanguageRegistryService;1"].
                getService(Components.interfaces.koILanguageRegistryService);
    var langHierarchy = langService.getLanguageHierarchy();
    var items = _buildMenuTree(hdata, langHierarchy, true);
    for (var i=0;i<items[0].length;i++)  {
        hdata.viewAsMenu.appendChild(items[0][i]);
        hdata.statusbarContextMenu.appendChild(items[1][i]);
    }
}


function _buildMenuTree(hdata, hierarchy, toplevel) {
    var menu, menu2;
    var menupopup, menupopup2;
    var viewAs_menuitems = new Array();
    var context_menuitems = new Array();
    var cmd, menuitem, menuitem2;
    var children = new Object();
    var count = new Object();
    var i, j;

    if (hierarchy.container == true)  {
        // build menu
        hierarchy.getChildren(children, count);
        children = children.value;

        for (i=0;i<children.length;i++)  {
            var a = _buildMenuTree(hdata, children[i], false);
            viewAs_menuitems.push(a[0]);
            context_menuitems.push(a[1]);
        }
        if (!toplevel)  {
            menu = document.createElementNS(XUL_NS, 'menu');
            menupopup = document.createElementNS(XUL_NS, 'menupopup');
            menu.setAttribute('label', hierarchy.name);
            menu2 = document.createElementNS(XUL_NS, 'menu');
            menupopup2 = document.createElementNS(XUL_NS, 'menupopup');
            menu2.setAttribute('label', hierarchy.name);
            menu2.setAttribute("class", "statusbar-label");

            for (j=0;j<viewAs_menuitems.length;j++)  {
                menupopup.appendChild(viewAs_menuitems[j]);
                menupopup2.appendChild(context_menuitems[j]);
            }
            menu.appendChild(menupopup);
            menu2.appendChild(menupopup2);
            return [menu, menu2];
        }
        return [viewAs_menuitems, context_menuitems];
    }
    else  {
        var languageNameNospaces = hierarchy.name.replace(' ', '', 'g')

        menuitem = document.createElementNS(XUL_NS, 'menuitem');
        menuitem.setAttribute("id", "menu_viewAs" + languageNameNospaces);
        menuitem.setAttribute('label', hierarchy.name);
        menuitem.setAttribute("accesskey", hierarchy.key);
        menuitem.setAttribute("type", "checkbox");
        menuitem.setAttribute("name", "current_language");
        menuitem.setAttribute("observes", "cmd_viewAs"+languageNameNospaces);

        menuitem2 = document.createElementNS(XUL_NS, 'menuitem');
        menuitem2.setAttribute("accesskey", hierarchy.key);
        menuitem2.setAttribute("label", hierarchy.name);
        menuitem2.setAttribute("class", "statusbar-label");
        menuitem2.setAttribute("type", "checkbox");
        menuitem2.setAttribute("name", "current_language");
        menuitem2.setAttribute("observes", "cmd_viewAs"+languageNameNospaces);
        menuitem2.setAttribute("name", "current_language_statusbar");
        menuitem2.setAttribute("id", "contextmenu_viewAs" + languageNameNospaces);

        if (hierarchy.name == hdata.language) {
            menuitem.setAttribute('checked', 'true');
            menuitem2.setAttribute('checked', 'true');
        }

        // create the commandset
        cmd = document.createElementNS(XUL_NS, 'command');
        cmd.setAttribute("id", "cmd_viewAs"+languageNameNospaces);
        if (hdata.language == null) {
            cmd.setAttribute("disabled", "true");
        }
        cmd.setAttribute("oncommand", "ko.views.manager.do_ViewAs('" + hierarchy.name + "');");
        hdata.commandset.appendChild(cmd);

        return [menuitem, menuitem2];
    }
}

// This updates the list in the View As ... menu.
// Called by uilayout_onload
this.buildViewAsLanguageMenu = function uilayout_buildViewAsLanguageMenu() {
    // We may already have a language, let's find out:

    var hdata = {};
    var cmd, menuitem, menuitem2;
    hdata.commandset = document.getElementById("cmdset_viewAs");
    hdata.viewAsMenu = document.getElementById("popup_viewAsLanguage");
    hdata.statusbarContextMenu = document.getElementById('statusbar-filetype-menu');
    // If we're rebuilding a menu, delete any existing nodes.
    for (var p in hdata) {
        var node = hdata[p];
        while (node.firstChild) {
            node.removeChild(node.firstChild);
        }
    }
    hdata.language = null;
    if (ko.views.manager.currentView &&
        ko.views.manager.currentView.koDoc &&
        ko.views.manager.currentView.koDoc.language) {
        hdata.language = ko.views.manager.currentView.koDoc.language;
    }
    try {
    _getHierarchy(hdata);
    } catch (e) {
        _log.exception(e);
    }
    cmd = document.createElementNS(XUL_NS, 'command');
    cmd.setAttribute("id", "cmd_viewAsGuessedLanguage");
    cmd.setAttribute("disabled", "true");
    cmd.setAttribute("oncommand", "ko.views.manager.do_ViewAs('');");
    hdata.commandset.appendChild(cmd);
    menuitem = document.createElementNS(XUL_NS, 'menuseparator');
    hdata.viewAsMenu.appendChild(menuitem);
    menuitem2 = document.createElementNS(XUL_NS, 'menuseparator');
    hdata.statusbarContextMenu.appendChild(menuitem2);
    menuitem = document.createElementNS(XUL_NS, 'menuitem');
    menuitem.setAttribute("id", "menu_viewAsGuessedLanguage");
    menuitem.setAttribute("label", _bundle.GetStringFromName("resetToBestGuess"));
    menuitem.setAttribute("observes", "cmd_viewAsGuessedLanguage");
    hdata.viewAsMenu.appendChild(menuitem);
    menuitem2 = document.createElementNS(XUL_NS, 'menuitem');
    menuitem2.setAttribute("id", "menu_viewAsGuessedLanguage");
    menuitem2.setAttribute("label", _bundle.GetStringFromName("resetToBestGuess"));
    menuitem2.setAttribute("class", "statusbar-label");
    menuitem2.setAttribute("observes", "cmd_viewAsGuessedLanguage");
    hdata.statusbarContextMenu.appendChild(menuitem2);
}


this.outputPaneShown = function uilayout_outputPaneShown()
{
    return !window.document.getElementById("workspace_bottom_area").collapsed;
}

this.leftPaneShown = function uilayout_leftPaneShown()
{
    var splitter = window.document.getElementById("workspace_left_splitter");
    if (!splitter.hasAttribute('collapsed')) {
        return true;
    }
    var collapsed = splitter.getAttribute('collapsed') == 'true';
    return !collapsed;
}

this.rightPaneShown = function uilayout_rightPaneShown()
{
    var splitter = window.document.getElementById("workspace_right_splitter");
    if (!splitter.hasAttribute('collapsed')) {
        return true;
    }
    var collapsed = splitter.getAttribute('collapsed') == 'true';
    return !collapsed;
}

this.isCodeBrowserTabShown = function uilayout_isCodeBrowserTabShown()
{
    var splitter = window.document.getElementById("workspace_left_splitter");
    if (splitter.hasAttribute("collapsed")
        && splitter.getAttribute("collapsed") == "true") {
        return false;
    }
    var tabs = window.document.getElementById("project_toolbox_tabs");
    var tab = window.document.getElementById("codebrowser_tab");
    if (tabs.selectedItem != tab) {
        return false;
    }
    return true;
}


this.ensureOutputPaneShown = function uilayout_ensureOutputPaneShown()
{
    if (!ko.uilayout.outputPaneShown()) {
        ko.uilayout.toggleSplitter('cmd_viewBottomPane');
    }
}


this.ensurePaneForTabHidden = function uilayout_ensurePaneForTabHidden(tabName)
{
    // given a tab id, collapse the pane that the tab is in.
    var tab = document.getElementById(tabName);
    var tabs = tab.parentNode;
    if (! tabs.hasAttribute('splitterId')) {
        _log.error("Tab " + tabName + " isn't in a tabs element with a splitterId");
        return;
    }
    if (ko.uilayout.isPaneShown(tabs)) {
        var splitterId = tabs.getAttribute('splitterId');
        var splitterWidget = document.getElementById(splitterId);
        var splitterCmdId = splitterWidget.getAttribute('splitterCmdId');
        ko.uilayout.toggleSplitter(splitterCmdId);
    }
}


this.isPaneShown = function uilayout_isPaneShown(tabs) {
    var splitterId = tabs.getAttribute('splitterId');
    var splitterWidget = document.getElementById(splitterId);
    if (splitterWidget.hasAttribute('collapsed') &&
        splitterWidget.getAttribute('collapsed') == 'true') {
        return false;
    } else {
        return true;
    }
}

this.ensurePaneShown = function uilayout_ensurePaneShown(pane) {
    pane.tabbox.collapsed = false;
}

this.ensureTabShown = function uilayout_ensureTabShown(paneId, focusToo) {
    try {
        if (typeof(focusToo) == 'undefined') focusToo = false;
        var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                        .getService(Components.interfaces.nsIWindowMediator);
        var mainWindow = wm.getMostRecentWindow('Komodo');
        var pane = mainWindow.document.getElementById(paneId);
        if (!pane) {
            _log.error("ko.uilayout.ensureTabShown: couldn't find tab: " + paneId);
            return;
        }
        // First make sure that the pane the tab is in is visible
        ko.uilayout.ensurePaneShown(pane);
        pane.tabbox.selectedTab = pane.tab;
        if (focusToo) {
            pane.focus();
        }
    } catch (e) {
        _log.exception(e);
    }
}

/* Update the titlebar
   Have to keep in mind debugging state */
this.updateTitlebar = function uilayout_updateTitlebar(view)  {
    var viewPart = "";
    var preProjectPart, projectPart, postProjectPart;
    var postTitlePart = "";
    var projectRootName = ko.projects.manager.projectBaseName();
    if (view == null)  {
        if (projectRootName) {
            preProjectPart = "(";
            postProjectPart = ")";
        } else {
            preProjectPart = postProjectPart = "";
        }
    } else {
        viewPart = view.title;
        if (view.isDirty)  {
            viewPart += "*";
        }
        if (view.koDoc &&
            view.koDoc.file &&
            view.getAttribute("type") != "startpage") {
            var fullPath = (view.koDoc.file.isLocal
                            ? view.koDoc.file.dirName
                            : view.koDoc.displayPath);
            viewPart += ' (' + ko.stringutils.contractUser(fullPath);
            if (projectRootName) {
                preProjectPart = ", ";
            }
            postProjectPart = "";
            postTitlePart = ")";
        } else if (projectRootName) {
            preProjectPart = " (";
            postProjectPart = ")";
        }
    }
    if (projectRootName) {
        viewPart += (preProjectPart
                     + _bundle.GetStringFromName("Project")
                     + " "
                     + projectRootName
                     + postProjectPart
                     );
    }
    viewPart += postTitlePart;
    var title = viewPart;

    var branding = '';
//#if PLATFORM == "darwin"
    if (!title) { // No branding in titlebar by default on Mac OS X.
        branding = "PP_KO_TITLE_BAR_NAME";
    }
//#else
    if (title) {
        branding += " - ";
    }
    branding += "PP_KO_TITLE_BAR_NAME";
//#endif

    document.title = title + branding;
}


this.unload = function uilayout_unload()
{
    gUilayout_Observer.destroy();
    gUilayout_Observer = null;
    _prefobserver.destroy();
    _gPrefs.setBooleanPref("startupFullScreen", window.fullScreen)
    // nsIDOMChromeWindow STATE_MAXIMIZED = 1
    _gPrefs.setBooleanPref("startupMaximized", window.windowState==1)
}

this.onload = function uilayout_onload()
{
    ko.uilayout.updateToolbarArrangement();
    addEventListener("fullscreen", ko.uilayout.onFullScreen, false);
    ko.uilayout.updateSplitterBroadcasterState('cmd_viewRightPane');
    ko.uilayout.updateSplitterBroadcasterState('cmd_viewLeftPane');
    ko.uilayout.updateSplitterBroadcasterState('cmd_viewBottomPane');
    _gNeedToUpdateFileMRUMenu = true;
    _gNeedToUpdateProjectMRUMenu = true;
    _gNeedToUpdateTemplateMRUMenu = true;
    gUilayout_Observer = new _Observer();
    _prefobserver = new _PrefObserver();
    _prefobserver.init();
    _updateAccesskeys();
    ko.main.addWillCloseHandler(ko.uilayout.unload);
}

this._setTabPaneLayoutForTabbox = function(layout, pane, position) {
    if (position == "right" && layout != "vertical") {
        pane.removeAttribute("dir");
    }
    switch (layout) {
        case "sidebar":
        case "horizontal":
            if (pane.getAttribute("type") == "vertical") {
                // Ensure to properly unhook the vertical tabs event handlers
                // when switching bindings - otherwise exceptions will be raised
                // when any adding/deleting of nodes occurs.
                pane.tabs.unHookBinding();
            }
            break;
        case "vertical":
            if (position == "left") {
                pane.setAttribute("rotation", "270");
            } else if (position == "right") {
                pane.setAttribute("rotation", "90");
            }
            break;
    }
    pane.setAttribute("type", layout);
}

/**
 * Sets the user's tab pane layout to match the Komodo appearance preferences.
 */
this.setTabPaneLayout = function uilayout_setTabPaneLayout() {
    // Set the tab pane layout.
    var leftTabStyle = _gPrefs.getStringPref("ui.tabs.sidepanes.left.layout");
    var leftTabbox = document.getElementById("workspace_left_area");
    ko.uilayout._setTabPaneLayoutForTabbox(leftTabStyle, leftTabbox, "left");

    var rightTabStyle = _gPrefs.getStringPref("ui.tabs.sidepanes.right.layout");
    var rightTabbox = document.getElementById("workspace_right_area");
    ko.uilayout._setTabPaneLayoutForTabbox(rightTabStyle, rightTabbox, "right");

    var bottomTabStyle = _gPrefs.getStringPref("ui.tabs.sidepanes.bottom.layout");
    var bottomTabbox = document.getElementById("workspace_bottom_area");
    ko.uilayout._setTabPaneLayoutForTabbox(bottomTabStyle, bottomTabbox, "bottom");

    if (navigator.oscpu == 'Windows NT 5.1') {
        // This is Windows XP. Set an "os" property on the tabbox, so can do
        // specific styling, see bug 87984.
        leftTabbox.setAttribute("os", "winxp");
        rightTabbox.setAttribute("os", "winxp");
    }
}

this.onloadDelayed = function uilayout_onloadDelayed()
{
    try {
        if (_gPrefs.getBooleanPref("startupFullScreen")) {
            ko.uilayout.fullScreen();
        }
        else if (_gPrefs.getBooleanPref("startupMaximized")) {
            window.maximize()
        }
    
        ko.uilayout.setTabPaneLayout();
    } catch (e) {
        _log.exception("Couldn't restore layout:" + e);
    }
}

var _prefobserver;

function _updateAccesskeys() {
    var menus = new Object();
    var count = new Object();
    var menu;
    var menubar;
    var extra_ids = ['open_label', 'find_label'];
    var i;
    var item;

    var enable = ! _gPrefs.getBooleanPref("keybindingDisableAccesskeys");

    menubar = document.getElementById('menubar_main');
    menus = menubar.childNodes;
    for (i = 0; i < menus.length; i++) {
        menu = menus[i];
        _enableAccesskey(menu, enable);
    }
    for (i = 0; i < extra_ids.length; i++) {
        item = document.getElementById(extra_ids[i]);
        if (item) {
            _enableAccesskey(item, enable);
        }
    }
}

function _enableAccesskey(elt, enable) {
    if (enable) {
        if (elt.hasAttribute('_accesskey')) {
            elt.setAttribute('accesskey', elt.getAttribute('_accesskey'));
            elt.removeAttribute('_accesskey');
        }
    } else {
        if (elt.hasAttribute('accesskey')) {
            elt.setAttribute('_accesskey', elt.getAttribute('accesskey'));
            elt.removeAttribute('accesskey');
        }
    }
}

// A pref observer to watch for ui-related pref changes.
function _PrefObserver() {};
_PrefObserver.prototype.observe = function(prefSet, prefName, prefSetID)
{
    if (prefName == "keybindingDisableAccesskeys") {
        _updateAccesskeys();

    } else if (prefName == "ui.tabs.sidepanes.left.layout") {
        // Set the tab pane layout.
        var leftTabStyle = _gPrefs.getStringPref("ui.tabs.sidepanes.left.layout");
        var leftTabbox = document.getElementById("workspace_left_area");
        ko.uilayout._setTabPaneLayoutForTabbox(leftTabStyle, leftTabbox, "left");

    } else if (prefName == "ui.tabs.sidepanes.right.layout") {
        var rightTabStyle = _gPrefs.getStringPref("ui.tabs.sidepanes.right.layout");
        var rightTabbox = document.getElementById("workspace_right_area");
        ko.uilayout._setTabPaneLayoutForTabbox(rightTabStyle, rightTabbox, "right");

    } else if (prefName == "ui.tabs.sidepanes.bottom.layout") {
        var bottomTabStyle = _gPrefs.getStringPref("ui.tabs.sidepanes.bottom.layout");
        var bottomTabbox = document.getElementById("workspace_bottom_area");
        ko.uilayout._setTabPaneLayoutForTabbox(bottomTabStyle, bottomTabbox, "bottom");
    }
};

_PrefObserver.prototype.init = function() {
    _gPrefs.prefObserverService.addObserver(this, "keybindingDisableAccesskeys", false);
    _gPrefs.prefObserverService.addObserver(this, "ui.tabs.sidepanes.left.layout", false);
    _gPrefs.prefObserverService.addObserver(this, "ui.tabs.sidepanes.right.layout", false);
    _gPrefs.prefObserverService.addObserver(this, "ui.tabs.sidepanes.bottom.layout", false);
}

_PrefObserver.prototype.destroy = function() {
    _gPrefs.prefObserverService.removeObserver(this, "keybindingDisableAccesskeys");
    _gPrefs.prefObserverService.removeObserver(this, "ui.tabs.sidepanes.left.layout");
    _gPrefs.prefObserverService.removeObserver(this, "ui.tabs.sidepanes.right.layout");
    _gPrefs.prefObserverService.removeObserver(this, "ui.tabs.sidepanes.bottom.layout");
}

this.saveTabSelections = function uilayout_SaveTabSelections(prefs) {
    if (typeof(prefs) == "undefined") prefs = _gPrefs;

    function _savePanePrefs(prefs, paneID, isCollapsedPrefID, selectedPanelPrefID) {
        var pane = document.getElementById(paneID);
        var selectedPanelId = pane.selectedPanel.id;
        prefs.setBooleanPref(isCollapsedPrefID,
                             pane.getAttribute('collapsed') == 'true');
        prefs.setStringPref(selectedPanelPrefID, selectedPanelId);
    }
    try {
        _savePanePrefs(prefs, 'workspace_left_area',
                       'uilayout_leftTabBox_collapsed',
                       'uilayout_leftTabBoxSelectedTabId');
        _savePanePrefs(prefs, 'workspace_right_area',
                       'uilayout_rightTabBox_collapsed',
                       'uilayout_rightTabBoxSelectedTabId');
        _savePanePrefs(prefs, 'workspace_bottom_area',
                       'uilayout_bottomTabBox_collapsed',
                       'uilayout_bottomTabBoxSelectedTabId');
    } catch (e) {
        _log.exception("Couldn't save selected tab preferences:" + e);
    }
}

var _buttonIdFromTabboxId = {
    leftTabBox : "toggleLeftPane",
    rightTabBox : "toggleRightPane",
    workspace_bottom_area : "toggleBottomPane"
};
var _splitterIdFromTabboxId = {
    leftTabBox : "workspace_left_splitter",
    rightTabBox : "workspace_right_splitter",
    workspace_bottom_area : "bottom_splitter"
};

this.restoreTabSelections = function uilayout_RestoreTabSelections(prefs) {

    function _restoreTabBox(prefs, tabboxID, isCollapsedPrefID, selectedTabPrefID) {
        if (prefs.hasStringPref(selectedTabPrefID)) {
            var selectedTabId = prefs.getStringPref(selectedTabPrefID);
            var pane = document.getElementById(tabboxID);
            if (prefs.hasBooleanPref(isCollapsedPrefID)) {
                pane.collapsed = prefs.getBooleanPref(isCollapsedPrefID);
            }
            var panel = document.getElementById(selectedTabId);
            if (panel && !panel.hasAttribute("collapsed")) {
                pane.selectedTab = panel.tab;
            }
        }
    }

    if (typeof(prefs) == "undefined") prefs = _gPrefs;
    try {
        _restoreTabBox(prefs, 'workspace_left_area',
                       'uilayout_leftTabBox_collapsed',
                       'uilayout_leftTabBoxSelectedTabId');
        _restoreTabBox(prefs, 'workspace_right_area',
                       'uilayout_rightTabBox_collapsed',
                       'uilayout_rightTabBoxSelectedTabId');
        _restoreTabBox(prefs, 'workspace_bottom_area',
                       'uilayout_bottomTabBox_collapsed',
                       'uilayout_bottomTabBoxSelectedTabId');
    } catch (e) {
        Components.utils.reportError(e);
        _log.exception("Couldn't restore selected tab: " + e);
    }
}

this.syncTabSelections = function uilayout_syncTabSelections() {
    // Fix bug http://bugs.activestate.com/show_bug.cgi?id=87584:
    // This is called at startup for new additional windows that don't 
    // have a set of workspace-specific prefs to consult.
    //
    // The problem is that Mozilla uses persisted and default items
    // to determine which workspace-level tabs are collapsed, and
    // which toolbar buttons show up checked, but these defaults
    // aren't always in sync, even though the XUL specifies they
    // should be persisted.
    //
    // If a tab is closed, the button should be in its unchecked
    // state, and vice versa.
    
    function syncTabUI(paneID) {
        var pane = document.getElementById(paneID);
        if (pane.hasAttribute("collapsed")) {
            pane.removeAttribute("checked");
        } else {
            pane.setAttribute("checked", true);
        }
    }
    try {
        syncTabUI('workspace_left_area');
        syncTabUI('workspace_right_area');
        syncTabUI('workspace_bottom_area');
    } catch (e) {
        _log.exception("Couldn't sync selected tab: " + e);
    }
}

}).apply(ko.uilayout);

/**
 * @deprecated since 7.0
 */
ko.logging.globalDeprecatedByAlternative("uilayout_toggleToolbarVisibility", "ko.uilayout.toggleToolbarVisibility");
ko.logging.globalDeprecatedByAlternative("uilayout_toggleButtons", "ko.uilayout.toggleButtons");
ko.logging.globalDeprecatedByAlternative("uilayout_updateToolbarArrangement", "ko.uilayout.updateToolbarArrangement");
ko.logging.globalDeprecatedByAlternative("uilayout_populatePreviewToolbarButton", "ko.uilayout.populatePreviewToolbarButton");
ko.logging.globalDeprecatedByAlternative("uilayout_focusPane", "ko.uilayout.focusPane");
ko.logging.globalDeprecatedByAlternative("uilayout_toggleTab", "ko.uilayout.toggleTab");
ko.logging.globalDeprecatedByAlternative("uilayout_updateTabpickerMenu", "ko.uilayout.updateTabpickerMenu");
ko.logging.globalDeprecatedByAlternative("uilayout_togglePane", "ko.uilayout.togglePane");
ko.logging.globalDeprecatedByAlternative("uilayout_toggleSplitter", "ko.uilayout.toggleSplitter");
ko.logging.globalDeprecatedByAlternative("uilayout_updateSplitterBroadcasterState", "ko.uilayout.updateSplitterBroadcasterState");
ko.logging.globalDeprecatedByAlternative("uilayout_updateFullScreen", "ko.uilayout.updateFullScreen");
ko.logging.globalDeprecatedByAlternative("uilayout_FullScreen", "ko.uilayout.fullScreen");
ko.logging.globalDeprecatedByAlternative("uilayout_onFullScreen", "ko.uilayout.onFullScreen");
ko.logging.globalDeprecatedByAlternative("uilayout_newFileFromTemplateOrTrimMRU", "ko.uilayout.newFileFromTemplateOrTrimMRU");
ko.logging.globalDeprecatedByAlternative("uilayout_UpdateMRUMenuIfNecessary", "ko.uilayout.updateMRUMenuIfNecessary");
ko.logging.globalDeprecatedByAlternative("uilayout_updateWindowList", "ko.uilayout.updateWindowList");
ko.logging.globalDeprecatedByAlternative("uilayout_UpdateViewAsMenuIfNecessary", "ko.uilayout.updateViewAsMenuIfNecessary");
ko.logging.globalDeprecatedByAlternative("uilayout_buildViewAsLanguageMenu", "ko.uilayout.buildViewAsLanguageMenu");
ko.logging.globalDeprecatedByAlternative("uilayout_outputPaneShown", "ko.uilayout.outputPaneShown");
ko.logging.globalDeprecatedByAlternative("uilayout_leftPaneShown", "ko.uilayout.leftPaneShown");
ko.logging.globalDeprecatedByAlternative("uilayout_rightPaneShown", "ko.uilayout.rightPaneShown");
ko.logging.globalDeprecatedByAlternative("uilayout_isCodeBrowserTabShown", "ko.uilayout.isCodeBrowserTabShown");
ko.logging.globalDeprecatedByAlternative("uilayout_ensureOutputPaneShown", "ko.uilayout.ensureOutputPaneShown");
ko.logging.globalDeprecatedByAlternative("uilayout_ensurePaneForTabHidden", "ko.uilayout.ensurePaneForTabHidden");
ko.logging.globalDeprecatedByAlternative("uilayout_isPaneShown", "ko.uilayout.isPaneShown");
ko.logging.globalDeprecatedByAlternative("uilayout_findMainWindow", "ko.windowManager.getMainWindow");
ko.logging.globalDeprecatedByAlternative("uilayout_ensurePaneShown", "ko.uilayout.ensurePaneShown");
ko.logging.globalDeprecatedByAlternative("uilayout_ensureTabShown", "ko.uilayout.ensureTabShown");
ko.logging.globalDeprecatedByAlternative("uilayout_updateTitlebar", "ko.uilayout.updateTitlebar");
ko.logging.globalDeprecatedByAlternative("uilayout_unload", "ko.uilayout.unload");
ko.logging.globalDeprecatedByAlternative("uilayout_onload", "ko.uilayout.onload");
ko.logging.globalDeprecatedByAlternative("uilayout_onloadDelayed", "ko.uilayout.onloadDelayed");
ko.logging.globalDeprecatedByAlternative("uilayout_SaveTabSelections", "ko.uilayout.saveTabSelections");
ko.logging.globalDeprecatedByAlternative("uilayout_RestoreTabSelections", "ko.uilayout.restoreTabSelections");
