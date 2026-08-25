package com.google.gwt.event.shared;

/**
 * Enough of GWT's event base class for the ported classes to compile off-browser.
 * The oracle never dispatches events, so dispatch is only ever reached via
 * HandlerManager, which is a no-op here.
 */
public abstract class GwtEvent<H extends EventHandler> {
  public static class Type<H> {}

  public abstract Type<H> getAssociatedType();

  protected abstract void dispatch(H handler);
}
