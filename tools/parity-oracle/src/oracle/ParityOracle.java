package oracle;

import edu.wpi.scheduler.client.SchedXMLParser;
import edu.wpi.scheduler.client.controller.SchedulePermutation;
import edu.wpi.scheduler.client.controller.StudentSchedule;
import edu.wpi.scheduler.client.generator.ScheduleProducer;
import edu.wpi.scheduler.client.permutation.PermutationController;
import edu.wpi.scheduler.shared.model.Course;
import edu.wpi.scheduler.shared.model.DayOfWeek;
import edu.wpi.scheduler.shared.model.Department;
import edu.wpi.scheduler.shared.model.ScheduleDB;
import edu.wpi.scheduler.shared.model.Section;
import edu.wpi.scheduler.shared.model.Term;
import edu.wpi.scheduler.shared.model.Time;
import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import javax.xml.parsers.DocumentBuilderFactory;

/**
 * Runs the original GWT ScheduleProducer off-browser over a .schedb export and
 * prints the schedule count for each course set named on the command line.
 *
 * The point is to check the Svelte port's search against the code it was ported
 * from, over the same catalogue, without a browser in the loop. Every class that
 * decides how many schedules exist -- the producer, the conflict controller, the
 * model, the XML parser -- is the original file, unmodified.
 *
 * Usage: ParityOracle [--out-of-grid-open] <path to .schedb> <set> [<set> ...]
 *   where a set is comma-separated, e.g. "CS2102" or "CS1004,MA1020".
 */
public final class ParityOracle {

  /**
   * The old UI generated in batches of 30 steps and stopped once a batch left it
   * past 300 schedules, so the number a student saw depends on both constants.
   */
  private static final int STEPS_PER_BATCH = 30;
  private static final int PERMUTATION_LIMIT = 300;

  public static void main(String[] args) throws Exception {
    boolean outOfGridOpen = args.length > 0 && args[0].equals("--out-of-grid-open");
    int firstArgument = outOfGridOpen ? 1 : 0;

    if (args.length - firstArgument < 2) {
      System.err.println("Usage: ParityOracle [--out-of-grid-open] <schedb> <dept+number,...> [...]");
      System.exit(2);
    }

    ScheduleDB catalog = loadCatalog(new File(args[firstArgument]));

    System.out.println(outOfGridOpen
        ? "Chosen times: Mon-Fri 8:00-18:00 selected, cells outside the grid treated as available"
        : "Chosen times: the legacy default -- every cell of the Mon-Fri 8:00-18:00 grid selected");
    System.out.println();

    for (int i = firstArgument + 1; i < args.length; i++) {
      reportCourseSet(catalog, args[i].split(","), outOfGridOpen);
    }
  }

  /** Parses the export with the original parser, over a JDK DOM tree. */
  private static ScheduleDB loadCatalog(File schedb) throws Exception {
    DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
    // The export declares no DTD, but keep the parser from reaching the network
    // if a future one does.
    factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);

    org.w3c.dom.Document dom = factory.newDocumentBuilder().parse(schedb);
    return new SchedXMLParser().parse(W3cXml.document(dom));
  }

  private static void reportCourseSet(
      ScheduleDB catalog, String[] courseNames, boolean outOfGridOpen) {
    StudentSchedule schedule = new StudentSchedule();
    List<String> descriptions = new ArrayList<String>();

    for (String courseName : courseNames) {
      Course course = findCourse(catalog, courseName.trim());
      schedule.addCourse(course, null);

      descriptions.add(courseName.trim() + " (" + openSectionCount(course) + "/"
          + course.sections.size() + " open)");
    }

    if (outOfGridOpen) {
      openEveryCell(schedule);
    }

    ScheduleProducer producer = new ScheduleProducer(new PermutationController(schedule));

    int cappedCount = runToUiLimit(producer);
    boolean exhausted = !producer.canGenerate();
    int totalCount = producer.getPermutations().size();
    while (producer.canGenerate()) {
      producer.step();
      totalCount = producer.getPermutations().size();
    }

    System.out.println(String.join(" + ", descriptions));
    System.out.println("  schedules (as the old UI reports them): " + cappedCount
        + (exhausted ? "" : "  [stopped at the 300 cap]"));
    if (!exhausted) {
      System.out.println("  schedules (search run to exhaustion):  " + totalCount);
    }
    System.out.println("  sections per schedule: " + sectionsPerSchedule(producer));
    System.out.println();
  }

  /**
   * Selects every half-hour cell of all seven days, so no period can fall on an
   * unselected one.
   *
   * The legacy chosen-times map holds Monday-Friday 8:00-17:30 and nothing else,
   * which is what makes an evening period read as blocked and a weekend period
   * throw. Widening the map is how the rewrite's "outside the grid counts as
   * available" rule looks to the unmodified producer.
   */
  private static void openEveryCell(StudentSchedule schedule) {
    for (Term term : Term.values()) {
      HashMap<DayOfWeek, List<Time>> weekTimes = new HashMap<DayOfWeek, List<Time>>();

      for (DayOfWeek day : DayOfWeek.values()) {
        List<Time> dayTimes = new ArrayList<Time>();
        for (int hour = 0; hour < 24; hour++) {
          dayTimes.add(new Time(hour, 0));
          dayTimes.add(new Time(hour, 30));
        }
        weekTimes.put(day, dayTimes);
      }

      schedule.studentTermTimes.getTimesForTerm(term).set(weekTimes);
    }
  }

  /** Steps the producer the way PermutationController.generateSchedules does. */
  private static int runToUiLimit(ScheduleProducer producer) {
    while (true) {
      for (int step = 0; step < STEPS_PER_BATCH && producer.canGenerate(); step++) {
        producer.step();
      }

      int count = producer.getPermutations().size();
      if (!producer.canGenerate() || count > PERMUTATION_LIMIT) {
        return count;
      }
    }
  }

  private static String sectionsPerSchedule(ScheduleProducer producer) {
    List<SchedulePermutation> permutations = producer.getPermutations();
    if (permutations.isEmpty()) {
      return "n/a";
    }

    int smallest = Integer.MAX_VALUE;
    int largest = 0;
    for (SchedulePermutation permutation : permutations) {
      smallest = Math.min(smallest, permutation.sections.size());
      largest = Math.max(largest, permutation.sections.size());
    }
    return smallest == largest ? String.valueOf(smallest) : smallest + "-" + largest;
  }

  private static int openSectionCount(Course course) {
    int open = 0;
    for (Section section : course.sections) {
      if (section.hasAvailableSats()) {
        open++;
      }
    }
    return open;
  }

  /** @param courseName department abbreviation then number, e.g. "CS2102" */
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
