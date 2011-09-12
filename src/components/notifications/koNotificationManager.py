import logging
import sys
from collections import deque
from threading import Lock
import time, weakref
from xpcom import components, COMException, nsError
from xpcom.server import UnwrapObject

log = logging.getLogger("koNotification")
#log.setLevel(logging.DEBUG)

Ci = components.interfaces

class KoNotificationManager:
    _com_interfaces_ = [Ci.koINotificationManager,
                        Ci.nsIObserver]
    _reg_clsid_ = "{0076dfb7-9f88-47a4-937c-b73c71ac02f2}"
    _reg_contractid_ = "@activestate.com/koNotification/manager;1"
    _reg_desc_ = "Komodo Notification Manager"

    def __init__(self):
        self._notifications = []
        self._listeners = set()
        self._lock = Lock()
        self._notifier = KoNotificationNotifier()
        self._prefs.prefObserverService.addObserverForTopics(self,
                                                             ["notifications.core.maxItems"],
                                                             True)
        self.observe(None, "notifications.core.maxItems", None)

    def _unwrap(self, aObject):
        try:
            # try to unwrap the object if possible so we get the
            # benefit of __repr__
            return UnwrapObject(aObject)
        except:
            return aObject

    def _wrap(self, aObject, aInterface=None):
        sip = getattr(self, "__sip", None)
        if sip is None:
            sip = components.classes["@mozilla.org/supports-interface-pointer;1"]\
                            .createInstance(Ci.nsISupportsInterfacePointer)
            setattr(self, "__sip", sip)
        sip.data = aObject
        result = sip.data
        sip.data = None
        if aInterface is not None:
            result.QueryInterface(aInterface)
        return result

    def _notify(self, aNotification, aReason, aOldIndex=None, aNewIndex=None):
        assert not self._lock.locked(), \
            "KoNotificationManager::_notify called with lock held!"

        # always use wrapped notifications
        aNotification = self._wrap(aNotification)

        # make a copy of the listeners to deal with things removing themselves
        if aOldIndex is None:
            aOldIndex = -1

        with self._lock:
            if aNewIndex is None:
                try:
                    if aReason != Ci.koINotificationListener.REASON_REMOVED:
                        aNewIndex = self._notifications.index(aNotification)
                    else:
                        aNewIndex = -1
                except ValueError:
                    aNewIndex = -1
            listeners = list(self._listeners)

        log.debug("Notifying: notification %r, reason %r, index %r -> %r",
                  aNotification, aReason, aOldIndex, aNewIndex)

        # dispatch all listeners asynchronously - they can take arbitrary time
        # and we don't want to block on them
        self._notifier.push(listeners, aNotification, aOldIndex, aNewIndex, aReason)

    def addNotification(self, aNotification):
        reason = components.interfaces.koINotificationListener.REASON_ADDED
        aNotification = self._wrap(aNotification, Ci.koINotification)
        removed = []
        with self._lock:
            try:
                oldIndex = self._notifications.index(aNotification)
                log.debug("Updating existing notification %r at %r",
                          self._unwrap(aNotification), oldIndex)
                reason = components.interfaces.koINotificationListener.REASON_UPDATED
                # removing from the middle is slow; however, there's no useful
                # way to expose a custom iterator to JS, so we still need to use
                # list() for random access...
                del self._notifications[oldIndex]
            except ValueError:
                # not found
                oldIndex = -1
                log.debug("Adding new notification %r at %r",
                          self._unwrap(aNotification),
                          aNotification.time)

            while len(self._notifications) >= self._maxItems:
                removed.append(self._notifications.pop(0))
                log.debug("too many items, need to bump the oldest %r off",
                          removed[-1])

            newIndex = len(self._notifications)
            self._notifications.append(aNotification)
        aNotification.time = time.time() * 10**6 # secs_per_usec
        for item in removed:
            self._notify(item, Ci.koINotificationListener.REASON_REMOVED, 0)
        self._notify(aNotification, reason, oldIndex, newIndex)

    def removeNotification(self, aNotification):
        if aNotification is None:
            return False # umm, we can't remove nothing
        aNotification = self._wrap(aNotification, Ci.koINotification)
        try:
            with self._lock:
                index = self._notifications.index(aNotification)
                del self._notifications[index]
        except ValueError:
            log.debug("Not removing non-existent notification %r",
                      self._unwrap(aNotification))
            return False

        log.debug("Removed notification %r", self._unwrap(aNotification))
        self._notify(aNotification,
                     Ci.koINotificationListener.REASON_REMOVED,
                     aOldIndex=index)
        return True

    def hasNotification(self, aNotification):
        aNotification = self._wrap(aNotification, Ci.koINotification)
        with self._lock:
            return aNotification in self._notifications

    def getAllNotifications(self, aStart, aEnd):
        with self._lock:
            return self._notifications[aStart:(aEnd or None)]

    def getNotifications(self, aContexts, aIdentifier):
        def matchNotification(n):
            if aContexts:
                if not n.contxt in aContexts:
                    return False
            if aIdentifier:
                if aIdentifier != n.identifier:
                    return False
            return True
        with self._lock:
            return [n for n in self._notifications if matchNotification(n)]

    @property
    def notificationCount(self):
        with self._lock:
            return len(self._notifications)

    def addListener(self, aListener):
        listener = self._wrap(aListener, Ci.koINotificationListener)
        with self._lock:
            self._listeners.add(listener)
        log.debug("Adding listener %r", self._unwrap(aListener))

    def removeListener(self, aListener):
        listener = self._wrap(aListener)
        with self._lock:
            self._listeners.discard(listener)
        log.debug("Removing listener %r", self._unwrap(aListener))

    def createNotification(self, aIdentifier, aTags, aContext, aTypes):
        log.debug("createNotification: id=%r tags=%r cxt=%r types=%r",
                  aIdentifier, aTags, aContext, aTypes)
        context = self._wrap(aContext) if aContext else None
        with self._lock:
            for notification in self._notifications:
                assert notification == self._wrap(notification), \
                  "expecting _notifications array to be all wrapped"
                if notification.identifier == aIdentifier and \
                  notification.contxt == context:
                    # found a notification with the same identifier / context
                    # return that instead of making a new one
                    return notification
        # since KoNotification hasn't got a useful ClassInfo, we can't expose
        # interfaces automatically. For Python callers, we can manually QI it to
        # all supported interfaces and let PyXPCOM cache the wrappers.
        notification = KoNotification(aIdentifier, aTags, context, aTypes, self)
        interfaces = notification._com_interfaces_
        notification = self._wrap(notification)
        for interface in interfaces:
            notification.QueryInterface(interface)
        return notification

### Python API
    def add(self, summary, tags, identifier, context=None, **kwargs):
        # ko.notifications.add
        types = 0
        if "actions" in kwargs:
            types |= Ci.koINotificationManager.TYPE_ACTIONABLE
        if "maxProgress" in kwargs:
            assert kwargs["maxProgress"] > 0, \
                "adding notification with maxProgress %r not >0" % (kwargs["maxProgress"],)
            types |= Ci.koINotificationManager.TYPE_PROGRESS
        if "details" in kwargs:
            types |= Ci.koINotificationManager.TYPE_TEXT
        notification = self.createNotification(identifier, tags, context, types)
        notification.summary = summary
        kwargs = kwargs.copy() # shallow copy
        for prop in ("iconURL", "severity", "description", "details",
                     "maxProgress", "progress"):
            if prop in kwargs:
                setattr(notification, prop, kwargs[prop])
                del kwargs[prop]
        if "actions" in kwargs:
            for action_data in kwargs["actions"]:
                action = self._wrap(KoNotificationAction())
                for k, v in action_data.items():
                    if not hasattr(action, k):
                        raise COMException(nsError.NS_ERROR_INVALID_ARG,
                                           "invalid action argument %r" % (k,))
                    setattr(action, k, v)
                notification.updateAction(action)
            del kwargs["actions"]
        if kwargs.keys():
            log.warning("ko.notifications.add called with unknown arguments %r",
                        kwargs.keys())
        self.addNotification(notification)
        return notification

    def update(self, notification, summary=None, details=None, progress=None,
               actions=None):
        if summary is not None:
            notification.summary = summary
        if details is not None:
            notification.details = details
        if progress is not None:
            if progress > notification.maxProgress:
                raise COMException(nsError.NS_ERROR_INVALID_ARG,
                                   "Progress %r is larger than maximum %r" %
                                     (progress, notification.maxProgress))
            notification.progress = progress
        for action_data in actions or []:
            action_data = action_data.copy() # shallow copy
            if not "identifier" in action_data:
                raise COMException(nsError.NS_ERROR_INVALID_ARG,
                                   "tried to update action without identifier")
            if "remove" in action_data:
                notification.removeAction(action_data["identifier"])
                continue
            actions = notification.getActions(action_data["identifier"])
            if not actions:
                # new action
                action = self._wrap(KoNotificationAction())
                action.identifier = action_data["identifier"]
            else:
                # existing action
                action = actions[0]
            del action_data["identifier"]
            for k, v in action_data.items():
                if not hasattr(action, k):
                    raise COMException(nsError.NS_ERROR_INVALID_ARG,
                                       "Unexpected property %r on action %s" %
                                         (k, action.identifier))
                setattr(action, k, v)
            notification.updateAction(action)
        if any(x is not None for x in (summary, details, progress, actions)):
            self.addNotification(notification)

    def remove(self, notification):
        self.removeNotification(notification)

    # pretend to be a pythonic sequence
    def __len__(self):
        with self._lock:
            return len(self._notifications)
    def __getitem__(self, key):
        with self._lock:
            return self._notifications[key]
    def __iter__(self):
        with self._lock:
            notifications = self._notifications[:] # copy
        return iter(notifications)
    def __reversed__(self):
        with self._lock:
            return reversed(self._notifications[:])
    def __contains__(self, item):
        with self._lock:
            return self._wrap(item) in self._notifications
    def count(self, *args, **kwargs):
        with self._lock:
            return self._notifications.count(*args, **kwargs)
    def index(self, *args, **kwargs):
        with self._lock:
            return self._notifications.index(*args, **kwargs)

    # nsIObserver
    def observe(self, subject, topic, data):
        if topic == "notifications.core.maxItems":
            if self._prefs.hasLongPref(topic):
                self._maxItems = self._prefs.getLongPref(topic)
            else:
                # no value, use something vaguely sensible
                if self._prefs.hasLongPref("notifications.ui.maxItems"):
                    self._maxItems = self.prefs.getLongPref("notifications.ui.maxItems") * 4
                else:
                    self._maxItems = 50 * 4 # assume 50 per window
            # remove anything that is now stale (but don't hold the lock too long)
            with self._lock:
                garbage = self._notifications[:-self._maxItems]
            for item in garbage:
                self.removeNotification(item)

    # internal helpers
    @property
    def _prefs(self):
        return components.classes["@activestate.com/koPrefService;1"]\
                         .getService(components.interfaces.koIPrefService)\
                         .effectivePrefs

class KoNotification(object):
    _com_interfaces_ = [] # see __init__
    _reg_desc_ = "Komodo Notification Object"

    def __init__(self, identifier, tags, context, types, mgr):
        self.identifier = str(identifier)
        self._com_interfaces_ = [Ci.koINotification, Ci.nsIClassInfo]
        if types & Ci.koINotificationManager.TYPE_ACTIONABLE:
            self._com_interfaces_.append(Ci.koINotificationActionable)
        if types & Ci.koINotificationManager.TYPE_PROGRESS:
            self._com_interfaces_.append(Ci.koINotificationProgress)
        if types & Ci.koINotificationManager.TYPE_TEXT:
            self._com_interfaces_.append(Ci.koINotificationText)
        if types & Ci.koINotificationManager.TYPE_STATUS:
            self._com_interfaces_.append(Ci.koIStatusMessage)
            self.category = None
            self.timeout = 0
            self.highlight = 0
            self.expiresAt = 0
            self.interactive = 0
            self._log = True

        self.__manager = weakref.ref(mgr)
        tags = map(lambda s: s.lower(), filter(None, tags)) # drop empty tags
        self.tags = list(set(tags)) # drop repeated tags
        self.actions = []
        self.contxt = context

    @property
    def _manager(self):
        """Get the notification manager, if this notification is currently being
        tracked by the manager. Return None if the manager is unaware of us.
        """
        manager = self.__manager()
        if manager and self in manager:
            return manager
        return None

    def _createProperty(name, defaultValue=None, setCheck=None):
        """Define a property
        @param name {str} The name of the real property
        @param defaultValue The default value for the property
        @param setCheck {callable} A method to call to ensure the value being
            set is valid. Takes two arguments, self and the new value.
            Return True to allow the set, False to stop it.
        """
        def getter(self):
            return getattr(self, name, defaultValue)

        def setter(self, value):
            if setCheck is not None and not setCheck(self, value):
                raise COMException(nsError.NS_ERROR_ILLEGAL_VALUE)
            oldVal = getattr(self, name, defaultValue)
            setattr(self, name, value)
            if oldVal != value:
                manager = self._manager
                if manager:
                    manager.addNotification(self)

        return property(getter, setter)

    for attr in ("summary", "iconURL", "description", "details",
                 "detailsHTML"):
        locals()[attr] = _createProperty("_" + attr, None)
    severity = _createProperty("_severity", 0)
    time = 0 # updating time does _not_ fire notifications
    contxt = context = _createProperty("_context")
    maxProgress = _createProperty("_maxProgress", 0, lambda self, v: v > 0)
    progress = _createProperty("_progress", 0,
                               lambda self, v: v >= 0 and v <= self.maxProgress)

    def getTags(self):
        return self.tags

    def getActions(self, actionId=None):
        if not actionId:
            return list(self.actions)
        return filter(lambda a: a.identifier == actionId, self.actions)

    def updateAction(self, action):
        if not action.identifier:
            raise COMException(nsError.NS_ERROR_NOT_INITIALIZED,
                               "action has no identifier")
        oldaction = self.getActions(action.identifier)
        if oldaction:
            self.actions[self.actions.index(oldaction[0])] = action
        else:
            self.actions.append(action)
        manager = self._manager
        if manager:
            try:
                index = manager.index(manager._wrap(self))
                manager._notify(self, Ci.koINotificationListener.REASON_UPDATED,
                                aOldIndex=index, aNewIndex=index)
            except ValueError:
                # we have a manager, but we're not in it?
                pass
        return len(oldaction) > 0

    def removeAction(self, actionId):
        action = self.getActions(actionId)
        if action:
            self.actions.remove(action[0])
            manager = self._manager
            if manager:
                try:
                    index = manager.index(manager._wrap(self))
                    manager._notify(self, Ci.koINotificationListener.REASON_UPDATED,
                                    aOldIndex=index, aNewIndex=index)
                except ValueError:
                    # we have a manager, but we're not in it?
                    pass
            return True
        return False

    # koIStatusMessage
    msg = _createProperty("_summary", None)
    @property
    def log(self):
        return self._log
    @log.setter
    def log(self, value):
        if value != self._log:
            manager = self._manager
            if manager:
                if value:
                    manager.addNotification(self)
                else:
                    manager.removeNotification(self)
        self._log = value

    # nsIClassInfo - the way we play with _com_interfaces_ makes PyXPCOM confused
    # and it won't implement ClassInfo for us
    def getInterfaces(self):
        return self._com_interfaces_[:]
    def getHelperForLanguage(self, language):
        return None
    contractID = None
    classDescription = _reg_desc_
    classID = None
    implementationLanguage = Ci.nsIProgrammingLanguage.PYTHON
    flags = Ci.nsIClassInfo.THREADSAFE

class KoNotificationAction(object):
    _com_interfaces_ = [Ci.koINotificationAction]
    _reg_clsid_ = "{0169431a-f657-4c03-829c-fcb08e4b7d93}"
    _reg_contractid_ = "@activestate.com/koNotification/action;1"
    _reg_desc_ = "Komodo Notification Action"

    def __init__(self):
        for attr in ("label", "accessKey", "iconURL"):
            setattr(self, attr, None)
        self.visible = self.enabled = True

    @property
    def handler(self):
        return getattr(self, "_handler", None)
    @handler.setter
    def handler(self, value):
        log.debug("setting handler to %r", value)
        setattr(self, "_handler", value)
    
    @property
    def identifier(self):
        return getattr(self, "_id", None)
    @identifier.setter
    def identifier(self, value):
        if hasattr(self, "_id"):
            raise COMException(nsError.NS_ERROR_ALREADY_INITIALIZED,
                               "koNotificationAction already has id %r" % (self._id))
        setattr(self, "_id", value)

class KoNotificationNotifier(object):
    """Helper runnable class to help batch up notifying listeners in order to
       avoid going back to the event loop too many times"""
    _com_interfaces_ = [Ci.nsIRunnable]
    _reg_desc_ = "Komodo Notification Manager Listener Callback Helper"

    def __init__(self):
        self._mainThread = None
        self._tasks = deque()
        self._lock = Lock()

    @property
    def mainThread(self):
        if self._mainThread is None:
            self._mainThread = components.classes["@mozilla.org/thread-manager;1"]\
                                         .getService(components.interfaces.nsIThreadManager)\
                                         .mainThread
        return self._mainThread

    def push(self, listeners, notification, oldIndex, newIndex, reason):
        with self._lock:
            waiting = len(self._tasks) > 0
            self._tasks.append((listeners, notification, oldIndex, newIndex, reason))
        if not waiting:
            self.mainThread.dispatch(self, Ci.nsIEventTarget.DISPATCH_NORMAL)

    def run(self):
        # run notifications in batches
        for attempt in range(10, 0, -1):
            try:
                with self._lock:
                    task = self._tasks.popleft()
            except IndexError:
                # no items left
                return
            listeners, notification, oldIndex, newIndex, reason = task
            for listener in listeners:
                listener.onNotification(notification, oldIndex, newIndex, reason)
        # getting here means we might have more items left; do that later
        self.mainThread.dispatch(self, Ci.nsIEventTarget.DISPATCH_NORMAL)

# list of classes exposed by this module. (needed because it automatic detection
# fails when it encounters components.interfaces)
PYXPCOM_CLASSES = (KoNotificationManager, KoNotificationAction)