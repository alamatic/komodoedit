/* Copyright (c) 2000-2010 ActiveState Software Inc.
   See the file LICENSE.txt for licensing information. */

// The "command" tool
//

if (typeof(ko)=='undefined') {
    var ko = {};
}
if (typeof(ko.toolbox2)=='undefined') {
    ko.toolbox2 = {};
}

(function() {

this._dragSources = [];
this._dragIndices = [];

this._get_tool_data = function(expected_type_name) {
    // See peMacro.js for handling multiple items.
    var view = ko.toolbox2.manager.view;
    var index = view.selection.currentIndex;
    var tool = view.getTool(index);
    if (!tool) {
        return [null, null, null];
    }
    if (tool.toolType != expected_type_name) {
        alert("Internal error: expected a "
              + expected_type_name
              + ", but this tool is a "
              + tool.toolType);
        return [view, index, null];
    }
    return [view, index, tool];
};

this._get_tool = function(expected_type_name) {
    return this._get_tool_data(expected_type_name)[2];
};

// Commands
this.invoke_runCommand = function(event, tool) {
    if (typeof(tool) == 'undefined') {
        tool = this._get_tool('command');
        if (!tool) return;
    }
    ko.projects.runCommand(tool);
};
 
this.editProperties_runCommand = function(event, tool) {
    if (typeof(tool) == 'undefined') {
        tool = this._get_tool('command');
        if (!tool) return;
    }
    ko.projects.commandProperties(tool);
};

this.add_command = function(view, index, parent, item) {
    // Code from peCommand.addCommand, since enough of it will change.
    item.setStringAttribute('name', "New Command");
    var obj = {
        part:item,
        task:'new'
    };
    ko.windowManager.openOrFocusDialog(
        "chrome://komodo/content/run/commandproperties.xul",
        "Komodo:CommandProperties",
        "chrome,close=yes,modal=yes,dependent=yes,centerscreen",
        obj);
    if (obj.retval == "OK") {
        this.addNewItemToParent(item, parent);
    }
};

// DirectoryShortcuts
this.invoke_openDirectoryShortcut = function(event, tool) {
    if (typeof(tool) == 'undefined') {
        tool = this._get_tool('DirectoryShortcut');
        if (!tool) return;
    }
    ko.projects.openDirectoryShortcut(tool);
};

this.add_DirectoryShortcut = function(view, index, parent, item) {
    var dirname = ko.filepicker.getFolder();
    if (!dirname) return;
    item.value = dirname;
    item.name  = dirname.replace(/^.*[\/\\]/, "");
    this.addNewItemToParent(item, parent);
};

var peFile_bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
      .getService(Components.interfaces.nsIStringBundleService)
      .createBundle("chrome://komodo/locale/project/peFile.properties");
var peFolder_bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
      .getService(Components.interfaces.nsIStringBundleService)
      .createBundle("chrome://komodo/locale/project/peFolder.properties");

this.editProperties_DirectoryShortcut = function(event, tool) {
    if (typeof(tool) == 'undefined') {
        tool = this._get_tool('DirectoryShortcut');
        if (!tool) return;
    }
    // From peFile.p.js -- unexported prototype, so copy the code here, and
    // update its style.
    var obj = {
        item : tool,
        task: 'edit',
        imgsrc: 'chrome://komodo/skin/images/open.png',
        'type': 'DirectoryShortcut',
        prettytype: peFile_bundle.GetStringFromName("directoryShortcut")
    };
    window.openDialog(
        "chrome://komodo/content/project/simplePartProperties.xul",
        "Komodo:DirectoryShortcutProperties",
        "chrome,close=yes,dependent=yes,modal=yes,resizable=yes", obj);
};

// Macros

this.invoke_executeMacro = function(event, tool) {
    if (typeof(tool) == 'undefined') {
        tool = this._get_tool('macro');
        if (!tool) return;
    }
    ko.projects.executeMacro(tool, tool.getBooleanAttribute('async'));
};

this.invoke_editMacro = function(event, tool) {
    if (typeof(tool) == 'undefined') {
        tool = this._get_tool('macro');
        if (!tool) return;
    }
    ko.open.URI(tool.url);
};

this.editProperties_macro = function(event, tool) {
    if (typeof(tool) == 'undefined') {
        tool = this._get_tool('macro');
        if (!tool) return;
    }
    ko.projects.macroProperties(tool);
};

this.add_macro = function(view, index, parent, item) {
    ko.projects.addMacro(parent, item);
};

// Snippets

this.invoke_insertSnippet = function(event, tool) {
    if (typeof(tool) == 'undefined') {
        tool = this._get_tool('snippet');
        if (!tool) return;
    }
    ko.projects.snippetInsert(tool);
};

this.editProperties_snippet = function(event, tool) {
    if (typeof(tool) == 'undefined') {
        tool = this._get_tool('snippet');
        if (!tool) return;
    }
    ko.projects.snippetProperties(tool);
};

this.add_snippet = function(view, index, parent, item) {
    ko.projects.addSnippet(parent, item);
};

// Templates
this.invoke_openTemplate = function(event, tool) {
    if (typeof(tool) == 'undefined') {
        tool = this._get_tool('template');
        if (!tool) return;
    }
    ko.views.manager.doFileNewFromTemplateAsync(tool.url);
};

this.add_template = function(view, index, parent, item) {
    // ref code peTemplate.js::addTemplate
    var obj = { type:'file',
                templateOnly:true
    };
    ko.launch.newTemplate(obj);
    if (obj.template == null) return;
    // Avoid multiple calls to uriparse.*
    var templateName = ko.uriparse.baseName(obj.template);
    item.setStringAttribute('name', templateName);
    item.value = ko.uriparse.localPathToURI(obj.template);
    this.addNewItemToParent(item, parent);
};

// Templates can't be edited -- Komodo 5 uses the 
// file properties dialog to edit a template, which is just wrong.

// URLs
this.invoke_openURLInBrowser = function(event, tool) {
    if (typeof(tool) == 'undefined') {
        tool = this._get_tool('URL');
        if (!tool) return;
    }
    ko.browse.openUrlInDefaultBrowser(tool.value);
};

this.invoke_openURLInTab = function(event, tool) {
    if (typeof(tool) == 'undefined') {
        tool = this._get_tool('URL');
        if (!tool) return;
    }
    var docSvc = Components.classes['@activestate.com/koDocumentService;1']
    .getService(Components.interfaces.koIDocumentService);
    var doc = docSvc.createDocumentFromURI(tool.value);
    ko.views.manager.topView.createViewFromDocument(doc, 'browser', -1);
};

this.editProperties_URL = function(event, tool) {
    if (typeof(tool) == 'undefined') {
        tool = this._get_tool('URL');
        if (!tool) return;
    }
    ko.projects.URLProperties(tool);
};

this.add_URL = function(view, index, parent, item) {
    ko.projects.addURL(parent, item);
};

// folders
this.invoke_folderCommand = function(event, tool) {
    // none of these seem to have much of an effect
    event.cancelBubble = true;
    event.stopPropagation();
    event.preventDefault();
};

this.add_folder = function(view, index, parent, item) {
    var basename = ko.dialogs.prompt(peFolder_bundle.GetStringFromName("enterFolderName"));
    if (!basename) return;
    item.setStringAttribute('name', basename);
    this.addNewItemToParent(item, parent);
};

// Templates can't be edited -- Komodo 5 uses the 
// file properties dialog to edit a template, which is just wrong.

// Generic functions on the hierarchy view tree

this._propertyEditorNameForToolType = {
 'command' : this.editProperties_runCommand,
 'DirectoryShortcut': this.editProperties_DirectoryShortcut,
 'macro': this.editProperties_macro,
 'snippet': this.editProperties_snippet,
 'template': this.editProperties_template,
 'URL': this.editProperties_URL,
 '__EOD__':null
};

this.editPropertiesItem = function(event) {
    var that = ko.toolbox2;
    var view = that.manager.view;
    var index = view.selection.currentIndex;
    var tool = view.getTool(index);
    var method = that._propertyEditorNameForToolType[tool.toolType];
    if (method) {
        method.call(that, event);
    } else {
        alert("toolbox2_command.js::editPropertiesItem: Interal error: Don't know how to edit properties for "
              + tool.toolType
              + " "
              + tool.name);
    }
};

this.addToolboxItem = function(itemType) {
    try {
    var this_ = ko.toolbox2;
    var method = this_["add_" + itemType];
    if (!method) {
        alert("toolbox2_command.js internal error: Don't know how to create a new "
              + itemType);
        return;
    }
    var view = this_.manager.view;
    var index = view.selection.currentIndex;
    var parent = view.getTool(index);
    var item = view.createToolFromType(itemType);
    method.call(this_, view, index, parent, item);
    } catch(ex) {
        ko.dialogs.alert("toolbox2_command.js: Internal error: Trying to add a new "
                         + itemType
                         + ": "
                         + ex);
    }
};

// Generic top-level routines
this._selectCurrentItems = function() {
    this.selectedIndices = this.getSelectedIndices(/*rootsOnly=*/true);
    var view = this.manager.view;
    var paths = this.selectedIndices.map(function(index) {
            return view.getTool(index).path;
            
        });
    xtk.clipboard.setText(paths.join("\n"));
}

this.cutItem = function(event) {
    this.copying = false;
    this._selectCurrentItems();
};

this.copyItem = function(event) {
    this.copying = true;
    this._selectCurrentItems();
};

this.pasteIntoItem = function(event) {
    try {
        var this_ = ko.toolbox2;
        var view = this_.manager.view;
        var index = view.selection.currentIndex;
        var parent = view.getTool(index);
        var paths = xtk.clipboard.getText().split("\n");
        var loadedMacroURIs = this.copying ? [] : this._getLoadedMacros(paths);
        view.pasteItemsIntoTarget(index, paths, paths.length, this.copying);
        this._removeLoadedMacros(loadedMacroURIs);
    } catch(ex) {
        ko.dialogs.alert("toolbox2_command.js: Error: Trying to copy paths into the toolbox "
                         + ex);
    }
};

this._getLoadedMacros = function(paths) {
    var view = this.manager.view;
    var clean_macros = [];
    var dirty_macros = [];
    var viewsManager = ko.views.manager;
    for (var i = 0 ;i < paths.length; i++) {
        var path = paths[i];
        var tool = view.getToolFromPath(path);
        if (tool && tool.toolType == 'macro') {
            var url = tool.url;
            var v = viewsManager.getViewForURI(url);
            if (v) {
                if (v.isDirty) {
                    dirty_macros.push(url);
                } else {
                    clean_macros.push(url);
                }
            }
        }
    }
    if (dirty_macros.length) {
        var title = "Save unchanged macros?";
        var prompt = "Some of the macros to move are loaded in the editor with unsaved changes";
        var selectionCondition = "zero-or-more";
        var i = 0;      
        var itemsToSave = ko.dialogs.selectFromList(title, prompt, dirty_macros, selectionCondition);
        for (i = 0; i < itemsToSave.length; i++) {
            var url = itemsToSave[i];
            var v = viewsManager.getViewForURI(url);
            if (v) {
                v.save(true /* skipSccCheck */);
            }
            clean_macros.push(url);
        }
    }
    return clean_macros;
};

this._removeLoadedMacros = function(loadedMacroURIs) {
    loadedMacroURIs.map(function(uri) {
            var v = ko.views.manager.getViewForURI(uri);
            if (v) {
                v.closeUnconditionally();
            }
        });
};

this.showInFileManager = function(itemType) {
    try {
        var view = ko.toolbox2.manager.view;
        var index = view.selection.currentIndex;
        var tool = view.getTool(index);
        var sysUtilsSvc = Components.classes["@activestate.com/koSysUtils;1"].
        getService(Components.interfaces.koISysUtils);
        sysUtilsSvc.ShowFileInFileManager(tool.path);
    } catch(ex) {
        ko.dialogs.alert("toolbox2_command.js: Internal error: Trying to show "
                         + tool.path
                         + " in a file manager window: "
                         + ex);
    }
};

var default_saveToolDirectory = null;

this.saveToolsAs = function(event) {
    try {
        var numFiles, numFolders;
        [numFiles, numFolders] = this.saveToolsAs_aux(event);
        // Who cares about (s) -- it's only a statusbar msg
        var msg = peFolder_bundle.formatStringFromName("copied_X_Files_Y_Folders",
                                 [numFiles,
                                  numFolders], 2);
        ko.statusBar.AddMessage(msg, "editor", 5000, true);
    } catch(ex) {
        alert(ex);
    }
};
this.saveToolsAs_aux = function(event) {
    var this_ = ko.toolbox2;
    var selectedIndices = this_.getSelectedIndices(/*rootsOnly=*/true);
    if (selectedIndices.length == 0) return [0, 0]; // shouldn't happen
    var toolTreeView = this_.manager.view;
    var askForFile = (selectedIndices.length == 1
                      && !toolTreeView.isContainer(selectedIndices[0]));
    var targetPath;
    var osPathSvc = Components.classes["@activestate.com/koOsPath;1"].
                getService(Components.interfaces.koIOsPath);
    var shutil = Components.classes["@activestate.com/koShUtil;1"].
                getService(Components.interfaces.koIShUtil)
    var tool, srcPath;
    var numFiles = 0, numFolders = 0;
    if (askForFile) {
        var title = peFolder_bundle.GetStringFromName("locationToSaveThisItem");
        //todo: handle filters.
        targetPath = ko.filepicker.saveFile(default_saveToolDirectory,
                                            srcPath);
        if (!targetPath) return [0, 0];
        tool = toolTreeView.getTool(selectedIndices[0]);
        srcPath = tool.path;
        default_saveToolDirectory = ko.uriparse.dirName(targetPath);
        // They've already been asked if they want to overwrite
        shutil.copy(srcPath, targetPath);
        numFiles = 1;
    } else {
        var prompt = peFolder_bundle.GetStringFromName("locationToSaveTheseItems");
        targetPath = ko.filepicker.getFolder(default_saveToolDirectory,
                                             prompt);
        if (!targetPath) return [0, 0];
        default_saveToolDirectory = targetPath;
        var overwrites = [];
        var overwritesAreFile = {};
        var i = 0;
        var lim = selectedIndices.length;
        var finalTargetPath;
        while (i < lim) {
            var index = selectedIndices[i];
            var tool = toolTreeView.getTool(index);
            srcPath = tool.path;
            if (toolTreeView.isContainer(index)) {
                finalTargetPath = osPathSvc.join(targetPath,
                                            osPathSvc.basename(srcPath));
                if (osPathSvc.exists(finalTargetPath)) {
                    overwrites.push(srcPath);
                    overwritesAreFile[srcPath] = false;
                } else {
                    toolTreeView.copyLocalFolder(srcPath, targetPath);
                    numFolders += 1;
                }
                // Skip to the next sibling if it's open
            } else {
                finalTargetPath = osPathSvc.join(targetPath,
                                            osPathSvc.basename(srcPath));
                if (osPathSvc.exists(finalTargetPath)) {
                    overwrites.push(srcPath);
                    overwritesAreFile[srcPath] = true;
                } else {
                    shutil.copy(srcPath, finalTargetPath);
                    numFiles += 1;
                }
            }
            i += 1;
        }
        if (overwrites.length) {
            var title = peFolder_bundle.GetStringFromName("overwriteFilesPrompt");
            var prompt = peFolder_bundle.GetStringFromName("selectWhichFilesDirectories");
            var selectionCondition = "zero-or-more";
            var i = 0;      
            var itemsToSave = ko.dialogs.selectFromList(title, prompt, overwrites, selectionCondition);
            if (itemsToSave) {
                itemsToSave.map(function(path) {
                        finalTargetPath = osPathSvc.join(targetPath,
                                                         osPathSvc.basename(path));
                        if (overwritesAreFile[path]) {
                            shutil.copy(path, finalTargetPath);
                            numFiles += 1;
                        } else {
                            toolTreeView.copyLocalFolder(path, targetPath);
                            numFolders += 1;
                        }
                });
            }
        }
    }
    return [numFiles, numFolders];
};

this.exportAsZipFile = function(event) {
    try {
        var title = peFolder_bundle.GetStringFromName("saveItemsToZipFileAs");
        var defaultFilterName = "Zip";
        var fileNames = [defaultFilterName, "All"];
        var targetPath = ko.filepicker.saveFile(default_saveToolDirectory,
                                                null,
                                                title,
                                                defaultFilterName,
                                                fileNames
                                                );
        if (!targetPath) return;
        default_saveToolDirectory = ko.uriparse.dirName(targetPath);
        numFilesZipped = ko.toolbox2.manager.view.zipSelectionToFile(targetPath);
        msg = peFolder_bundle.formatStringFromName("zippedNTools",
                                                   [numFilesZipped], 1);
        ko.statusBar.AddMessage(msg, "toolbox", 5000, true);
    } catch(ex) {
        alert(ex);
    }
};

this.deleteItem = function(event) {
    var question;
    var indices = ko.toolbox2.getSelectedIndices(/*rootsOnly=*/true);
    if (indices.length > 1) {
        question = peFolder_bundle.formatStringFromName("doYouWantToRemoveThe", [indices.length], 1);
    } else {
        question = peFolder_bundle.GetStringFromName("doYouWantToRemoveTheItemYouHaveSelected");
    }
    var response = "No";
    var text = null;
    var title = peFolder_bundle.GetStringFromName("deleteSelectedItems");
    var result = ko.dialogs.yesNo(question, response, text, title);
    //TODO: Add a do-not-ask pref
    if (result != "Yes") {
        return;
    }
    var view = ko.toolbox2.manager.view;
    var i = 0;
    var lim = indices.length;
    while (i < lim) {
        var index = indices[i];
        if (view.get_toolType(index) == 'macro') {
            var tool = view.getTool(index);
            var url = tool.url;
            if (ko.views.manager.getViewForURI(url)) {
                var response = "No";
                var text = null;
                var title = ("Do you want to close the macro "
                             + tool.name
                             + "?");
                var result = ko.dialogs.yesNoCancel(question, response, text, title);
                if (result == "Cancel") {
                    return;
                } else if (result == "No") {
                    // Pull it out of the list
                    indices = indices.splice(i, 1);
                    lim -= 1;
                    i -= 1;
                }
            }
        }
        i++;
    }
    for (i = indices.length - 1; i >= 0; i--) {
        view.deleteToolAt(indices[i]);
    }
    // ko.toolbox2.manager.deleteCurrentItem();
};    

this._invokerNameForToolType = {
 'folder' : this.invoke_folderCommand,
 'command' : this.invoke_runCommand,
 DirectoryShortcut: this.invoke_openDirectoryShortcut,
 macro : this.invoke_executeMacro,
 snippet : this.invoke_insertSnippet,
 template : this.invoke_openTemplate,
 URL : this.invoke_openURLInBrowser,
 __EOD__:null
};

this.onDblClick = function(event) {
    if (event.which != 1) {
        dump("this.onDblClick, leaving as event.which = "
             + event.which
             + "\n");
        return;
    }
    var that = ko.toolbox2;
    var view = that.manager.view;
    var index = view.selection.currentIndex;
    var tool = view.getTool(index);
    if (!tool) {
        return;
    }
    var method = that._invokerNameForToolType[tool.toolType];
    if (method) {
        method.call(that, event, tool);
    } else {
        alert("Don't know what to do with "
              + tool.toolType
              + " "
              + tool.name);
    }
};

this.doStartDrag = function(event, tree) {
    var selectedIndices = this.getSelectedIndices(/*rootsOnly=*/true);
    var view = this.manager.view;
    var paths = selectedIndices.map(function(index) {
            return view.getTool(index).path;
        }).join("\n");
    var dt = event.dataTransfer;
    dt.mozSetDataAt("application/x-moz-file", paths, 0);
    dt.setData('text/plain', paths);
    this._dragSources = paths;
    this._dragIndices = selectedIndices;
    if (event.ctrlKey) {
        dt.effectAllowed = this.originalEffect = "copy";
        this.copying = true;
    } else {
        dt.effectAllowed = this.originalEffect = "move";
        this.copying = false;
    }
};

this._currentRow = function(event, tree) {
    var row = {};
    tree.treeBoxObject.getCellAt(event.pageX, event.pageY, row, {},{});
    return row.value;
};

this._checkDrag = function(event, tree) {
    var inDragSource = this._checkDragSource(event, tree);
    event.dataTransfer.effectAllowed = inDragSource ? this.originalEffect : "none";
    return inDragSource;
};

this._checkDragSource = function(event, tree) {
    if (!this._dragIndices.length) {
        //dump("not dragging anything\n");
        return false;
    }
    var index = this._currentRow(event, tree);
    if (this._dragIndices.indexOf(index) != -1) {
        //dump("can't drag an item to itself\n");
        return false;
    }
    if (!this.manager.view.isContainer(index)) {
        //dump("target isn't an index\n");
        return false;
    }
    var view = this.manager.view;
    var candidateIndex;
    for (var i = this._dragIndices.length - 1; i >= 0; i--) {
        candidateIndex = this._dragIndices[i];
        if (view.getParentIndex(candidateIndex) == index) {
            /*
            dump("can't copy/paste node "
                 + candidateIndex
                 + " to its immediate parent "
                 + index
                 + "\n");
            */
            return false;
        }
        if (view.isAncestor(candidateIndex, index)) {
            /*
            dump("can't copy/paste node "
                 + candidateIndex
                 + " to its descendant "
                 + index
                 + "\n");
            */
            return false;
        }
    }
    return true;
};

this.doDragEnter = function(event, tree) {
    return this._checkDrag(event, this.manager.widgets.tree);
};

this.doDragOver = function(event, tree) {
    return this._checkDrag(event, this.manager.widgets.tree);
};

this.doDrop = function(event, tree) {
    if (!this._dragSources.length) {
        //dump("onDrop: no source indices to drop\n");
        return false;
    }
    var index = this._currentRow(event, this.manager.widgets.tree);
    try {
        var paths = this._dragSources;
        var pathsa = paths.split("\n");
        var loadedMacroURIs = this.copying ? [] : this._getLoadedMacros(pathsa);
        this.manager.view.pasteItemsIntoTarget(index, pathsa, pathsa.length, this.copying);
        if (!this.copying) {
            this._removeLoadedMacros(loadedMacroURIs);
        }
    } catch(ex) {
        ko.dialogs.alert("drag/drop: " + ex);
    }
    this._dragSources = [];
    this._dragIndices = [];
    return true;
};

this.onTreeKeyPress = function(event) {
    try {
        if (event.keyCode == event.DOM_VK_ENTER
            || event.keyCode == event.DOM_VK_RETURN)
        {
            event.cancelBubble = true;
            event.stopPropagation();
            event.preventDefault();
            this.onDblClick(event);
        }
    } catch(ex) {
        dump("onTreeKeyPress: error: " + ex + "\n");
    }
}

}).apply(ko.toolbox2);
