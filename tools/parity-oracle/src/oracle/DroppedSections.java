package oracle;

import edu.wpi.scheduler.client.SchedXMLParser;
import edu.wpi.scheduler.client.controller.StudentSchedule;
import edu.wpi.scheduler.client.generator.ScheduleProducer;
import edu.wpi.scheduler.client.permutation.PermutationController;
import edu.wpi.scheduler.shared.model.Course;
import edu.wpi.scheduler.shared.model.Department;
import edu.wpi.scheduler.shared.model.DayOfWeek;
import edu.wpi.scheduler.shared.model.Period;
import edu.wpi.scheduler.shared.model.ScheduleDB;
import edu.wpi.scheduler.shared.model.ScheduleDB;
import edu.wpi.scheduler.shared.model.Section;
import edu.wpi.scheduler.shared.model.Term;
import edu.wpi.scheduler.shared.model.TimeCell;
import java.io.File;
import java.util.List;
import java.util.Map;
import javax.xml.parsers.DocumentBuilderFactory;

/**
 * Lists the open sections of a course that the legacy search silently discards
 * because one of their half-hour blocks falls outside the Mon-Fri 8:00-18:00
 * chosen-times grid, with every cell of that grid selected.
 *
 * This is the §10.5 boundary question made countable: each section listed here
 * is one the old app could never put in a schedule.
 */
public final class DroppedSections {

  public static void main(String[] args) throws Exception {
    ScheduleDB catalog = loadCatalog(new File(args[0]));

    for (int i = 1; i < args.length; i++) {
      report(catalog, args[i].trim());
    }
  }

  private static void report(ScheduleDB catalog, String courseName) {
    Course course = findCourse(catalog, courseName);

    StudentSchedule schedule = new StudentSchedule();
    schedule.addCourse(course, null);
    ScheduleProducer producer = new ScheduleProducer(new PermutationController(schedule));

    int open = 0;
    int dropped = 0;

    for (Section section : course.sections) {
      if (!section.hasAvailableSats()) {
        continue;
      }
      open++;

      Map<Term, List<TimeCell>> conflicts = producer.getTimeConflicts(section);
      boolean hasConflict = false;
      for (Term term : section.getTerms()) {
        if (!conflicts.get(term).isEmpty()) {
          hasConflict = true;
        }
      }
      if (!hasConflict) {
        continue;
      }

      dropped++;
      System.out.println("  " + courseName + " " + section.number + " (crn " + section.crn
          + ", " + section.term + "): " + describePeriods(section));
    }

    System.out.println(courseName + ": " + dropped + " of " + open
        + " open sections are unschedulable in the old app");
    System.out.println();
  }

  private static String describePeriods(Section section) {
    StringBuilder description = new StringBuilder();
    for (Period period : section.periods) {
      if (description.length() > 0) {
        description.append("; ");
      }
      for (DayOfWeek day : period.days) {
        description.append(day.getShortName()).append(" ");
      }
      description.append(period.startTime.toString()).append("-").append(period.endTime.toString());
    }
    return description.length() == 0 ? "(no periods)" : description.toString();
  }

  private static ScheduleDB loadCatalog(File schedb) throws Exception {
    DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
    factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
    org.w3c.dom.Document dom = factory.newDocumentBuilder().parse(schedb);
    return new SchedXMLParser().parse(W3cXml.document(dom));
  }

  private static Course findCourse(ScheduleDB catalog, String courseName) {
    for (Department department : catalog.departments) {
      for (Course course : department.courses) {
        if (course.toAbbreviation().equals(courseName)) {
          return course;
        }
      }
    }
    throw new IllegalArgumentException("No course " + courseName + " in this catalogue.");
  }
}
