/**
 * The messages exchanged with the generator worker.
 *
 * Everything here is plain data so it survives structured cloning. `requestId`
 * exists because a student can change a course while a search is running: the
 * client bumps the id, and results tagged with a stale one are dropped instead
 * of racing the new search.
 */
import type { ChosenTimes, CourseSectionLists, SchedulePermutation } from '../types';

export interface GenerateRequest {
  type: 'generate';
  requestId: number;
  courses: CourseSectionLists;
  chosenTimes: ChosenTimes;
  /** 0 for the normal search; 1..10 for the conflict resolver's escalation. */
  maxSolutions: number;
}

export interface CancelRequest {
  type: 'cancel';
  requestId: number;
}

export type GeneratorRequest = GenerateRequest | CancelRequest;

export interface ProgressResponse {
  type: 'progress';
  requestId: number;
  permutations: SchedulePermutation[];
  total: number;
}

export interface DoneResponse {
  type: 'done';
  requestId: number;
  total: number;
  /** False when a newer request superseded this one. */
  completed: boolean;
}

export interface ErrorResponse {
  type: 'error';
  requestId: number;
  message: string;
}

export type GeneratorResponse = ProgressResponse | DoneResponse | ErrorResponse;
