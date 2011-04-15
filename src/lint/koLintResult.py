#!python
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


from xpcom import components
from xpcom._xpcom import PROXY_SYNC, PROXY_ALWAYS, getProxyForObject
import re

def getProxiedEffectivePrefs(request):
    return getProxyForObject(None,
                             components.interfaces.koIPreferenceSet,
                             request.koDoc.getEffectivePrefs(),
                             PROXY_ALWAYS | PROXY_SYNC)

SEV_ERROR = 2   # No xpcom here :(
SEV_WARNING = 1
SEV_INFO = 0

def createAddResult(results, textlines, severity, lineNo, desc, leadingWS=None):
    result = KoLintResult()
    result.severity = severity
    if lineNo >= len(textlines):
        lineNo = len(textlines) - 1
    while lineNo >= 0 and len(textlines[lineNo - 1]) == 0:
        lineNo -= 1
    if lineNo == 0:
        return
    result.lineStart = result.lineEnd = lineNo
    result.columnStart = 1
    targetLine = textlines[lineNo - 1]
    if leadingWS is not None:
        columnEndOffset = len(leadingWS)
    else:
        columnEndOffset = 0
    result.columnEnd = len(targetLine) + 1 - columnEndOffset
    result.description = desc
    results.addResult(result)
    
class KoLintResult:
    _com_interfaces_ = [components.interfaces.koILintResult]
# This object is never actually registered and created by contract ID.
# Our language linters create them explicitly.
#    _reg_desc_ = "Komodo Lint Result"
#    _reg_clsid_ = "{21648850-492F-11d4-AC24-0090273E6A60}"
#    _reg_contractid_ = "Komodo.LintResult"

    SEV_INFO    = components.interfaces.koILintResult.SEV_INFO
    SEV_WARNING = components.interfaces.koILintResult.SEV_WARNING
    SEV_ERROR   = components.interfaces.koILintResult.SEV_ERROR

    def __init__(self):
        self.lineStart = -1
        self.lineEnd = -1
        self.columnStart = -1
        self.columnEnd = -1
        self.description = ""
        self.encodedDescription = None
        self.severity = None

    def __str__(self):
        return "%d:%d (%d-%d) %s" % (
            self.lineStart,
            self.lineEnd,
            self.columnStart,
            self.columnEnd,
        self.description)

    def _encode_string(self, s):
        return re.sub(# match 0x00-0x1f except TAB(0x09), LF(0x0A), and CR(0x0D)
                   '([\x00-\x08\x0b\x0c\x0e-\x1f])',
                   # replace with XML decimal char entity, e.g. '&#7;'
                   lambda m: '\\x%02X'%ord(m.group(1)),
                   s)

    # XXX since this object is not created through xpcom createinstance,
    # using a setter doesn't work.  However, we access it through xpcom
    # from javascript, so we can do our encoding once in the getter
    # to prevent UI crashes.
    def get_description(self):
        if self.encodedDescription is None:
            _gEncodingServices = components.classes['@activestate.com/koEncodingServices;1'].\
                     getService(components.interfaces.koIEncodingServices)
            try:
                unicodebuffer, encoding, bom = _gEncodingServices.\
                                                 getUnicodeEncodedStringUsingOSDefault(self.description)
                self.encodedDescription  = self._encode_string(unicodebuffer)
            except Exception, e:
                self.encodedDescription  = repr(self.description)[1:-1] # remove quotes
        return self.encodedDescription
