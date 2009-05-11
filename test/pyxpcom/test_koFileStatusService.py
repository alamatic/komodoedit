# Copyright (c) 2000-2009 ActiveState Software Inc.
# See the file LICENSE.txt for licensing information.


import os
import unittest
import sys, time

from xpcom import components, COMException
from xpcom.server import WrapObject, UnwrapObject

import threading

class TestKoFileStatusServiceObserver:
    _com_interfaces_ = [components.interfaces.nsIObserver]
    
    def __init__(self):
        self.lock = threading.Condition()
        self.clear()
        observerSvc = components.classes["@mozilla.org/observer-service;1"].\
            getService(components.interfaces.nsIObserverService)
        self.__wrappedSelf = WrapObject(self, components.interfaces.nsIObserver)
        observerSvc.addObserver(self.__wrappedSelf, 'file_status', 0)

    def __del__(self):
        observerSvc = components.classes["@mozilla.org/observer-service;1"].\
            getService(components.interfaces.nsIObserverService)
        observerSvc.removeObserver(self.__wrappedSelf, 'file_status')

    def clear(self):
        self.lock.acquire()
        try:
            self.subject = None
            self.topic = None
            self.updated_uris = set()
        finally:
            self.lock.release()

    def observe(self, subject, topic, data):
        #print "got observe (%s,%s,%s)"%(subject, topic, URI)
        self.lock.acquire()
        try:
            self.subject = subject
            self.topic = topic
            for URI in data.split("\n"):
                print "Got a file_status notification: %r" % (URI, )
                self.updated_uris.add(URI)
            self.lock.notifyAll()
        finally:
            self.lock.release()

    def wait(self, timeout=None):
        # Process pending Mozilla events in order to receive the observer
        # notifications, based on Mozilla xpcshell test class here:
        # http://mxr.mozilla.org/mozilla-central/source/testing/xpcshell/head.js#75
        currentThread = components.classes["@mozilla.org/thread-manager;1"] \
                            .getService().currentThread
        start_time = time.time()
        while not self.updated_uris:
            if timeout is not None:
                if (time.time() - start_time) > timeout:
                    break
            # Give some time to gather more events.
            time.sleep(0.25)
            # Process events, such as the pending observer notifications.
            while currentThread.hasPendingEvents():
                currentThread.processNextEvent(True)

class TestKoFileStatusService(unittest.TestCase):
    def __init__(self, methodName):
        unittest.TestCase.__init__(self, methodName)
        self.__obs = TestKoFileStatusServiceObserver()
        self.__fileStatusSvc = components.classes["@activestate.com/koFileStatusService;1"] \
                         .getService(components.interfaces.koIFileStatusService)
        from xpcom.server import UnwrapObject
        UnwrapObject(self.__fileStatusSvc).init()
        self.__filesvc = components.classes["@activestate.com/koFileService;1"] \
                         .getService(components.interfaces.koIFileService)

    def __del__(self):
        self.__fileStatusSvc.unload()

    def setUp(self):
        self.__obs.clear()

    def test_service(self):
        if sys.platform.startswith("win"):
            uri = "file:///" + os.path.abspath(__file__).replace("\\", "/")
        else:
            uri = "file://" + os.path.abspath(__file__)
        file = self.__filesvc.getFileFromURI(uri)
        assert file.exists
        self.__fileStatusSvc.updateStatusForFiles([file], False)
        # Give some time to get the status.
        # Note: Edit does not have scc handling.
        #self.__obs.wait(5)
        #assert file.sccDirType == 'svn'
        #assert file.sccType == 'svn'

#---- mainline

def suite():
    return unittest.makeSuite(TestKoFileStatusService)

def test_main():
    runner = unittest.TextTestRunner(verbosity=2)
    runner.run(suite())

if __name__ == "__main__":
    __file__ = os.path.abspath(sys.argv[0]) # won't be necessary in Python 2.3
    test_main()
