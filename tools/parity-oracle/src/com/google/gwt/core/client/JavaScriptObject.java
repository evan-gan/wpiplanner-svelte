package com.google.gwt.core.client;

/**
 * Compile-only stand-in for GWT's JS overlay base type.
 *
 * The oracle never touches the browser storage path, so the factory methods
 * throw rather than pretend to work — a call would be a bug in the harness.
 */
public class JavaScriptObject {
  protected JavaScriptObject() {}

  public static JavaScriptObject createObject() {
    throw new UnsupportedOperationException("No JavaScript runtime in the parity oracle.");
  }

  public static JavaScriptObject createArray() {
    throw new UnsupportedOperationException("No JavaScript runtime in the parity oracle.");
  }

  @SuppressWarnings("unchecked")
  public final <T extends JavaScriptObject> T cast() {
    return (T) this;
  }
}
