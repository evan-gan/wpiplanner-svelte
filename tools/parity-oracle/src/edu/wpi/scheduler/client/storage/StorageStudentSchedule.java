package edu.wpi.scheduler.client.storage;

import edu.wpi.scheduler.client.controller.StudentSchedule;

/** No-op persistence: the oracle starts from an empty schedule every run. */
public class StorageStudentSchedule {
  public static void saveSchedule(StudentSchedule schedule) {}

  public static void saveFavorites(StudentSchedule schedule) {}
}
