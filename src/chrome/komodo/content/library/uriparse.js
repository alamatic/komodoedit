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

if (typeof(ko)=='undefined') {
    var ko = {};
}


/**
 * Functions to convert/parse strings representing URLs, files, etc.
 *
 * This is basically a loose shim around class URIParser in URIlib.py (somewhat
 * obtusely via koIFileEx).
 *
 * Routines:
 *      ko.uriparse.localPathToURI(<localPath>)
 *      ko.uriparse.pathToURI(<URI or localPath>)
 *      ko.uriparse.URIToLocalPath(<URI or localPath>)
 *      ko.uriparse.displayPath(<localPath or URI>)
 *      ko.uriparse.baseName(<localPath or URI>)
 *      ko.uriparse.dirName(<localPath or URI>)
 *      ko.uriparse.ext(<localPath or URI>)
 *
 * Dev Notes:
 *  - This module caches a single koIFileEx instance to, presumably, speed
 *    things up.
 */
ko.uriparse = {};

(function() {

var _koFileEx = null; // koFileEx singleton instance
var _osPathSvc = Components.classes["@activestate.com/koOsPath;1"].getService(Components.interfaces.koIOsPath);
function _getKoFileEx() {
    if (_koFileEx == null) {
        _koFileEx = Components.classes["@activestate.com/koFileEx;1"]
                             .createInstance(Components.interfaces.koIFileEx);
    }
    _koFileEx.URI = null; // clear the instance data
    return _koFileEx;
}


/**
 * Get the URI representation of the given local file path.
 *
 *  "localPath" must be a local file path.
 *
 * Returns the URI for the given path or raises an exception if "localPath" is
 * not a local path.  Returned URIs are normalized ("x/./y" => "x/y", etc.)
 *
 * Examples:
 *  D:\trentm\foo.txt -> file:///D:/trentm/foo.txt
 *  \\planer\d\trentm\tmp\foo.txt -> file://planer/d/trentm/tmp/foo.txt
 *  file:///D:/trentm/foo.txt -> throws exception
 *  ftp://ftp.activestate.com/ActivePython -> throws exception
 */
this.localPathToURI = function(localPath) {
    var koFileEx = _getKoFileEx();
    koFileEx.path = localPath;
    if (_osPathSvc.normpath(koFileEx.path) != _osPathSvc.normpath(localPath)) {
        // ...then this was not a proper local path (probably a URI)
        throw("'"+localPath+"' does not appear to be a proper local path");
    }
    return this._normalizedPathToURI(localPath, koFileEx);
}

this._normalizedPathToURI = function(localPath, koFileEx) {
    var fixedPath = _osPathSvc.normpath(localPath);
    if (fixedPath != localPath) {
        if (koFileEx.isDirectory) {
            // Bug 77205: Mapped URIs where the local part ends with a slash
            // lose that trailing slash due to normpath.
            var endsWithSlash_re = /([\\\/])$/;
            var trailingSlash = endsWithSlash_re.test(localPath) ? RegExp.$1 : "";
            if (trailingSlash && !endsWithSlash_re.test(fixedPath)) {
                fixedPath += trailingSlash;
            }
            if (fixedPath != localPath) {
                koFileEx.path = fixedPath;
            }
        } else {
            koFileEx.path = fixedPath;
        }
    }
    return koFileEx.URI;
};


/**
 * Was once used to ensure URI's were properly formatted.
 * @deprecated since Komodo 4.2.0
 */
this.fixupURI = function(uri) {
    ko.main.log("DEPRECATED ko.uriparse.fixupURI should not be used");
    return uri;
}

/**
 * Get the URI representation of the given local file path or URI
 *
 *  "path" must be a local file path or a URI
 *
 * Returns the URI for the given path or the URI if one was passed in.
 * Returned URIs are normalized ("x/./y" => "x/y", etc.)
 *
 * Examples:
 *  D:\trentm\foo.txt -> file:///D:/trentm/foo.txt
 *  file:///D:/trentm/foo.txt -> file:///D:/trentm/foo.txt
 *  ftp://ftp.activestate.com/ActivePython -> ftp://ftp.activestate.com/ActivePython
 */
this.pathToURI = function(path) {
    var koFileEx = _getKoFileEx();
    koFileEx.path = path;
    if (koFileEx.scheme != "file" || path.indexOf("file:/") == 0) {
        // Don't give normpath a URI
        return koFileEx.URI;
    }
    // Bug 76156
    // Normalize paths, but don't try to change case.
    // Lookup routines like findViewsForURI and getViewsByTypeAndURI
    // in views.unprocessed.xml need to ignore case when appropriate.
    return this._normalizedPathToURI(path, koFileEx);
}

/**
 * Get the local file path for the given URI.
 *
 *  "uri" may be a URI for a local file or a local path.
 *
 * Returns the local file path or raises an exception if there is no local file
 * representation for that URI. Note: I would rather this explicitly raised if
 * "uri" were a local path, but koIFileEx does not work that way.
 *
 * Examples:
 *  D:\trentm\foo.txt -> D:\trentm\foo.txt
 *  file:///D:/trentm/foo.txt -> D:\trentm\foo.txt
 *  ftp://ftp.activestate.com/ActivePython -> throws exception
 */
this.URIToLocalPath = function(uri) {
    var koFileEx = _getKoFileEx();
    koFileEx.URI = uri;
    if (koFileEx.scheme != "file") {
        throw("'"+uri+"' does not have a local path");
    }
    return koFileEx.path;
}

/**
 * Get an appropriate representation of the given URI for display to the user.
 *
 *  "uri", typically, is a URI, though it can be a local filename as well.
 *
 * Examples:
 *  file:///D:/trentm/foo.txt -> D:\trentm\foo.txt
 *  D:\trentm\foo.txt -> D:\trentm\foo.txt
 *  ftp://ftp.activestate.com/ActivePython -> ftp://ftp.activestate.com/ActivePython
 */
this.displayPath = function(uri) {
    var koFileEx = _getKoFileEx();
    koFileEx.URI = uri;
    return koFileEx.displayPath;
}

/**
 * Get the basename (a.k.a. leafName) of the given file.
 *
 *  "file" can be a local filename or URI.
 *
 * Examples:
 *  file:///D:/trentm/foo.txt -> foo.txt
 *  D:\trentm\foo.txt -> foo.txt
 *  ftp://ftp.activestate.com/ActivePython -> ActivePython
 */
this.baseName = function(file) {
    var koFileEx = _getKoFileEx();
    koFileEx.URI = file;
    return koFileEx.baseName;
}

/**
 * Get the dirname of the given file.
 *
 *  "file" can be a local filename or URI referring to a local file.
 *
 * Examples:
 *  file:///D:/trentm/foo.txt -> D:\trentm
 *  D:\trentm\foo.txt -> D:\trentm
 *  ftp://ftp.activestate.com/ActivePython -> throws exception
 */
this.dirName = function(file) {
    var koFileEx = _getKoFileEx();
    koFileEx.URI = file;
    if (koFileEx.scheme != "file") {
        throw("'"+file+"' does not have a local dir name");
    }
    return koFileEx.dirName;
}

/**
 * Get the extension of the given file.
 *
 *  "file" can be a local filename or URI
 */
this.ext = function(file) {
    var koFileEx = _getKoFileEx();
    koFileEx.URI = file;
    return koFileEx.ext;
}

 /**
 * Return the common URI prefix of the given list of URIs.
 *
 * @param uris {array}
 * @returns string
 */
this.commonURIPrefixFromURIs = function(uris) {
    if (!uris) {
        return "";
    }
    var commonprefix = uris[0];
    var commonsplit = commonprefix.split("/");
    var j;
    /**
     * @type string
     */
    var uri;
    var urisplit;
    for (var i=1; i < uris.length; i++) {
        uri = uris[i];
        var urisplit = uri.split("/");
        for (j=0; j < urisplit.length && j < commonprefix.length; j++) {
            if (urisplit[j] != commonsplit[j])
                break;
        }
        if (j < commonprefix.length) {
            commonsplit = commonsplit.slice(0, j);
            commonprefix = commonsplit.join("/");
        }
    }
    return commonprefix;
}

/**
 * Uses the supplied URI to check if there are any special mappings setup
 * in order to change this URI into another location. If there is a match,
 * return the new URI, else return the original URI.
 * 
 * @param uri {string}  The URI to check.
 * @param prefs {Components.interfaces.koIPreferenceSet}
 *        Optional. The preference set to check against.
 * @returns {string}  The mapped URI or the original if there was no match.
 */
this.getMappedURI = function(uri, prefs)
{
    // XXX project prefs....
    if (!prefs) {
	prefs = Components.classes["@activestate.com/koPrefService;1"].
                    getService(Components.interfaces.koIPrefService).effectivePrefs;
    }
    var mapping = null;
    if (prefs.hasPrefHere('mappedPaths'))
        mapping = prefs.getStringPref('mappedPaths');
    if (!mapping) {
	// try all pref layers for a match
	if (prefs.parent) {
	    return ko.uriparse.getMappedURI(uri, prefs.parent);
	}
	return uri;
    }
    var paths = mapping.split('::');
    var mappeduri = '', mappedpath = '';
    // we have to look at all the paths, since we could have subdirs mapped
    // to different locations as well.
    // eg.
    // http://test/a/ -> /test/a
    // http://test/a/b -> /test/b
    for (var i = 0; i < paths.length; i++) {
        var data = paths[i].split('##');
        if (uri.indexOf(data[0]) == 0) {
            if (data[0].length > mappeduri.length) {
                mappeduri = data[0];
                mappedpath = data[1];
            }
        }
    }
    if (!mappedpath) {
	// this layer had mappings, but none matched, look at parent prefs
	if (prefs.parent)
	    return ko.uriparse.getMappedURI(uri, prefs.parent);
        return uri;
    }
    // now we need a URI of the mappedpath
    var newpath = mappedpath + uri.slice(mappeduri.length);
    return ko.uriparse.pathToURI(newpath);
}

/**
 * Show the dialog for creating a new mapped URI with the supplied uri and
 * path arguments.
 * 
 * @param uri {string}  The URI to add a mapping for.
 * @param path {string}  The path the URI will be mapped to.
 * @returns {boolean}  Returns true if a URI mapping was made, false if not.
 */
this.addMappedURI = function(uri, path)
{
    if (typeof(path) == 'undefined') path=null;
    var info = {
	uri: uri,
	path: path,
        project: "false",
        project_name: null
    };
    if (ko.projects.manager.currentProject) {
        info.project_name = ko.projects.manager.currentProject.name;
    }
    window.openDialog('chrome://komodo/content/dialogs/editPathMap.xul', '_blank', 'chrome,modal,titlebar,resizable,centerscreen', info);
    if (!info.uri || !info.path) return false;
    // add this to the uri mapping
    var prefSvc = Components.classes["@activestate.com/koPrefService;1"].
		getService(Components.interfaces.koIPrefService);
    var prefs = prefSvc.prefs;
    if (info.project == "true" && ko.projects.manager.currentProject) {
        prefs = ko.projects.manager.currentProject.prefset;
    }
    var mapping = prefs.getStringPref('mappedPaths');
    mapping = mapping + "::" + info.uri + "##" + info.path;
    prefs.setStringPref('mappedPaths', mapping);
    return true;
}

/**
 * This is a reverse of getMappedURI. Return a unmapped URI if there is a
 * pref setup to match the given path, else return whatever was passed in.
 * Note: If a mapping existed, the return result is *always* a URI.
 * 
 * @param path {string}  The path or URI to check for uri mappings.
 * @param prefs {Components.interfaces.koIPreferenceSet}
 *        Optional. The preference set to check against.
 * @returns {string}  The unmapped URI or the original path when
 *                    there was no match.
 */
this.getMappedPath = function(path, prefs)
{
    // XXX project prefs....
    if (!prefs) {
	prefs = Components.classes["@activestate.com/koPrefService;1"].
                    getService(Components.interfaces.koIPrefService).effectivePrefs;
    }
    var mapping = null;
    if (prefs.hasPrefHere('mappedPaths'))
        mapping = prefs.getStringPref('mappedPaths');
    if (!mapping) {
	// try all pref layers for a match
	if (prefs.parent) {
	    return ko.uriparse.getMappedPath(path, prefs.parent);
	}
	return path;
    }
    var paths = mapping.split('::');
    var mappeduri = '', mappedpath = '';
    // we have to look at all the paths, since we could have subdirs mapped
    // to different locations as well.
    // eg.
    // http://test/a/ -> /test/a
    // http://test/a/b -> /test/b

    // The path must be in a URI format to work correctly with Komodo's
    // stored mapped URI preferences.
    var uri = ko.uriparse.pathToURI(path);

    for (var i = 0; i < paths.length; i++) {
        var data = paths[i].split('##');
        if (data.length < 2) {
            // Invalid mapped path data.
            continue;
        }
        if (uri.indexOf(data[1]) == 0) {
            if (data[1].length > mappedpath.length) {
                mappeduri = data[0];
                mappedpath = data[1];
            }
        }
    }
    if (!mappeduri) {
	// this layer had mappings, but none matched, look at parent prefs
	if (prefs.parent)
	    return ko.uriparse.getMappedPath(path, prefs.parent);
        return path;
    }
    // now we need a URI of the mappedpath
    return mappeduri + uri.slice(mappedpath.length);
}
}).apply(ko.uriparse);


// backwards compatibility API
var uriparse_addMappedURI = ko.uriparse.addMappedURI;
var uriparse_getMappedURI = ko.uriparse.getMappedURI;
var uriparse_localPathToURI = ko.uriparse.localPathToURI;
var uriparse_pathToURI = ko.uriparse.pathToURI;
var uriparse_URIToLocalPath = ko.uriparse.URIToLocalPath;
var uriparse_displayPath = ko.uriparse.displayPath;
var uriparse_baseName = ko.uriparse.baseName;
var uriparse_dirName = ko.uriparse.dirName;
var uriparse_ext = ko.uriparse.ext;
var uriparse_fixupURI = ko.uriparse.fixupURI;
