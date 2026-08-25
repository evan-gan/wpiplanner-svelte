package com.google.gwt.event.shared;

public interface HasHandlers {
  void fireEvent(GwtEvent<?> event);
}
