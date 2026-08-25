package com.google.gwt.event.shared;

/**
 * No-op stand-in. The oracle has no UI, so nothing subscribes and firing an
 * event can have no effect on the search.
 */
public class HandlerManager {
  public HandlerManager(Object source) {}

  public void fireEvent(GwtEvent<?> event) {}

  public <H extends EventHandler> HandlerRegistration addHandler(GwtEvent.Type<H> type, H handler) {
    return null;
  }

  public <H extends EventHandler> void removeHandler(GwtEvent.Type<H> type, H handler) {}
}
