package edu.wpi.scheduler.client.permutation;

import edu.wpi.scheduler.client.controller.StudentSchedule;

/**
 * Stand-in for the real controller, which is a GWT widget.
 *
 * ScheduleProducer reads exactly one thing from it, so that is all this holds.
 */
public class PermutationController {
  public final StudentSchedule studentSchedule;

  public PermutationController(StudentSchedule studentSchedule) {
    this.studentSchedule = studentSchedule;
  }
}
