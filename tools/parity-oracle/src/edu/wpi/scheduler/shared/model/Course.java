package edu.wpi.scheduler.shared.model;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * Course has a list of sections available
 */
@SuppressWarnings("serial")
public class Course implements Serializable {
	
	/** Department this course is apart of */
	public Department department;
	/** Name of the course; e.g. Calculus III */
	public String name;
	/** Course number; e.g. 2102 */ 
	public String number;
	/** List of sections available for this course */
	public List<Section> sections = new ArrayList<Section>();
	public String description;
	
	/**
	 * Constructs a course with a reference to the department it is apart of
	 * @param department Department of this course
	 */
	public Course(Department department) {
		this.department = department;
	}
	
	/**
	 * Default course constructor without Department reference
	 * Needed for the GWT RPC to deserialize properly
	 */
	public Course(){}
	
	@Override
	public String toString(){
		return this.name + " (" + toAbbreviation() + ")";
	}
	
	public String toAbbreviation(){
		return this.department.abbreviation + this.number;
	}
	
	public boolean hasAvailableSeats(){
		for (Section section : sections) {
			if(section.hasAvailableSats())
				return true;
		}
		return false;
	}
	
	public boolean hasAvailableSeatsForTerm(String term){
		for (Section section : sections) {
			if (section.hasAvailableSats() && section.term.charAt(0) == term.charAt(0)) return true;
			else if (section.hasAvailableSats() && section.term.substring(8).charAt(0) == term.charAt(0)) return true;
		}
		return false;
	}
	
	public boolean hasAvailableWaitlist(){
		for (Section section : sections) {
			if(section.hasAvailableWaitlist())
				return true;
		}
		return false;
	}
	
	public boolean hasAvailableWaitlistForTerm(String term){
		for (Section section : sections) {
			if(section.hasAvailableWaitlist() && section.term.charAt(0) == term.charAt(0)) return true;
			else if (section.hasAvailableWaitlist() && section.term.substring(8).charAt(0) == term.charAt(0)) return true;
		}
		return false;
	}
}
