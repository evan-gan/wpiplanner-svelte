package com.google.gwt.core.client;

public class JsArrayString extends JavaScriptObject {
  protected JsArrayString() {}

  public final native String get(int index);

  public final native int length();

  public final native void set(int index, String value);

  public final native void setLength(int length);
}
