package com.google.gwt.storage.client;

/**
 * Always-absent localStorage. Returning null is the browser's own
 * "storage unsupported" path, which leaves the student's chosen times at the
 * constructor default: every cell of the Mon-Fri 8:00-18:00 grid selected.
 */
public class Storage {
  public static Storage getLocalStorageIfSupported() {
    return null;
  }

  public String getItem(String key) {
    return null;
  }

  public void setItem(String key, String value) {}
}
