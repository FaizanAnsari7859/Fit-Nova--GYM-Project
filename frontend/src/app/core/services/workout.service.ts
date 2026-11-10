import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { User } from '../models/auth.models';

export interface Exercise {
  name: string;
  sets: number;
  reps: number;
  weight?: string;
}

export type WorkoutStatus = 'assigned' | 'in-progress' | 'completed';

export interface Workout {
  _id: string;
  workoutName: string;
  description: string;
  category: string;
  duration: number;
  schedule?: string;
  exercises?: Exercise[];
  status: WorkoutStatus;
  completedAt?: string | null;
  assignedMember: User;
  assignedTrainer: User;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkoutFilters {
  search?: string;
  status?: string;
  category?: string;
  memberId?: string;
  trainerId?: string;
}

export interface CreateWorkoutPayload {
  workoutName: string;
  description: string;
  category: string;
  duration: number;
  schedule?: string;
  exercises?: Exercise[];
  assignedMember: string;
  assignedTrainer: string;
}

export interface UpdateWorkoutPayload {
  workoutName?: string;
  description?: string;
  category?: string;
  duration?: number;
  schedule?: string;
  exercises?: Exercise[];
  status?: WorkoutStatus;
  assignedMember?: string;
  assignedTrainer?: string;
}

@Injectable({ providedIn: 'root' })
export class WorkoutService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  getWorkouts(filters: WorkoutFilters = {}): Observable<Workout[]> {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.status) params = params.set('status', filters.status);
    if (filters.category) params = params.set('category', filters.category);
    if (filters.memberId) params = params.set('memberId', filters.memberId);
    if (filters.trainerId) params = params.set('trainerId', filters.trainerId);

    return this.http
      .get<{ success: boolean; count: number; data: Workout[] }>(`${this.apiUrl}/workouts`, {
        params,
      })
      .pipe(map((r) => r.data));
  }

  getWorkoutById(id: string): Observable<Workout> {
    return this.http
      .get<{ success: boolean; data: Workout }>(`${this.apiUrl}/workouts/${id}`)
      .pipe(map((r) => r.data));
  }

  createWorkout(payload: CreateWorkoutPayload): Observable<Workout> {
    return this.http
      .post<{ success: boolean; data: Workout }>(`${this.apiUrl}/workouts`, payload)
      .pipe(map((r) => r.data));
  }

  updateWorkout(id: string, payload: UpdateWorkoutPayload): Observable<Workout> {
    return this.http
      .patch<{ success: boolean; data: Workout }>(`${this.apiUrl}/workouts/${id}`, payload)
      .pipe(map((r) => r.data));
  }

  updateWorkoutStatus(id: string, status: WorkoutStatus): Observable<Workout> {
    return this.http
      .patch<{ success: boolean; data: Workout }>(`${this.apiUrl}/workouts/${id}/status`, { status })
      .pipe(map((r) => r.data));
  }

  deleteWorkout(id: string): Observable<void> {
    return this.http
      .delete<{ success: boolean }>(`${this.apiUrl}/workouts/${id}`)
      .pipe(map(() => void 0));
  }
}

