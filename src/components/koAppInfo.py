#!/usr/bin/env python
# ***** BEGIN LICENSE BLOCK *****
# Version: MPL 1.1/GPL 2.0/LGPL 2.1
# 
# The contents of this file are subject to the Mozilla Public License
# Version 1.1 (the "License"); you may not use this file except in
# compliance with the License. You may obtain a copy of the License at
# http://www.mozilla.org/MPL/
# 
# Software distributed under the License is distributed on an "AS IS"
# basis, WITHOUT WARRANTY OF ANY KIND, either express or implied. See the
# License for the specific language governing rights and limitations
# under the License.
# 
# The Original Code is Komodo code.
# 
# The Initial Developer of the Original Code is ActiveState Software Inc.
# Portions created by ActiveState Software Inc are Copyright (C) 2000-2007
# ActiveState Software Inc. All Rights Reserved.
# 
# Contributor(s):
#   ActiveState Software Inc
# 
# Alternatively, the contents of this file may be used under the terms of
# either the GNU General Public License Version 2 or later (the "GPL"), or
# the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
# in which case the provisions of the GPL or the LGPL are applicable instead
# of those above. If you wish to allow use of your version of this file only
# under the terms of either the GPL or the LGPL, and not to allow others to
# use your version of this file under the terms of the MPL, indicate your
# decision by deleting the provisions above and replace them with the notice
# and other provisions required by the GPL or the LGPL. If you do not delete
# the provisions above, a recipient may use your version of this file under
# the terms of any one of the MPL, the GPL or the LGPL.
# 
# ***** END LICENSE BLOCK *****

import sys, os, re, string
import tempfile
from xpcom import components, ServerException, COMException, nsError
from xpcom._xpcom import PROXY_SYNC, PROXY_ALWAYS, PROXY_ASYNC, getProxyForObject
from xpcom.server import WrapObject, UnwrapObject

import process
import koprocessutils
import which
import logging

log = logging.getLogger('koAppInfo')

#---- components
class KoAppInfoEx:
    def __init__(self):
        self.installationPath = ''
        self.executablePath = ''
        self.haveLicense = 0
        self.buildNumber = 0
        self.localHelpFile = ''
        self.webHelpURL = ''
        self._configPath = ''
        self.installed = 0

        self._prefSvc = components.classes["@activestate.com/koPrefService;1"].\
            getService(components.interfaces.koIPrefService)
        self.prefService = getProxyForObject(1,
            components.interfaces.koIPrefService, self._prefSvc,
            PROXY_ALWAYS | PROXY_SYNC)

        
    def FindInstallationPaths(self):
        return []
    
    def getInstallationPathFromBinary(self, binaryPath):
        return ''
    
    def set_installationPath(self, path):
        self.installationPath = path
        self.executablePath = ''
    
    # pulled over from koIInterpreterLanguageService for BC
    def get_interpreterPath(self):
        return self.get_executablePath()
    
    # pulled over from koIInterpreterLanguageService for BC
    def get_includePath(self):
        return self._configPath

    def get_executable_from_doc_pref(self, koDoc, prefName):
        prefset = koDoc.getEffectivePrefs()
        if prefset.hasPref(prefName):
            interpPath = prefset.getStringPref(prefName)
            if interpPath and os.path.exists(interpPath):
                return interpPath
        return self.get_executablePath()

class KoPerlInfoEx(KoAppInfoEx):
    _com_interfaces_ = [components.interfaces.koIPerlInfoEx,
                        components.interfaces.nsIObserver]
    _reg_clsid_ = "adb73505-eed5-46c5-8425-ce0bd8a5ec47"
    _reg_contractid_ = "@activestate.com/koAppInfoEx?app=Perl;1"
    _reg_desc_ = "Extended Perl Information"
    
    def __init__(self):
        KoAppInfoEx.__init__(self)
        self._userPath = koprocessutils.getUserEnv()["PATH"].split(os.pathsep)
        self._havePerlCritic = None
        self._perlCriticVersion = None
        try:
            self._prefSvc.prefs.prefObserverService.addObserver(self, "perlDefaultInterpreter", 0)
        except Exception, e:
            print e

    def observe(self, subject, topic, data):
        if topic == "perlDefaultInterpreter":
            self.installationPath = None
            self._havePerlCritic = None
            self._perlCriticVersion = None

    def _GetPerlExeName(self):
        if not self.installationPath:
            perlExe = self.prefService.prefs.getStringPref("perlDefaultInterpreter")
            if perlExe: return perlExe
            paths = self.FindInstallationPaths()
            if paths:
                self.installationPath = paths[0]
            else:
                return None

        if sys.platform.startswith("win"):
            return os.path.join(self.installationPath, "bin", "perl.exe")
        else:
            return os.path.join(self.installationPath, "bin", "perl")

    # koIAppInfoEx routines
    def FindInstallationPaths(self):
        if sys.platform.startswith('win'):
            exts = ['.exe']
        else:
            exts = None
        perlExes = which.whichall("perl", exts=exts, path=self._userPath)
        perlInstallationPaths = [self.getInstallationPathFromBinary(p)\
                                 for p in perlExes]
        return perlInstallationPaths

    def getInstallationPathFromBinary(self, binaryPath):
        return os.path.dirname(os.path.dirname(binaryPath))

    def get_executablePath(self):
        return self._GetPerlExeName()

    def getExecutableFromDocument(self, koDoc):
        return self.get_executable_from_doc_pref(koDoc,
                                                 'perlDefaultInterpreter')

    def get_haveLicense(self):
        return 1

    def getVersionForBinary(self, perlExe):
        if not os.path.exists(perlExe):
            raise ServerException(nsError.NS_ERROR_FILE_NOT_FOUND)
        argv = [perlExe, "-v"]
        p = process.ProcessOpen(argv, stdin=None)
        perlVersionDump, stderr = p.communicate()
        # Old perls look like: This is perl, version 5.005_03 built for MSWin32-x86-object
        # New perls look like: This is perl, v5.6.1 built for MSWin32-x86-multi-thread
        patterns = ["This is perl, v(?:ersion )?([0-9._]+)",
                    "This is perl \d+, version \d+, subversion \d+ \(v([0-9._]+)\)",
                    ]
        for ptn in patterns:
            perlVersionMatch = re.search(ptn, perlVersionDump)
            if perlVersionMatch:
                return perlVersionMatch.group(1)
        return ''
        
    def get_version(self):
        perlExe = self._GetPerlExeName()
        return self.getVersionForBinary(perlExe)

    def get_buildNumber(self):
        argv = [self.get_executablePath(), "-v"]
        p = process.ProcessOpen(argv, stdin=None)
        versionDump, stderr = p.communicate()
        pattern = re.compile("Binary build (\d+(\.\d+)?)( \[\d+\])? provided by ActiveState")
        match = pattern.search(versionDump)
        if match:
            return int(match.group(1))
        else:
            # This is likely not an ActivePerl installation.
            raise ServerException(nsError.NS_ERROR_UNEXPECTED)
 
    def get_localHelpFile(self):
        """Return a path to a launchable local help file, else return None.
        If there is an html/index.html in the install directory found
        via `which perl`. An *Active*Perl installation could be found via the
        registry on Windows (see get_installed()) since this is the only type
        of Perl installation likely to have the html/index.html subfile.
        However the current suffices.
        """
        perlExe = self._GetPerlExeName()
        if perlExe:
            indexHtml = os.path.join(os.path.dirname(perlExe),
                                     "..", "html", "index.html")
            if os.path.isfile(indexHtml):
                return indexHtml
        return None

    def get_webHelpURL(self):
        """Return a web URL for help on this app, else return None."""
        return "http://docs.activestate.com/activeperl/"
    
    # koIPerlInfoEx routines
    def getExtraPaths(self):
        if not self.prefService.effectivePrefs.hasPref("perlExtraPaths"):
            return []
        perlExtraPaths = self.prefService.effectivePrefs.getStringPref("perlExtraPaths")
        if not perlExtraPaths:
            return []
        if sys.platform.startswith("win"):
            perlExtraPaths = string.replace(perlExtraPaths, '\\', '/')
        perlExtraPaths = [x.strip() for x in perlExtraPaths.split(os.pathsep)]
        return [x for x in perlExtraPaths if x]

    def haveModules(self, modules):
        perlExe = self.get_executablePath()
        if not perlExe:
            return False
        argv = [perlExe] \
               + ["-I" + path for path in self.getExtraPaths()] \
               + ["-M" + mod for mod in modules] \
               + ["-e1"]
        p = process.ProcessOpen(argv, stdin=None)
        stdout, stderr = p.communicate()
        retval = p.wait()
        if retval: # if returns non-zero, then don't have that module
            return 0
        else:
            return 1

    def isPerlCriticInstalled(self, forceCheck=False):
        if self._havePerlCritic is None or forceCheck:
            self._havePerlCritic = bool(self.haveModules(["criticism", "Perl::Critic"]))
        return self._havePerlCritic

    def getPerlCriticVersion(self):
        if self._perlCriticVersion is not None or not self.isPerlCriticInstalled():
            return self._perlCriticVersion
        perlExe = self.get_executablePath()
        argv = [perlExe, "-MPerl::Critic", '-e', 'print $Perl::Critic::VERSION']
        p = process.ProcessOpen(argv, stdin=None)
        stdout, stderr = p.communicate()
        retval = p.wait()
        m = re.compile(r'^(\d+(?:\.\d*)?)').match(stdout)
        if m:
            self._perlCriticVersion = float(m.group(1))
        else:
            log.error("Can't find a version # in %s", stdout)
        return self._perlCriticVersion
        
        

class KoPythonCommonInfoEx(KoAppInfoEx):
    def __init__(self):
        KoAppInfoEx.__init__(self)
        self.koInfoService = components.classes["@activestate.com/koInfoService;1"].getService();
        self._userPath = koprocessutils.getUserEnv()["PATH"].split(os.pathsep)
        try:
            self._prefSvc.prefs.prefObserverService.addObserver(self, self.defaultInterpreterPrefName, 0)
        except Exception, e:
            print e

    def observe(self, subject, topic, data):
        if topic == self.defaultInterpreterPrefName:
            self.installationPath = None
        
    def _GetPythonExeName(self):
        if not self.installationPath:
            pythonExe = self.prefService.prefs.getStringPref(self.defaultInterpreterPrefName)
            if pythonExe: return pythonExe
            paths = self.FindInstallationPaths()
            if paths:
                self.installationPath = paths[0]
            else:
                return None
        assert self.installationPath is not None

        if sys.platform.startswith("win"):
            return os.path.join(self.installationPath, "%s.exe" % (self.languageName_lc,))
        else:
           return os.path.join(self.installationPath, "bin", self.languageName_lc)

    # koIAppInfoEx routines
    def FindInstallationPaths(self):
        if sys.platform.startswith('win'):
            exts = ['.exe']
        else:
            exts = None
        pythonExes = which.whichall(self.languageName_lc, exts=exts,
                                    path=self._userPath)
        pythonInstallationPaths = [self.getInstallationPathFromBinary(p)\
                                   for p in pythonExes]
        return pythonInstallationPaths

    def getInstallationPathFromBinary(self, binaryPath):
        if sys.platform.startswith("win"):
            return os.path.dirname(binaryPath)
        else:
            return os.path.dirname(os.path.dirname(binaryPath))

    def set_executablePath(self, path):
        self.executablePath = path

    def get_executablePath(self):
        if self.executablePath:
            return self.executablePath
        return self._GetPythonExeName()

    def getExecutableFromDocument(self, koDoc):
        return self.get_executable_from_doc_pref(koDoc,
                                                 self.defaultInterpreterPrefName)

    def get_haveLicense(self):
        return 1

    def get_version(self):
        """Get the $major.$minor version (as a string) of the current
        Python executable. Returns the empty string if cannot determine
        version.
        
        Dev Notes:
        - Specify cwd to avoid accidentally running in a dir with a
          conflicting Python DLL.
        """
        version = ""

        pythonExe = self.get_executablePath()
        if pythonExe is None:
            return version
        cwd = os.path.dirname(pythonExe)
        env = koprocessutils.getUserEnv()

        argv = [pythonExe, "-c", "import sys; sys.stdout.write(sys.version)"]
        p = process.ProcessOpen(argv, cwd=cwd, env=env, stdin=None)
        stdout, stderr = p.communicate()
        if not p.returncode:
            # Some example output:
            #   2.0 (#8, Mar  7 2001, 16:04:37) [MSC 32 bit (Intel)]
            #   2.5.2 (r252:60911, Mar 27 2008, 17:57:18) [MSC v.1310 32 bit (Intel)]
            #   2.6rc2 (r26rc2:66504, Sep 26 2008, 15:20:44) [MSC v.1500 32 bit (Intel)]
            version_re = re.compile("^(\d+\.\d+)")
            match = version_re.match(stdout)
            if match:
                version = match.group(1)

        return version

    def get_localHelpFile(self):
        """Return a path to a launchable local help file, else return None.
        Windows:
            If there is a
            'HKLM/Software/Python/PythonCore/<major>.<minor>/Help/Main Python Documentation'
            and if the identified file exists.
        Linux/Solaris:
            If there is an html/index.html in the install directory found
            via `which python`.
        """
        if sys.platform.startswith("win"):
            import _winreg
            preferred_version = self.get_version()
            preferred_result = None
            # Versions will be a list of (version, regkey)
            versions = []
            for regkey in ("SOFTWARE\\Python\\PythonCore",
                           "SOFTWARE\\Wow6432Node\\Python\\PythonCore"):
                try:
                    pythonCoreKey = _winreg.OpenKey(_winreg.HKEY_LOCAL_MACHINE,
                                                    "SOFTWARE\\Python\\PythonCore")
                except EnvironmentError:
                    continue
                # get a list of each installed version 
                index = 0
                while 1:
                    try:
                        version = _winreg.EnumKey(pythonCoreKey, index)
                        versions.append((version, regkey))
                        if version == preferred_version:
                            preferred_result = (version, regkey)
                    except EnvironmentError:
                        break
                    index += 1
            if not versions:
                return None
            # try to find a existing help file (prefering the latest
            # installed version)
            versions.sort()
            if preferred_result:
                # Ensure the ensure's selected Python version is the last one,
                # bug 88547.
                versions.append(preferred_result)
            versions.reverse()
            for version, regkey in versions:
                try:
                    helpFileKey = _winreg.OpenKey(_winreg.HKEY_LOCAL_MACHINE,
                        "%s\\%s\\Help\\Main Python Documentation" %
                        (regkey, version))
                    helpFile, keyType = _winreg.QueryValueEx(helpFileKey, "")
                    if os.path.isfile(helpFile):
                        return helpFile
                except EnvironmentError:
                    pass
            return None
        else:
            try:
                pythonExe = which.which(self.languageName_lc, path=self._userPath)
            except which.WhichError:
                return None
            indexHtml = os.path.join(os.path.dirname(pythonExe),
                                     "..", "html", "index.html")
            if os.path.isfile(indexHtml):
                return indexHtml
            else:
                return None

    def get_webHelpURL(self):
        """Return a web URL for help on this app, else return None."""
        return "http://docs.activestate.com/activepython/"

    def haveModules(self, modules):
        argv = [self.get_executablePath(), '-c',
                ' '.join(['import ' + str(mod) + ';' for mod in modules])]
        env = koprocessutils.getUserEnv()
        p = process.ProcessOpen(argv, env=env, stdin=None)
        retval = p.wait()
        return not retval

class KoPythonInfoEx(KoPythonCommonInfoEx):
    _com_interfaces_ = [components.interfaces.koIAppInfoEx,
                        components.interfaces.nsIObserver]
    _reg_clsid_ = "{b76bc2ee-261e-4597-b1ef-446e9bb89d7c}"
    _reg_contractid_ = "@activestate.com/koAppInfoEx?app=Python;1"
    _reg_desc_ = "Extended Python Information"
    languageName_lc = "python"
    defaultInterpreterPrefName = "pythonDefaultInterpreter"
    def __init__(self):
        KoPythonCommonInfoEx.__init__(self)

class KoPython3InfoEx(KoPythonCommonInfoEx):
    _com_interfaces_ = [components.interfaces.koIAppInfoEx,
                        components.interfaces.nsIObserver]
    _reg_clsid_ = "{e98c16e6-0b9f-4f11-8505-5012555a19b2}"
    _reg_contractid_ = "@activestate.com/koAppInfoEx?app=Python3;1"
    _reg_desc_ = "Extended Python3 Information"
    languageName_lc = "python3"
    defaultInterpreterPrefName = "python3DefaultInterpreter"
    def __init__(self):
        KoPythonCommonInfoEx.__init__(self)

    def get_webHelpURL(self):
        """Return a web URL for help on this app, else return None."""
        return "http://docs.activestate.com/activepython/3.1/"

#---- components

class KoRubyInfoEx(KoAppInfoEx):
    _com_interfaces_ = [components.interfaces.koIAppInfoEx,
                        components.interfaces.koIRubyInfoEx,
                        components.interfaces.nsIObserver]
    _reg_clsid_ = "{e1ce6f0d-839e-480a-b131-36de0dc35965}"
    _reg_contractid_ = "@activestate.com/koAppInfoEx?app=Ruby;1"
    _reg_desc_ = "Extended Ruby Information"

    def __init__(self):
        KoAppInfoEx.__init__(self)
        self._userPath = koprocessutils.getUserEnv()["PATH"].split(os.pathsep)
        self._executables = []
        self._digits_re = re.compile(r'(\d+)')
        try:
            self._prefSvc.prefs.prefObserverService.addObserver(self, "rubyDefaultInterpreter", 0)
        except Exception, e:
            print e

    def observe(self, subject, topic, data):
        if topic == "rubyDefaultInterpreter":
            self.installationPath = None
        
    def _GetRubyExeName(self):
        if not self.installationPath:
            rubyExe = self.prefService.prefs.getStringPref("rubyDefaultInterpreter")
            if rubyExe:
                return rubyExe
            paths = self.FindInstallationPaths()
            if paths:
                path = paths[0]
            else:
                return None
        else:
            path = self.installationPath
            paths = None
        if sys.platform.startswith("win"):
            res = os.path.join(path, "bin", "ruby.exe")
        else:
            res = os.path.join(path, "bin", "ruby")
        if paths is not None:
            self.set_executablePath(res)
        return res

    def getInstallationPathFromBinary(self, binaryPath):
        return os.path.dirname(os.path.dirname(binaryPath))

    def get_executablePath(self):
        rubyExePath = self._GetRubyExeName()
        if not rubyExePath:
            # which("non-existent-app) can return empty string, map it to None
            return None
        if not os.path.exists(rubyExePath):
            log.info("KoRubyInfoEx:get_executablePath: file %r doesn't exist",
                     rubyExePath)
            return None
        return rubyExePath
    
    def getExecutableFromDocument(self, koDoc):
        return self.get_executable_from_doc_pref(koDoc,
                                                 'rubyDefaultInterpreter')

    def set_executablePath(self, path):
        self.installationPath = os.path.dirname(os.path.dirname(path))

    def get_haveLicense(self):
        return 1

    def getVersionForBinary(self, rubyExe):
        if not os.path.exists(rubyExe):
            raise ServerException(nsError.NS_ERROR_FILE_NOT_FOUND)
        argv = [rubyExe, "-v"]
        p = process.ProcessOpen(argv, stdin=None)
        rubyVersionDump, stderr = p.communicate()
        pattern = re.compile("ruby ([\w\.]+) ")
        match = pattern.search(rubyVersionDump)
        if match:
            return match.group(1)
        else:
            msg = "Can't find a version in `%s -v` output of '%s'/'%s'" % (rubyExe, rubyVersionDump, stderr)
            raise ServerException(nsError.NS_ERROR_UNEXPECTED, msg)
    
    def get_version(self):
        rubyExe = self._GetRubyExeName()
        return self.getVersionForBinary(rubyExe)
        
    def _get_version_num_parts(self, ver):
        """Allow experimental versions like '1.8.8a'.
        Assume that every version has exactly three parts.
        """
        parts = ver.split('.')
        if len(parts) != 3:
            raise AttributeError("Version %r doesn't have exactly 3 parts" % (ver,))
        return [int(self._digits_re.match(part).group(1)) for part in parts]

    def get_valid_version(self):
        rubyExe = self._GetRubyExeName()
        if not rubyExe:
            return False
        try:
            ver = self.getVersionForBinary(rubyExe)
            versionParts = self._get_version_num_parts(ver)
            return tuple(versionParts) >= (1,8,4) # minimum version
        except AttributeError:
            return False
        except ServerException, ex:
            if ex.errno != nsError.NS_ERROR_FILE_NOT_FOUND:
                raise
            return False

    def get_buildNumber(self):
        raise ServerException(nsError.NS_ERROR_NOT_IMPLEMENTED)
 
    def get_localHelpFile(self):
        #XXX Return rdoc or something
        return None

    def get_webHelpURL(self):
        """Return a web URL for help on this app, else return None."""
        return "http://www.ruby-doc.org/"

    def FindInstallationPaths(self):
        if sys.platform.startswith('win'):
            exts = ['.exe']
        else:
            exts = None
        self._executables = []
        installationPaths = None
        self._executables = which.whichall('ruby', exts=exts, path=self._userPath)
        if not self._executables:
            current_ruby_path = self.prefService.prefs.getStringPref("rubyDefaultInterpreter")
            if current_ruby_path:
                self._executables = [current_ruby_path]
        if self._executables:
            installationPaths = [self.getInstallationPathFromBinary(p)\
                                   for p in self._executables]
        return installationPaths

    def FindInstallationExecutables(self):
        if not self._executables:
            self.FindInstallationPaths()
        return self._executables

    def set_installationPath(self, path):
        self.installationPath = path
        self.executablePath = ''


class KoTclInfoEx(KoAppInfoEx):
    _com_interfaces_ = [components.interfaces.koITclInfoEx,
                        components.interfaces.nsIObserver]
    _reg_clsid_ = "DF64A66F-FD69-4F5E-92B2-B3C9F8638F66"
    _reg_contractid_ = "@activestate.com/koAppInfoEx?app=Tcl;1"
    _reg_desc_ = "Extended Tcl Information"

    def __init__(self):
        KoAppInfoEx.__init__(self)
        self._userPath = koprocessutils.getUserEnv()["PATH"].split(os.pathsep)
        try:
            self._prefSvc.prefs.prefObserverService.addObserver(self, "tclshDefaultInterpreter", 0)
        except Exception, e:
            print e

    def observe(self, subject, topic, data):
        if topic == "tclshDefaultInterpreter":
            self.installationPath = None

    def get_executablePath(self):
        # XXX invoke interpreters has logic for using wish, do we need
        # it here also?
        if not self.installationPath:
            tclExe = self.prefService.prefs.\
                     getStringPref("tclshDefaultInterpreter")
            if tclExe: return tclExe
            paths = self.FindInstallationPaths()
            if not paths:
                return None
            self.installationPath = paths[0]
        assert self.installationPath is not None

        if sys.platform.startswith("win"):
            return os.path.join(self.installationPath, "tclsh.exe")
        else:
           return os.path.join(self.installationPath, "bin", "tclsh")
    
    def getExecutableFromDocument(self, koDoc):
        return self.get_executable_from_doc_pref(koDoc,
                                                 'tclshDefaultInterpreter')

    def _getTclshExeName(self):
        if sys.platform.startswith('win'):
            return 'tclsh.exe'
        else:
            return 'tclsh'

    def _getWishExeName(self):
        if sys.platform.startswith('win'):
            return 'wish.exe'
        else:
            return 'wish'

    # koIAppInfoEx routines
    def FindInstallationPaths(self):
        if sys.platform.startswith('win'):
            exts = ['.exe']
        else:
            exts = None
        tclshs = which.whichall("tclsh", exts=exts, path=self._userPath)
        installPaths = [self.getInstallationPathFromBinary(tclsh)\
                        for tclsh in tclshs]
        uniqueInstallPaths = {}
        for installPath in installPaths:
            uniqueInstallPaths[installPath] = 1
        installPaths = uniqueInstallPaths.keys()
        installPaths.sort()
        return installPaths

    def _isInstallationLicensed(self, installationPath):
        return 1
    
    def get_haveLicense(self):
        return self._isInstallationLicensed(self.installationPath)

    def get_version(self):
        raise ServerException(nsError.NS_ERROR_NOT_IMPLEMENTED)
 
    def get_buildNumber(self):
        raise ServerException(nsError.NS_ERROR_NOT_IMPLEMENTED)
 
    def get_localHelpFile(self):
        """Return a path to a launchable local help file, else return None.
        Windows:
            If there is a 'HKLM\Software\ActiveState\ActiveTcl\<CurVer>\Help'
            and if the identified file exists.
        Linux/Solaris:
            Nada. Just man files, which I don't consider "launchable" in a
            browser context. XXX Perhaps they *are* in Nautilus? 
        """
        if sys.platform.startswith("win"):
            import _winreg
            # get the base ActiveTcl registry key
            try:
                activeTclKey = _winreg.OpenKey(_winreg.HKEY_LOCAL_MACHINE,
                                               "SOFTWARE\\ActiveState\\ActiveTcl")
            except EnvironmentError:
                return None
            # get a list of each installed version 
            versions = []
            index = 0
            while 1:
                try:
                    versions.append(_winreg.EnumKey(activeTclKey, index))
                except EnvironmentError:
                    break
                index += 1
            # try to find a existing help file (prefering the latest
            # installed version)
            versions.sort()
            versions.reverse()
            for version in versions:
                try:
                    helpFileKey = _winreg.OpenKey(_winreg.HKEY_LOCAL_MACHINE,
                        "SOFTWARE\\ActiveState\\ActiveTcl\\%s\\Help" % version)
                    helpFile, keyType = _winreg.QueryValueEx(helpFileKey, "")
                    if os.path.isfile(helpFile):
                        return helpFile
                except EnvironmentError:
                    pass
        return None

    def get_webHelpURL(self):
        return "http://docs.activestate.com/activetcl/"

    def getInstallationPathFromBinary(self, binaryPath):
        return os.path.dirname(os.path.dirname(binaryPath))

    def selectDefault(self):
        paths = self.FindInstallationPaths()
        
        for installationPath in paths: 
            if self._isInstallationLicensed(installationPath):
                self.installationPath = installationPath
                return 1
        
        # Otherwise use whatever is left
        if paths:
            self.installationPath = paths[0]
            return 1
        else:
            self.installationPath = None
            return 0
            
    def get_tclsh_path(self):
        exe = self.prefService.prefs.getStringPref("tclshDefaultInterpreter")
        if exe and os.path.exists(exe):
            return exe
        if not self.installationPath and not self.selectDefault():
            return None
        exe = os.path.join(self.installationPath, "bin",
                            self._getTclshExeName())
        if exe and os.path.exists(exe):
            return exe
        return None
        
    def get_wish_path(self):
        exe = self.prefService.prefs.getStringPref("wishDefaultInterpreter")
        if exe and os.path.exists(exe):
            return exe
        if not self.installationPath and not self.selectDefault():
            return None
        exe = os.path.join(self.installationPath, "bin",
                            self._getWishExeName())
        if exe and os.path.exists(exe):
            return exe
        return None

class KoPHPInfoInstance(KoAppInfoEx):
    _com_interfaces_ = [components.interfaces.koIPHPInfoEx,
                        components.interfaces.nsIObserver]
    _reg_clsid_ = "E2066A3A-FC6D-4157-961E-E03C020594BE"
    _reg_contractid_ = "@activestate.com/koPHPInfoInstance;1"
    _reg_desc_ = "PHP Information"

    # the purpose of KoPHPInfoInstance is to be able to define
    # what executable and ini path are used without prefs getting
    # in the way.  If you want to use prefs, use koPHPInfoEx.
    def __init__(self):
        KoAppInfoEx.__init__(self)
        self._executable = None
        self._info = {}
        self._userPath = koprocessutils.getUserEnv()["PATH"].split(os.pathsep)
        try:
            prefObserverService = self._prefSvc.prefs.prefObserverService
            prefObserverService.addObserverForTopics(self,
                                                     ["phpDefaultInterpreter",
                                                      "phpConfigFile"],
                                                     0)
        except Exception, e:
            print e

    def observe(self, subject, topic, data):
        if topic in ["phpDefaultInterpreter", "phpConfigFile"]:
            self.installationPath = None
            self._info = {}

    def _findPHP(self):
        if not self.installationPath:
            paths = self.FindInstallationPaths()
            if paths:
                self.installationPath = paths[0]
            else:
                return None
        
        for phpname in ['php','php4','php-cgi','php-cli']:
            if sys.platform.startswith("win"):
                phpname += '.exe'
            php = os.path.join(self.installationPath, phpname)
            if os.path.exists(php):
                break

        return php
        
    def _GetPHPExeName(self):
        if self._executable:
            return self._executable
        return self._findPHP()

    def _getInterpreterConfig(self):
        if 'cfg_file_path' in self._info:
            return self._info['cfg_file_path']
        return None

    def _GetPHPOutputAndError(self, phpCode):
        """Run the given PHP code and return the output.

        If some error occurs then the error is logged and the empty
        string is returned. (Basically we are taking the position that
        PHP is unreliable.)
        """
        php = self._GetPHPExeName()
        if not php:
            # XXX Would be better, IMO, to raise an exception here.
            return None, "No PHP executable could be found."
        env = koprocessutils.getUserEnv()
        ini = self._getInterpreterConfig()
        if ini:
            env["PHPRC"] = ini
        argv = [php, '-q']
        
        if not "PHPRC" in env:
            # php will look in cwd for php.ini also.
            cwd = os.path.dirname(php)
        else:
            cwd = None


        fd, filepath = tempfile.mkstemp(suffix=".php")
        try:
            os.write(fd, phpCode)
            os.close(fd)
            argv.append(filepath)
            try:
                p = process.ProcessOpen(argv, cwd=cwd, env=env)
            except OSError, e:
                if e.errno == 0 or e.errno == 32:
                    # this happens if you are playing
                    # in prefs and change the executable, but
                    # not the ini file (ie ini is for a different
                    # version of PHP)
                    log.error("Caught expected PHP execution error, don't worry be happy: %s", e.strerror)
                else:
                    log.error("Caught PHP execution exception: %s", e.strerror)
                return None, e.strerror
            try:
                p.wait(5)
            except process.ProcessError:
                # Timed out.
                log.error("PHP command timed out: %r", argv)
                return None, "PHP interpreter did not return in time."
            stdout = p.stdout.read()
            stderr = p.stderr.read()
            return stdout.strip(), stderr.strip()
        finally:
            os.remove(filepath)

    def _GetPHPOutput(self, phpCode):
        """Run the given PHP code and return the output.

        If some error occurs then the error is logged and the empty
        string is returned. (Basically we are taking the position that
        PHP is unreliable.)
        """
        return self._GetPHPOutputAndError(phpCode)[0]

    def _parsedOutput(self, out):
        """Parse the given output from running PHP.

        If it looks like there is no relevant output, the empty string
        is returned.

        XXX This makes the assumption that all interesting output is on
            one line because only the last non-empty line is used. Any
            leading lines are presumed to be load time errors from PHP.
        """
        if not out: return ""
        # If PHP has load time errors, such as failure loading extension
        # dll's, it spits out a bunch of errors first, then the last
        # line has what we're asking for.  So only get the last line of
        # output.
        lines = re.split('\r\n|\n|\r',out) #XXX should use .splitlines() here
        #XXX Shane, you are doing exactly what you think you are here.
        #    If "out" is a bunch of error lines followed by a blank line
        #    then the last error line is returned here.
        # depending on version of php, we may have a
        # blank last line, check for it.
        if not lines[-1]:
            del lines[-1]
            if not lines: return ""
        return lines[-1]
        
    def _GetPHPConfigVar(self, varName):
        # always output a newline, some versions of php need it
        out = self._GetPHPOutput("<?php echo(get_cfg_var('%s').\"\\n\"); ?>"\
                                  % varName)
        return self._parsedOutput(out)
    
    def _GetPHPIniVar(self, varName):
        # always output a newline, some versions of php need it
        out = self._GetPHPOutput("<?php echo(ini_get('%s').\"\\n\"); ?>"\
                                  % varName)
        return self._parsedOutput(out)

    # koIAppInfoEx routines
    def FindInstallationPaths(self):
        phpExes = self.FindInstallationExecutables()
        phpInstallationPaths = [self.getInstallationPathFromBinary(p)\
                                   for p in phpExes]            
        return phpInstallationPaths

    def _findInstallationExecutables(self, path):
        if sys.platform.startswith('win'):
            exts = ['.exe']
        else:
            exts = None
        phpExes = which.whichall('php', exts=exts, path=path) + \
               which.whichall('php-cgi', exts=exts, path=path) + \
               which.whichall('php4', exts=exts, path=path) + \
               which.whichall('php-cli', exts=exts, path=path)
        return phpExes

    def FindInstallationExecutables(self):
        return self._findInstallationExecutables(self._userPath)

    def getInstallationPathFromBinary(self, binaryPath):
        return os.path.dirname(binaryPath)

    def get_executablePath(self):
        return self._GetPHPExeName()
    
    def getExecutableFromDocument(self, koDoc):
        return self.get_executable_from_doc_pref(koDoc,
                                                 'phpDefaultInterpreter')

    def set_executablePath(self, exe):
        self.set_installationPath(exe)
        self._executable = exe
        self._info = {}
        
    def get_haveLicense(self):
        return 1

    def get_version(self):
        if 'version' not in self._info:
            out, err = self._GetPHPOutputAndError(
                "<?php echo(phpversion().\"\\n\"); ?>")
            if not out:
                # (Bug 73485) With some esp. borked PHP setups, even
                # getting the version dies. Logging this case is the least
                # we can do. A better (but more onerous to verify as being
                # safe) change would be to pass up the error and show it
                # in the using UI (e.g. the PHP prefs panel).
                log.error("could not determine PHP version number for "
                          "'%s':\n----\n%s\n----",
                          self._GetPHPExeName(), err)
            self._info['version'] =  self._parsedOutput(out)
        return self._info['version']

    def get_valid_version(self):
        version = self.get_version()
        if version:
            try:
                # convert various php version strings into a tuple for
                # comparison of versions that work with xdebug.
                # unfortunately, this is STILL A MOVING TARGET
                version = tuple([int(x) for x in re.match(r"(\d+)\.(\d+)\.(\d+)", version).groups()])
                # versions of php that xdebug works with, highest versions must
                # be first.  5.0.0-5.0.1 and before 4.3.10 dont work due to
                # missing symbols
                if version >= (5,0,3):
                    return 1
                elif version < (5,0,0) and version >= (4,3,10):
                    return 1
            except ValueError,e:
                pass
        return 0
        
    def get_localHelpFile(self):
        """Return a path to a launchable local help file, else return None.
        Nada for PHP. There is no *standard* local documentation link or any
        real de facto standard.
        """
        return None

    def get_webHelpURL(self):
        return "http://www.php.net/docs.php"

    # additional koIPHPInfoEx routines
    # XXX php takes a directory as an argument to define where to find
    # the ini file, but if you query php for this, it returns a file
    def get_cfg_file_path(self):
        if 'cfg_file_path' not in self._info:
            out = self._GetPHPConfigVar("cfg_file_path")
            self._info['cfg_file_path'] =  self._parsedOutput(out)
        return self._info['cfg_file_path']
    
    def set_cfg_file_path(self,path):
        self._info = {}
        if path:
            self._info['cfg_file_path'] = path
        
    def get_includePath(self):
        return self.get_include_path()
    
    def get_include_path(self):
        if 'include_path' not in self._info:
            out = self._GetPHPIniVar("include_path")
            self._info['include_path'] =  self._parsedOutput(out)
        return self._info['include_path']

    def set_installationPath(self,value):
        if not os.path.isdir(value):
            self.installationPath = os.path.dirname(value)
        else:
            self.installationPath = value
        
    def GetIncludePathArray(self):
        includePath = self.get_include_path().split(os.pathsep)
        # cull out any empty entries (resulting from, say, include_path="a;;b")
        includePath = [path for path in includePath if path]
        return includePath
    
    def get_extension_dir(self):
        if 'extension_dir' not in self._info:
            out = self._GetPHPIniVar("extension_dir")
            self._info['extension_dir'] = self._parsedOutput(out)
        return self._info['extension_dir']

    def autoConfigureDebugger(self):
        # get the phpconfigurator and autoconfigure
        if self.prefService.prefs.hasStringPref("phpConfigFile") and\
                   self.prefService.prefs.getStringPref("phpConfigFile"):
            if not self.get_isDebuggerExtensionLoadable():
                return "Unable to load XDebug"
            return "" 
        configure = components.classes["@activestate.com/koPHPConfigurator;1"].\
                createInstance(components.interfaces.koIPHPConfigurator)
        return configure.autoConfigure(self)
        
    def get_isDebuggerExtensionLoadable(self):
        # always output a newline, some versions of php need it
        if 'xdebug' not in self._info:
            out = self._GetPHPOutput("<?php echo extension_loaded('xdebug')?\"Yes\\n\":\"No\\n\"; ?>")
            self._info['xdebug'] = self._parsedOutput(out)
        return self._info['xdebug'] == "Yes"

    def get_sapi(self):
        # always output a newline, some versions of php need it
        if 'sapi' not in self._info:
            out = self._GetPHPOutput("<?php echo(php_sapi_name().\"\\n\"); ?>")
            self._info['sapi'] = self._parsedOutput(out)
        return self._info['sapi']

class KoPHPInfoEx(KoPHPInfoInstance):
    _reg_clsid_ = "ea1519a8-4e4d-4767-aec4-2f0342c33e7a"
    _reg_contractid_ = "@activestate.com/koAppInfoEx?app=PHP;1"
    _reg_desc_ = "PHP Information"

    def _GetPHPExeName(self):
        phpDefaultInterpreter = None
        # Not using the proxied pref observer due to getting Komodo lockups
        # at start time:
        # http://bugs.activestate.com/show_bug.cgi?id=74474
        prefset = self._prefSvc.prefs
        if prefset.hasStringPref("phpDefaultInterpreter"):
            phpDefaultInterpreter = prefset.getStringPref("phpDefaultInterpreter")
        return phpDefaultInterpreter or self._findPHP()

    def _getInterpreterConfig(self):
        phpConfigFile = None
        # Not using the proxied pref observer due to getting Komodo lockups
        # at start time:
        # http://bugs.activestate.com/show_bug.cgi?id=74474
        prefset = self._prefSvc.prefs
        if prefset.hasStringPref("phpConfigFile"):
            phpConfigFile = prefset.getStringPref("phpConfigFile")
        return phpConfigFile or KoPHPInfoInstance._getInterpreterConfig(self)

    def _get_namedExe(self, name):
        exe = self._GetPHPExeName()
        if self.get_sapi()[:3] != name:
            phpAppInfoEx = components.classes["@activestate.com/koPHPInfoInstance;1"].\
                    createInstance(components.interfaces.koIPHPInfoEx);
            # find the cgi executable
            avail = self._findInstallationExecutables([os.path.dirname(exe)])
            if len(avail) == 1: # only have a cli executable
                return None
            avail = [x for x in avail if x is not exe]
            exe = None
            for e in avail:
                phpAppInfoEx.executablePath = e
                if phpAppInfoEx.sapi[:3] == name:
                    return e
        return exe
        
    def get_cliExecutable(self):
        if 'cli-executable' not in self._info:
            cli_exe = self._get_namedExe('cli')
            self._info['cli-executable'] = cli_exe
            return cli_exe
        return self._info.get('cli-executable')
    
    def get_cgiExecutable(self):
        if 'cgi-executable' not in self._info:
            cgi_exe = self._get_namedExe('cgi')
            self._info['cgi-executable'] = cgi_exe
            return cgi_exe
        return self._info.get('cgi-executable')

class KoNodeJSInfoEx(KoAppInfoEx):
    _com_interfaces_ = [components.interfaces.koIAppInfoEx,
                        components.interfaces.nsIObserver]
    _reg_clsid_ = "{d5f5f120-2322-4cdf-8fbf-cd4a5861cc5a}"
    _reg_contractid_ = "@activestate.com/koAppInfoEx?app=NodeJS;1"
    _reg_desc_ = "Extended NodeJS Information"

    def __init__(self):
        KoAppInfoEx.__init__(self)
        self._userPath = koprocessutils.getUserEnv()["PATH"].split(os.pathsep)
        self._executables = []
        self._digits_re = re.compile(r'(\d+)')
        try:
            self._prefSvc.prefs.prefObserverService.addObserver(self, "nodejsDefaultInterpreter", 0)
        except Exception, e:
            print e

    def observe(self, subject, topic, data):
        if topic == "nodejsDefaultInterpreter":
            self.installationPath = None
        
    def _GetNodeJSExeName(self):
        if not self.installationPath:
            nodejsExe = self.prefService.prefs.getStringPref("nodejsDefaultInterpreter")
            if nodejsExe and os.path.exists(nodejsExe):
                return nodejsExe
            paths = self.FindInstallationPaths()
            if paths:
                path = paths[0]
            else:
                return None
        else:
            path = self.installationPath
            paths = None

        binaryName = "node.exe" if sys.platform.startswith("win") else "node"
        for relPath in (("bin", binaryName), (binaryName,)):
            res = os.path.join(path, *relPath)
            if os.path.exists(res):
                break
        else:
            res = None

        if paths is not None:
            self.set_executablePath(res)
        return res

    def getInstallationPathFromBinary(self, binaryPath):
        # The Node binary is expected to be in a bin/ subdirectory, except on
        # Windows it isn't :\
        dirname = os.path.dirname(binaryPath)
        parent, leaf = os.path.split(dirname)
        if leaf == "bin":
            dirname = parent
        return dirname

    def get_executablePath(self):
        nodejsExePath = self._GetNodeJSExeName()
        if not nodejsExePath:
            # which("non-existent-app) can return empty string, map it to None
            return None
        if not os.path.exists(nodejsExePath):
            log.info("KoNodeJSInfoEx:get_executablePath: file %r doesn't exist",
                     nodejsExePath)
            return None
        return nodejsExePath
    
    def getExecutableFromDocument(self, koDoc):
        return self.get_executable_from_doc_pref(koDoc,
                                                 'nodejsDefaultInterpreter')

    def set_executablePath(self, path):
        self.installationPath = os.path.dirname(os.path.dirname(path))
        
    def getVersionForBinary(self, nodejsExe):
        if not os.path.exists(nodejsExe):
            raise ServerException(nsError.NS_ERROR_FILE_NOT_FOUND)
        argv = [nodejsExe, "-v"]
        p = process.ProcessOpen(argv, stdin=None)
        nodejsVersionDump, stderr = p.communicate()
        pattern = re.compile("v([\w\.]+)")
        match = pattern.match(nodejsVersionDump)
        if match:
            return match.group(1)
        else:
            msg = "Can't find a version in `%s -v` output of '%s'/'%s'" % (nodejsExe, nodejsVersionDump, stderr)
            raise ServerException(nsError.NS_ERROR_UNEXPECTED, msg)
    
    def get_version(self):
        nodejsExe = self._GetNodeJSExeName()
        return self.getVersionForBinary(nodejsExe)
        
    def get_valid_version(self):
        nodejsExe = self._GetNodeJSExeName()
        if not nodejsExe:
            return False
        try:
            ver = self.getVersionForBinary(nodejsExe)
            versionParts = invocationutils.split_short_ver(ver, intify=True)
            return tuple(versionParts) >= (0, 2, 0) # minimum version, assume 0.1 was experimental
        except AttributeError:
            return False
        except ServerException, ex:
            if ex.errno != nsError.NS_ERROR_FILE_NOT_FOUND:
                raise
            return False

    def get_buildNumber(self):
        raise ServerException(nsError.NS_ERROR_NOT_IMPLEMENTED)
 
    def get_localHelpFile(self):
        return None

    def get_webHelpURL(self):
        """Return a web URL for help on this app, else return None."""
        return "http://www.nodejs.org/docs/" + "v" + self.get_version()
        # On newer systems the docs are at nodejs.org/docs/<version>/api,
        # but this varies for older versions, and could change in the future.

    def FindInstallationPaths(self):
        if sys.platform.startswith('win'):
            exts = ['.exe']
        else:
            exts = None
        self._executables = []
        installationPaths = None
        self._executables = which.whichall('node', exts=exts, path=self._userPath)
        if not self._executables:
            current_nodejs_path = self.prefService.prefs.getStringPref("nodejsDefaultInterpreter")
            if current_nodejs_path:
                self._executables = [current_nodejs_path]
        if self._executables:
            installationPaths = [self.getInstallationPathFromBinary(p)\
                                   for p in self._executables]
        return installationPaths

    def FindInstallationExecutables(self):
        if not self._executables:
            self.FindInstallationPaths()
        return self._executables

    def set_installationPath(self, path):
        self.installationPath = path
        self.executablePath = ''

class KoCVSInfoEx(KoAppInfoEx):
    _com_interfaces_ = [components.interfaces.koIAppInfoEx,
                        components.interfaces.nsIObserver]
    _reg_clsid_ = "C3A7A887-D0D3-426A-8C67-2CC3E2946636"
    _reg_contractid_ = "@activestate.com/koAppInfoEx?app=CVS;1"
    _reg_desc_ = "CVS Information"

    def __init__(self):
        KoAppInfoEx.__init__(self)
        self._userPath = koprocessutils.getUserEnv()["PATH"].split(os.pathsep)
        try:
            self._prefSvc.prefs.prefObserverService.addObserver(self, "cvsExecutable", 0)
        except Exception, e:
            print e

    def observe(self, subject, topic, data):
        if topic == "cvsExecutable":
            self.installationPath = None

    def _getCVSExeName(self):
        if not self.installationPath:
            cvsExe = self.prefService.prefs.getStringPref("cvsExecutable")
            if cvsExe:
                self.installationPath = self.getInstallationPathFromBinary(cvsExe)
                return os.path.basename(cvsExe)
            else:
                paths = self.FindInstallationPaths()
                if len(paths) > 0:
                    self.installationPath = paths[0]
                else:
                    return None
        
        if sys.platform.startswith('win'):
            return 'cvs.exe'
        else:
            return 'cvs'

    # koIAppInfoEx routines
    def FindInstallationPaths(self):
        if sys.platform.startswith('win'):
            exts = ['.exe']
        else:
            exts = None
        cvss = which.whichall("cvs", exts=exts, path=self._userPath)
        cvsInstallationPaths = [self.getInstallationPathFromBinary(cvs)\
                                for cvs in cvss]
        return cvsInstallationPaths

    def getInstallationPathFromBinary(self, binaryPath):
        if sys.platform.startswith("win"):
            return os.path.dirname(binaryPath)
        else:
            return os.path.dirname(os.path.dirname(binaryPath))

    def get_executablePath(self):
        if not self.executablePath:
            exename = self._getCVSExeName()
            if not exename: return None
            if sys.platform.startswith("win"):
                self.executablePath = os.path.join(self.installationPath, exename)
            else:
                self.executablePath = os.path.join(self.installationPath, "bin", exename)
        return self.executablePath

    def set_executablePath(self,path):
        self.executablePath = path
        if sys.platform.startswith('win'):
            self.installationPath = os.path.dirname(path)
        else:
            self.installationPath = os.path.dirname(os.path.dirname(path))

    def get_haveLicense(self):
        return 1

    def get_version(self):
        """A CVS version include not only the standard 1.2.3-type numbers
        but also the "build family", of which CVSNT is a different one.
        For example:
            1.11.2 CVS
            1.11.1.3 CVSNT
        Returns None if the version cannot be determined.
        """
        cvsExe = self.get_executablePath()
        if not cvsExe: return None
        p = process.ProcessOpen([cvsExe, '-v'], stdin=None)
        output, error = p.communicate()
        retval = p.returncode
        
        versionRe = re.compile(r'\((?P<family>.+?)\)\s+(?P<version>[\d\.\w]+?)[\s\-]',
                               re.MULTILINE)
        match = versionRe.search(output)
        if match:
            version = "%s %s" % (match.group('version'),
                                 match.group('family'))
            return version
        else:
            log.warn('Could not determine CVS version [%s] "%s"', cvsExe, output)
            return None
 
    def get_buildNumber(self):
        raise ServerException(nsError.NS_ERROR_NOT_IMPLEMENTED)
    def get_localHelpFile(self):
        raise ServerException(nsError.NS_ERROR_NOT_IMPLEMENTED)
    def get_webHelpURL(self):
        raise ServerException(nsError.NS_ERROR_NOT_IMPLEMENTED)



#---- self test code

if __name__ == "__main__":
    def getCOMAttribute(obj, property, default = 'not implemented'):
        try:
            return getattr(obj, property)
        except COMException, e:
            if e.errno == nsError.NS_ERROR_NOT_IMPLEMENTED:
                return default
            else:
                raise
                    
    for app in ["Perl", "Python", "PHP"]:
        appInfoExe = components.classes["@activestate.com/koAppInfoEx?app=%s;1"%app]\
                   .createInstance()
        
        installations = appInfoExe.FindInstallationPaths()
        for installation in installations:
            appInfoExe.installationPath = installation
            print "+------ %s installation: %s" % (app, appInfoExe.installationPath)
            print "| haveLicense: %s" % getCOMAttribute(appInfoExe, 'haveLicense')
            print "| executable location: %s" % getCOMAttribute(appInfoExe, 'executablePath')
            print "| version: %s" % getCOMAttribute(appInfoExe, 'version')
            print "| localHelpFile: %s" % getCOMAttribute(appInfoExe, 'localHelpFile')
            print "| webHelpURL: %s" % getCOMAttribute(appInfoExe, 'webHelpURL')
            
            if app == "PHP":
                print "|\t+------ PHP extra features ------"
                print "|\t| cfg_file_path: %s" % appInfoExe.cfg_file_path
                print "|\t| include_path: %s %s" % (appInfoExe.include_path,
                                                    appInfoExe.GetIncludePathArray())
                print "|\t| extension_dir: %s" % appInfoExe.extension_dir
                print "|\t+---------------------------------"
            
            print "+---------------------------------"
    


