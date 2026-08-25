package com.google.gwt.user.client;

/**
 * Never-firing stand-in for GWT's Timer.
 *
 * ConflictController uses a timer only to pre-warm its conflict cache. With the
 * cache left empty, hasConflicts falls through to hasConflictsNoCache on every
 * call, which is the same answer by a slower route.
 */
public abstract class Timer {
  public abstract void run();

  public void scheduleRepeating(int periodMillis) {}

  public void cancel() {}
}
